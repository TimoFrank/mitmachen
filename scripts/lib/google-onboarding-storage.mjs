import { execFileSync } from "node:child_process";
import { demand } from "./google-onboarding-contract.mjs";

// Only the dedicated operator bucket is used; tokens and response bodies are
// deliberately excluded from errors. Every mutation is generation-bound.
export function createOnboardingStorage({ bucket, project, fetchImpl = fetch, tokenProvider = () => {
  try {
    return execFileSync("gcloud", ["auth", "print-access-token", `--project=${project}`, "--quiet"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }).trim();
  } catch { throw new Error("Das kurzlebige Operator-Token ist nicht verfügbar."); }
} }) {
  demand(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(project)
    && /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucket) && bucket.startsWith(`${project}-`), "Der Operator-Bucket ist ungültig.");
  function objectPath(name) {
    demand(name === "locks/onboarding.json" || /^results\/vk-onboard-[a-f0-9-]+\.json$/u.test(name), "Ungültiger Operator-Objektpfad.");
    return `/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;
  }
  async function request(url, init = {}, statuses = [200]) {
    const token = await tokenProvider();
    demand(typeof token === "string" && token.length >= 20 && !/\s/u.test(token), "Ungültiges Operator-Token.");
    let response;
    try { response = await fetchImpl(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(30_000) }); }
    catch { throw new Error("Die Operator-Speicheroperation konnte nicht bestätigt werden."); }
    demand(statuses.includes(response.status), "Die generationengebundene Operator-Speicheroperation wurde abgewiesen.");
    if (response.status === 404 || response.status === 204) return null;
    let text = "";
    let size = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      demand(size <= 128 * 1024, "Der Operator-Nachweis ist zu groß.");
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new Error("Der Operator-Speicher lieferte kein gültiges JSON."); }
  }
  function metadata(value, name) {
    demand(value?.bucket === bucket && value.name === name && /^[1-9][0-9]*$/u.test(String(value.generation))
      && Number(value.size) > 0 && Number(value.size) <= 128 * 1024, "Der Operator-Objektvertrag stimmt nicht überein.");
    return String(value.generation);
  }
  return Object.freeze({
    async read(name) {
      const url = `https://storage.googleapis.com${objectPath(name)}`;
      const meta = await request(url, {}, [200, 404]);
      if (!meta) return null;
      const generation = metadata(meta, name);
      const value = await request(`${url}?alt=media&generation=${generation}`);
      return { generation, value };
    },
    async create(name, value) {
      objectPath(name);
      const body = JSON.stringify(value);
      demand(Buffer.byteLength(body) <= 128 * 1024, "Der Operator-Nachweis ist zu groß.");
      const meta = await request(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(name)}`,
        { method: "POST", body });
      return { generation: metadata(meta, name), value };
    },
    async remove(name, generation) {
      demand(/^[1-9][0-9]*$/u.test(String(generation)), "Die Objektgeneration fehlt.");
      await request(`https://storage.googleapis.com${objectPath(name)}?ifGenerationMatch=${generation}`, { method: "DELETE" }, [204]);
    }
  });
}
