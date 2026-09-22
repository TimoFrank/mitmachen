import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writePrivate } from "../offline-copy/archive.mjs";

const exec = promisify(execFile);
const LABEL = "de.versorgungs-kompass.local";
const xml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export async function configureAutostart(root) {
  if (process.platform !== "darwin") throw new Error("Autostart ist nur für macOS vorgesehen.");
  root = await fs.realpath(root);
  const config = JSON.parse(await fs.readFile(path.join(root, "config.json"), "utf8"));
  if (!config.syncEnabled || !config.instanceId) throw new Error("Geprüfte lokale Installation fehlt.");
  const directory = path.join(os.homedir(), "Library/LaunchAgents");
  await fs.mkdir(directory, { recursive: true });
  const filename = path.join(directory, `${LABEL}.plist`);
  try {
    const previous = await fs.readFile(filename, "utf8");
    if (!previous.includes(`<string>${LABEL}</string>`) || !previous.includes("/tools/local-app/control.mjs")) throw new Error("Vorhandener Autostart gehört nicht zu dieser Installation.");
    await exec("/bin/launchctl", ["bootout", `gui/${process.getuid()}/${LABEL}`]).catch(() => {});
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const argumentsXml = ["/opt/homebrew/bin/node", path.join(root, "program/tools/local-app/control.mjs"), "start", "--root", root].map(value => `<string>${xml(value)}</string>`).join("");
  const log = path.join(root, "autostart.log");
  const handle = await fs.open(log, "a", 0o600); await handle.close();
  await writePrivate(filename, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array>${argumentsXml}</array><key>RunAtLoad</key><true/><key>WorkingDirectory</key><string>${xml(root)}</string><key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string></dict></plist>\n`);
  await exec("/usr/bin/plutil", ["-lint", filename]);
  await exec("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, filename]);
  return filename;
}
