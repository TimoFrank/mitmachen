import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const documentRoot = path.join(projectRoot, "dist");
const port = Number.parseInt(process.env.IDENTITY_PORTAL_PORT || "4174", 10);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath =
    requestUrl.pathname === "/" || requestUrl.pathname === "/anmelden"
      ? "/index.html"
      : requestUrl.pathname === "/konto/passwort-festlegen"
        ? "/konto/passwort-festlegen/index.html"
        : requestUrl.pathname.startsWith("/public/auth/")
          ? requestUrl.pathname.slice("/public/auth".length)
          : requestUrl.pathname;
  const resolved = path.resolve(documentRoot, `.${requestedPath}`);
  const candidate =
    existsSync(resolved) && statSync(resolved).isDirectory()
      ? path.join(resolved, "index.html")
      : resolved;

  if (
    !candidate.startsWith(`${documentRoot}${path.sep}`) ||
    !existsSync(candidate) ||
    !statSync(candidate).isFile()
  ) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Nicht gefunden");
    return;
  }

  const extension = path.extname(candidate);
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN"
  });
  createReadStream(candidate).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Identity portal preview: http://127.0.0.1:${port}/?preview=signin`);
});
