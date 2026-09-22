// Lokale Sichtprüfung mit dem synthetischen Pages-Artefakt. Kein Target-Server.
import http from "node:http";
import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { safeReturnPath } from "../api/google-hosting.mjs";

const root = await realpath(fileURLToPath(new URL("../dist/pages/", import.meta.url)));
const port = Number(process.env.HOSPITATION_PREVIEW_PORT || 4187);
const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json" };
const server = http.createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405); response.end(); return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      response.writeHead(404); response.end(); return;
    }
    const application = pathname === "/start" || safeReturnPath(pathname) === pathname;
    const relative = application ? "versorgungs-kompass.html" : pathname.replace(/^\/+/, "") || "index.html";
    let filename = path.resolve(root, relative);
    if (!filename.startsWith(`${root}${path.sep}`)) throw new Error("Invalid path");
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, "index.html");
    if (!(await realpath(filename)).startsWith(`${root}${path.sep}`)) throw new Error("Invalid path");
    let content = await readFile(filename);
    if (filename.endsWith("/versorgungs-kompass.html")) {
      content = Buffer.from(content.toString().replace(/(href|src|srcset)="\.\//g, '$1="/'));
    } else if (filename.endsWith("/versorgungs-kompass.js")) {
      content = Buffer.from(content.toString().replaceAll('"./public/', '"/public/'));
    } else if (filename.endsWith("/data/runtime-config.js")) {
      content = Buffer.from(`${content}\nwindow.VERSORGUNGS_COMPASS_CONFIG = Object.freeze({ ...window.VERSORGUNGS_COMPASS_CONFIG, cleanUrls: true });\n`);
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404); response.end("Nicht gefunden.");
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Lokale Vorschau mit Testdaten: http://127.0.0.1:${port}/hospitationskompass`);
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  server.closeAllConnections();
  server.close();
});
