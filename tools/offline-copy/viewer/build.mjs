import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const source = (name) => readFile(new URL(name, import.meta.url), "utf8");
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const hash = (value) => createHash("sha256").update(value).digest("base64");

/** Build a portable, read-only HTML artifact. No private data is written by this module. */
export async function buildOfflineHtml({ snapshot, assets = [], refreshStatus = {} } = {}) {
  if (!snapshot || !snapshot.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data)) {
    throw new TypeError("Die Lesekopie benötigt einen Snapshot mit einer Datentabelle je Schlüssel.");
  }
  for (const [name, rows] of Object.entries(snapshot.data)) {
    if (!Array.isArray(rows)) throw new TypeError(`Die Tabelle ${name} ist kein Array.`);
  }
  if (!Array.isArray(assets)) throw new TypeError("Die Dateiliste muss ein Array sein.");
  for (const asset of assets) {
    if (!asset || typeof asset.relativePath !== "string" || !/^assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.relativePath) || asset.relativePath.includes("..")) {
      throw new TypeError("Gesicherte Dateien benötigen einen sicheren relativen Pfad unter assets/.");
    }
  }
  const [styles, script] = await Promise.all([source("viewer.css"), source("viewer.js")]);
  const data = JSON.stringify({ snapshot, assets, refreshStatus })
    .replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  const policy = [
    "default-src 'none'", "connect-src 'none'", "img-src 'self' file: data:",
    `style-src 'sha256-${hash(styles)}'`, `script-src 'sha256-${hash(script)}'`,
    "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'"
  ].join("; ");
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
  <meta name="referrer" content="no-referrer">
  <title>Versorgungs-Kompass · Lokale Lesekopie</title>
  <style>${styles}</style>
</head>
<body>
  <a class="skip-link" href="#main">Zum Inhalt</a>
  <div class="app-shell">
    <aside class="sidebar" aria-label="Bereiche">
      <div class="brand"><span class="brand-mark" aria-hidden="true">✳</span><span>Versorgungs-<br>Kompass</span></div>
      <p class="sidebar-caption">Lokale Lesekopie</p>
      <button id="mobile-menu" class="mobile-menu" type="button" aria-controls="navigation" aria-expanded="false">Bereiche anzeigen</button>
      <nav id="navigation" aria-label="Datensammlungen"></nav>
      <div class="sidebar-footer">Auf diesem Mac gespeichert.<br>Ohne Internet lesbar.</div>
    </aside>
    <main id="main" tabindex="-1">
      <header class="topbar"><div><p class="eyebrow">Gesicherter Datenstand</p><p id="snapshot-time" class="snapshot-time"></p></div><span class="read-only">Nur Lesen</span></header>
      <section class="workspace" aria-labelledby="view-title">
        <div class="page-heading"><div><h1 id="view-title">Übersicht</h1><p id="view-description" class="muted"></p></div></div>
        <div class="search-bar"><label for="search">Daten durchsuchen</label><div class="search-control"><input id="search" type="search" placeholder="Name, Ort, Thema oder Text …" autocomplete="off" spellcheck="false"><button id="clear-search" type="button" hidden>Zurücksetzen</button></div><p id="search-help" class="small muted">Durchsucht alle gespeicherten Bereiche und Felder.</p></div>
        <div id="content"></div>
      </section>
      <footer class="page-footer"><span id="source-label"></span><span>Änderungen erfolgen in der Online-Anwendung. Diese Kopie bleibt unverändert.</span></footer>
    </main>
  </div>
  <dialog id="record-dialog" aria-labelledby="record-title"><div class="detail-header"><div><p id="record-kind" class="eyebrow"></p><h2 id="record-title"></h2></div><button id="close-record" type="button" aria-label="Detailansicht schließen">Schließen</button></div><div class="detail-back-row" id="detail-back-row" hidden><button id="back-record" type="button">Zurück zum vorherigen Eintrag</button></div><div id="record-content" class="detail-body"></div></dialog>
  <p id="announcer" class="visually-hidden" role="status" aria-live="polite"></p>
  <noscript><p class="no-script">Für die Suche und die Datenansicht muss JavaScript im Browser aktiviert sein. Eine Internetverbindung ist nicht erforderlich. Der vollständige Datenstand liegt zusätzlich als JSON-Datei in diesem Ordner.</p></noscript>
  <script id="offline-data" type="application/json">${data}</script>
  <script>${script}</script>
</body>
</html>`;
}
