import { readFile, stat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { assertGoogleBrowserMutation, setSessionCookie } from "./google-session.mjs";

const compress = promisify(gzip);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".pdf": "application/pdf" };
const publicFiles = new Map([
  ["/", "public-index.html"],
  ["/anmelden", "public/auth/index.html"],
  ["/konto/passwort-festlegen", "public/auth/konto/passwort-festlegen/index.html"],
  ...["portal-config.js", "assets/app.js", "assets/app.css", "assets/action.js", "assets/action.css", "brand/versorgungs-kompass.svg"].map((name) => [`/public/auth/${name}`, `public/auth/${name}`]),
  ["/public/media/social/mitmachen-share-v3.png", "public/media/social/mitmachen-share-v3.png"]
]);
const appRoutes = [
  /^\/(?:start|onboarding|formate|teams)\/?$/u,
  /^\/versorgung(?:\/(?:karte|kontakte|organisationen|auswertung|datenqualitaet|aktivitaeten))?\/?$/u,
  /^\/stakeholder(?:\/(?:patienten|politik|presse|expertenkreis|kassenaerztliche-vereinigungen|krankenkassen|patientenverbaende|krankenhausgesellschaften|aerztliche-berufsverbaende))?\/?$/u,
  /^\/hospitationen(?:\/(?:framework|beobachtungen|muster|dashboard|fragebogen))?\/?$/u,
  /^\/profil(?:\/(?:benachrichtigungen|einstellungen|aenderungen|ueber-die-app|importe\/(?:registrierungen|dateiimport|online-erfassung|historie)))?\/?$/u,
  /^\/personen\/(?:versorgung|expertenkreis|stakeholder|patienten|politik|presse)\/[^/]+\/?$/u,
  /^\/organisationen\/(?:versorgung|expertenkreis|patienten|stakeholder|presse)\/[^/]+\/?$/u
];

export function safeReturnPath(value = "/start") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(value)) return "/start";
  const parsed = new URL(value, "https://return.invalid");
  return parsed.origin === "https://return.invalid" && (appRoutes.some((rule) => rule.test(parsed.pathname)) || ["/versorgungs-kompass.html", "/mac-abgleich"].includes(parsed.pathname))
    ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/start";
}

