import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareArchive, promoteArchive, verifyArchive, privateDirectory, writePrivate, json, digest } from "./archive.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export function command(binary, args, { input = "", timeout = 300000, maxBytes = 512 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" } });
    const buffers = [];
    let length = 0, stopped = false;
    const fail = code => { if (stopped) return; stopped = true; child.kill("SIGTERM"); reject(new Error(code)); };
    const timer = setTimeout(() => fail("SOURCE_TIMEOUT"), timeout);
    child.stdout.on("data", data => { length += data.length; if (length > maxBytes) fail("SOURCE_TOO_LARGE"); else buffers.push(data); });
    // Diagnostics may contain operational data. Only fixed failure codes are persisted.
    child.stderr.on("data", () => {});
    child.on("error", () => { clearTimeout(timer); fail("SOURCE_COMMAND_UNAVAILABLE"); });
    child.on("close", code => { clearTimeout(timer); if (stopped) return; stopped = true; if (code !== 0) reject(new Error("SOURCE_COMMAND_FAILED")); else resolve(Buffer.concat(buffers).toString("utf8")); });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function refresh(root) {
  await privateDirectory(root);
  const lock = path.join(root, ".refresh.lock");
  let handle;
  try { handle = await fs.open(lock, "wx", 0o600); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await fs.readFile(lock, "utf8"));
    const age = Date.now() - (await fs.stat(lock)).mtimeMs;
    if (!pid && age < 10000) throw new Error("REFRESH_ALREADY_RUNNING");
    let running = false;
    if (Number.isInteger(pid) && pid > 1) { try { process.kill(pid, 0); running = true; } catch {} }
    if (running) throw new Error("REFRESH_ALREADY_RUNNING");
    await fs.unlink(lock);
    handle = await fs.open(lock, "wx", 0o600);
  }
  await handle.writeFile(String(process.pid));
  const attemptedAt = new Date().toISOString();
  try {
    const config = JSON.parse(await fs.readFile(path.join(root, "config.json"), "utf8"));
    if (config.toolPath) process.env.PATH = config.toolPath;
    if (!config.context || !config.namespace || !config.deployment || config.sourceUrl !== "https://versorgungs-kompass.de") throw new Error("CONFIG_INVALID");
    const base = ["--context", config.context, "--namespace", config.namespace, "--request-timeout=20s"];
    const deployment = JSON.parse(await command(config.kubectl, [...base, "get", "deployment", config.deployment, "-o", "json"], { timeout: 30000 }));
    const container = deployment.spec.template.spec.containers.find(item => item.name === config.container);
    if (!container || !/@sha256:[a-f0-9]{64}$/.test(container.image)) throw new Error("SOURCE_IMAGE_UNPINNED");
    const ingress = JSON.parse(await command(config.kubectl, [...base, "get", "ingress", "-o", "json"], { timeout: 30000 }));
    const apiRoute = ingress.items.flatMap(item => item.spec.rules || []).filter(rule => rule.host === new URL(config.sourceUrl).hostname).flatMap(rule => rule.http?.paths || []).find(route => route.path === "/api" && route.pathType === "Prefix");
    if (!apiRoute) throw new Error("SOURCE_HOST_MISMATCH");
    const service = JSON.parse(await command(config.kubectl, [...base, "get", "service", apiRoute.backend.service.name, "-o", "json"], { timeout: 30000 }));
    const labels = deployment.spec.template.metadata.labels;
    if (!Object.keys(service.spec.selector || {}).length || Object.entries(service.spec.selector).some(([key, value]) => labels[key] !== value)) throw new Error("SOURCE_DEPLOYMENT_MISMATCH");
    const selector = Object.entries(service.spec.selector).map(([key, value]) => key + "=" + value).join(",");
    const pods = JSON.parse(await command(config.kubectl, [...base, "get", "pods", "-l", selector, "-o", "json"], { timeout: 30000 }));
    const pod = pods.items.find(item => !item.metadata.deletionTimestamp && item.status.phase === "Running" && item.status.containerStatuses?.some(status => status.name === config.container && status.ready && status.imageID.includes("sha256:")));
    if (!pod) throw new Error("SOURCE_POD_NOT_READY");
    const runtime = pod.status.containerStatuses.find(item => item.name === config.container);
    const source = await fs.readFile(path.join(here, "extract-remote.mjs"), "utf8");
    const payload = await command(config.kubectl, [...base, "exec", "-i", "pod/" + pod.metadata.name, "-c", config.container, "--", "node", "--input-type=module", "-"], { input: source, timeout: 600000 });
    const snapshot = JSON.parse(payload);
    if (snapshot.error) throw new Error(snapshot.error.code || "SOURCE_EXTRACTION_FAILED");
    const after = JSON.parse(await command(config.kubectl, [...base, "get", "pod", pod.metadata.name, "-o", "json"], { timeout: 30000 }));
    if (after.metadata.uid !== pod.metadata.uid || after.status.containerStatuses.find(item => item.name === config.container)?.containerID !== runtime.containerID) throw new Error("SOURCE_POD_CHANGED");
    const programFiles = ["archive.mjs", "refresh.mjs", "capture-external.mjs", "extract-remote.mjs", "viewer/build.mjs", "viewer/viewer.js", "viewer/viewer.css"];
    const programHash = digest((await Promise.all(programFiles.map(async file => file + "\n" + await fs.readFile(path.join(here, file), "utf8")))).join("\n"));
    snapshot.sourceRuntime = { context: config.context, namespace: config.namespace, deployment: config.deployment, pod: pod.metadata.name, podUid: pod.metadata.uid, image: runtime.imageID, viewerBaseRevision: config.viewerBaseRevision, viewerProgramHash: programHash };
    if (config.refreshScheduleDescription) snapshot.refreshScheduleDescription = config.refreshScheduleDescription;
    const { captureExternal } = await import("./capture-external.mjs");
    await captureExternal(snapshot);
    const { buildOfflineHtml } = await import("./viewer/build.mjs");
    const archive = await prepareArchive(root, snapshot, buildOfflineHtml);
    const manifest = await promoteArchive(root, archive);
    await writePrivate(path.join(root, "status.json"), json({ ok: true, attemptedAt, finishedAt: new Date().toISOString(), exportedAt: manifest.exportedAt, snapshotId: manifest.snapshotId }));
    return manifest;
  } catch (error) {
    const code = /^[A-Z_]+$/.test(error.message || "") ? error.message : "REFRESH_FAILED";
    await writePrivate(path.join(root, "status.json"), json({ ok: false, attemptedAt, finishedAt: new Date().toISOString(), code, lastSnapshotPreserved: true }));
    throw new Error(code);
  } finally {
    await handle.close();
    await fs.unlink(lock).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = args[args.indexOf("--root") + 1];
  if (!args.includes("--root") || !root) { console.error("Aufruf: node refresh.mjs --root <lokaler Ordner> [--verify]"); process.exitCode = 2; }
  else {
    try {
      const result = args.includes("--verify") ? await verifyArchive(path.join(root, "current")) : await refresh(root);
      console.log(JSON.stringify({ ok: true, exportedAt: result.exportedAt, tables: Object.keys(result.counts).length, counts: result.counts, assetReferences: result.assetReferences, uniqueFiles: result.uniqueFiles }));
    } catch (error) { console.error(JSON.stringify({ ok: false, code: error.message, message: "Aktualisierung nicht abgeschlossen. Der letzte gesicherte Stand bleibt erhalten." })); process.exitCode = 1; }
  }
}
