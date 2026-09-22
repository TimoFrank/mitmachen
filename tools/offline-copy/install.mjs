import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { privateDirectory, writePrivate, json } from "./archive.mjs";

const source = path.dirname(fileURLToPath(import.meta.url));
const quote = text => "'" + String(text).replace(/'/g, "'\\''") + "'";
const xml = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function application(location, name, id, script) {
  const contents = path.join(location, "Contents");
  await privateDirectory(path.join(contents, "MacOS"));
  await writePrivate(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>${xml(name)}</string><key>CFBundleDisplayName</key><string>${xml(name)}</string><key>CFBundleIdentifier</key><string>${xml(id)}</string><key>CFBundleExecutable</key><string>launcher</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/></dict></plist>\n`);
  await writePrivate(path.join(contents, "MacOS", "launcher"), "#!/bin/zsh\nset -eu\n" + script + "\n");
  await fs.chmod(path.join(contents, "MacOS", "launcher"), 0o700);
}

export async function install({ root, applications, config }) {
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot.includes("/Desktop/") || resolvedRoot.includes("/Documents/") || resolvedRoot.includes("/CloudStorage/") || resolvedRoot.includes("/Mobile Documents/")) throw new Error("INSTALL_REQUIRES_LOCAL_DIRECTORY");
  await privateDirectory(resolvedRoot);
  const program = path.join(resolvedRoot, "program");
  await privateDirectory(program);
  await privateDirectory(path.join(program, "viewer"));
  for (const name of ["archive.mjs", "refresh.mjs", "extract-remote.mjs", "capture-external.mjs"]) {
    await writePrivate(path.join(program, name), await fs.readFile(path.join(source, name)));
  }
  for (const entry of await fs.readdir(path.join(source, "viewer"), { withFileTypes: true })) {
    if (entry.isFile() && /\.(mjs|js|css|html)$/.test(entry.name)) await writePrivate(path.join(program, "viewer", entry.name), await fs.readFile(path.join(source, "viewer", entry.name)));
  }
  await writePrivate(path.join(resolvedRoot, "config.json"), json(config));
  const updateScript = path.join(resolvedRoot, "Aktualisieren.command");
  await writePrivate(updateScript, `#!/bin/zsh\numask 077\nexport PATH=${quote(config.toolPath || process.env.PATH || "/usr/bin:/bin")}\nprint 'Versorgungs-Kompass: lokale Kopie aktualisieren …'\n${quote(config.node || "node")} ${quote(path.join(program, "refresh.mjs"))} --root ${quote(resolvedRoot)}\nresult=$?\nif [[ $result -eq 0 ]]; then\n  print '\\nDie lokale Kopie ist aktualisiert.'\n  /usr/bin/open ${quote(path.join(resolvedRoot, "current", "index.html"))}\nelse\n  print '\\nAktualisierung nicht möglich. Die letzte gesicherte Kopie bleibt verfügbar.'\n  print 'Prüfe deine Internetverbindung und gegebenenfalls die Google-Cloud-Anmeldung.'\nfi\nprint '\\nZum Schließen Eingabetaste drücken.'\nread -r\nexit $result\n`);
  await fs.chmod(updateScript, 0o700);
  await privateDirectory(applications);
  const openApp = path.join(applications, "Versorgungs-Kompass Offline.app");
  const updateApp = path.join(applications, "Versorgungs-Kompass aktualisieren.app");
  await application(openApp, "Versorgungs-Kompass Offline", "de.versorgungs-kompass.offline-reader", `if [[ ! -f ${quote(path.join(resolvedRoot, "current", "index.html"))} ]]; then\n  /usr/bin/osascript -e 'display alert "Noch keine lokale Kopie" message "Öffne zuerst Versorgungs-Kompass aktualisieren."'\n  exit 1\nfi\nexec /usr/bin/open ${quote(path.join(resolvedRoot, "current", "index.html"))}`);
  await application(updateApp, "Versorgungs-Kompass aktualisieren", "de.versorgungs-kompass.offline-refresh", `exec /usr/bin/open -a Terminal ${quote(updateScript)}`);
  await writePrivate(path.join(resolvedRoot, "LIESMICH.txt"), `VERSORGUNGS-KOMPASS · LOKALE LESEKOPIE\n\nÖffnen: ${openApp}\nAktualisieren: ${updateApp}\n\nDie Lesekopie öffnet ohne Internet, Anmeldung oder lokalen Server.\nSuche und Details arbeiten ausschließlich mit den gesicherten Daten.\nDas sichtbare Sicherungsdatum zeigt, von wann der Stand stammt.\nÄnderungen an der Live-Anwendung werden erst mit einer erfolgreichen\nAktualisierung übernommen. Die Lesekopie kann keine Daten verändern.\n\nDie Daten liegen vollständig außerhalb von iCloud in:\n${resolvedRoot}\n\nDie Aktualisierung verwendet deinen bereits eingerichteten geschützten\nGoogle-Cloud-Zugang. Zugangsdaten werden nicht in die Kopie aufgenommen.\nEin fehlgeschlagener Abruf ersetzt den letzten gültigen Stand nicht.\n\nUnter snapshots stehen die gesicherten Stände samt JSON-Daten, Dateien\nund Prüfsummen. current verweist auf den zuletzt vollständig geprüften Stand.\nDies ist eine Fachdaten-Lesekopie, kein vollständiges Server-Backup.\nKonten-Anmeldung, Berechtigungsverwaltung und Servergeheimnisse gehören\nnicht in die Lesekopie. Weblinks benötigen weiterhin Internet.\n`);
  return { root: resolvedRoot, openApp, updateApp };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  try {
    const config = JSON.parse(await fs.readFile(option("--config"), "utf8"));
    const result = await install({ root: option("--root") || path.join(os.homedir(), "Library/Application Support/Versorgungs-Kompass Offline"), applications: option("--applications") || path.join(os.homedir(), "Applications"), config });
    console.log(JSON.stringify(result));
  } catch (error) { console.error("Installation nicht abgeschlossen: " + (error.code || error.message)); process.exitCode = 1; }
}