function json(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function body(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 20_000) throw Object.assign(new Error("Anfrage zu groß."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch { throw Object.assign(new Error("Ungültige Anfrage."), { status: 400 }); }
}

export function createGoogleHostingHandler({ apiHandler, resolveProfile, sessions, state, origin, root, aliases = [], cutoverMode = "closed", cartoBasemapApiKey = "", macSyncHandler = null }) {
  const canonical = new URL(origin);
  const configuredDirectory = path.resolve(root);
  if (!["closed", "open"].includes(cutoverMode)) throw new Error("GOOGLE_CUTOVER_MODE muss closed oder open sein.");
  if (typeof cartoBasemapApiKey !== "string" || cartoBasemapApiKey.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(cartoBasemapApiKey)) throw new Error("Ungültige CARTO-Konfiguration.");
  if (cutoverMode === "open" && !cartoBasemapApiKey) throw new Error("Vor der Freigabe den CARTO-Kartenschlüssel einrichten.");
  return async function googleHosting(request, response) {
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("vary", "Cookie, Origin, Accept-Encoding");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    try {
      const directory = await realpath(configuredDirectory);
      const rawPath = String(request.url || "").split("?")[0];
      if (/%(?:2f|5c|00)/iu.test(rawPath) || rawPath.includes("\\") || rawPath.split("/").some((part) => [".", ".."].includes(decodeURIComponent(part)))) {
        return json(response, 400, { error: "Ungültiger Pfad." });
      }
      const url = new URL(request.url, origin);
      const host = String(request.headers.host || "").split(":")[0];
      if (aliases.includes(host)) {
        response.writeHead(308, { location: `${canonical.origin}${url.pathname}${url.search}` });
        return response.end();
      }
      if (url.pathname === "/api/auth/session" && request.method === "POST") {
        assertGoogleBrowserMutation(request, origin);
        if (!(await state.consume("session:global", 60, 300_000))) return json(response, 429, { error: "Bitte versuche es später erneut." });
        const input = await body(request);
        if (Object.keys(input).some((key) => key !== "idToken")) return json(response, 400, { error: "Ungültige Anfrage." });
        const result = await sessions.create(input.idToken);
        setSessionCookie(response, result.cookie, result.seconds);
        return json(response, 200, { ok: true });
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        assertGoogleBrowserMutation(request, origin);
        await sessions.logout(request);
        setSessionCookie(response, "", 0);
        return json(response, 200, { ok: true });
      }
      if (url.pathname.startsWith("/api/") || ["/healthz", "/readyz"].includes(url.pathname)) {
        const publicProbe = ["/healthz", "/readyz", "/api/healthz", "/api/readyz"].includes(url.pathname);
        if (cutoverMode !== "open" && !publicProbe) return json(response, 503, { error: "Die neue Umgebung ist noch nicht freigegeben." });
        if (macSyncHandler && url.pathname.startsWith("/api/mac-sync/")) return await macSyncHandler(request, response);
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertGoogleBrowserMutation(request, origin);
        return await apiHandler(request, response);
      }
      if (!["GET", "HEAD"].includes(request.method)) return json(response, 405, { error: "Methode nicht erlaubt." });
      let relative = publicFiles.get(url.pathname);
      if (!relative) {
        try { await resolveProfile(request); }
        catch (error) {
          if (error.status === 401) {
            response.writeHead(302, { location: `/anmelden?return=${encodeURIComponent(safeReturnPath(`${url.pathname}${url.search}`))}` });
            return response.end();
          }
          throw error;
        }
        if (url.pathname.startsWith("/public/auth/")) return json(response, 404, { error: "Nicht gefunden." });
        relative = url.pathname === "/mac-abgleich" ? "mac-sync.html" : appRoutes.some((rule) => rule.test(url.pathname)) ? "versorgungs-kompass.html" : decodeURIComponent(url.pathname).slice(1);
      }
      if (!relative || relative.split("/").some((part) => part.startsWith("."))) return json(response, 404, { error: "Nicht gefunden." });
      let filename = path.resolve(directory, relative);
      if (!filename.startsWith(`${directory}${path.sep}`)) return json(response, 404, { error: "Nicht gefunden." });
      let details;
      try {
        details = await stat(filename);
        if (details.isDirectory()) filename = path.join(filename, "index.html");
        if (!(await realpath(filename)).startsWith(`${directory}${path.sep}`)) return json(response, 404, { error: "Nicht gefunden." });
      } catch { return json(response, 404, { error: "Nicht gefunden." }); }
      const login = url.pathname === "/anmelden";
      response.setHeader("cross-origin-opener-policy", login ? "same-origin-allow-popups" : "same-origin");
      response.setHeader("cross-origin-resource-policy", "same-origin");
      response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
      response.setHeader("content-security-policy", login
        ? "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' https://apis.google.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src 'self'; font-src 'none'"
        : "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src 'self'; worker-src 'self' blob:");
      const type = mime[path.extname(filename)] || "application/octet-stream";
      let bytes = await readFile(filename);
      if (relative === "data/runtime-config.js") {
        // Der domainbeschränkte Browser-Schlüssel kommt erst zur Laufzeit hinzu.
        // Die Datei bleibt profilgeschützt und das Image enthält keinen Schlüssel.
        bytes = Buffer.concat([bytes, Buffer.from(`\nwindow.VERSORGUNGS_COMPASS_CONFIG = Object.freeze({ ...window.VERSORGUNGS_COMPASS_CONFIG, cartoBasemapApiKey: ${JSON.stringify(cartoBasemapApiKey)}, macSyncEnabled: ${Boolean(macSyncHandler)} });\n`)]);
      }
      response.setHeader("content-type", type);
      if (/\bgzip\b/u.test(String(request.headers["accept-encoding"] || "")) && bytes.length > 1024 && /^(?:text\/|application\/(?:json|javascript)|image\/svg)/u.test(type)) {
        bytes = await compress(bytes);
        response.setHeader("content-encoding", "gzip");
      }
      response.setHeader("content-length", bytes.length);
      response.writeHead(200);
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      const status = [400, 401, 403, 413, 429, 503].includes(error.status) ? error.status : 503;
      if (status >= 500) console.error(JSON.stringify({ severity: "ERROR", event: "google_hosting_request_error", status, errorClass: error?.constructor?.name || "Error" }));
      if (!response.headersSent) json(response, status, { error: status === 403 ? "Für dieses Konto ist der Zugriff nicht freigegeben." : "Die Anfrage konnte nicht sicher abgeschlossen werden." });
      else response.destroy();
    }
  };
}
