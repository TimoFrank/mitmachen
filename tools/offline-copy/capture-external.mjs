import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
import { digest } from "./archive.mjs";

function publicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
  }
  // Require global unicast IPv6. This excludes local/mapped/metadata addresses.
  return net.isIPv6(address) && /^[23][0-9a-f]{3}:/i.test(address);
}

async function image(url, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443") || redirects > 4) throw new Error("EXTERNAL_URL_UNSUPPORTED");
  let dnsTimer;
  const addresses = await Promise.race([dns.lookup(parsed.hostname, { all: true }), new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("EXTERNAL_TIMEOUT")), 5000); })]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error("EXTERNAL_ADDRESS_BLOCKED");
  const selected = addresses.find(item => item.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.get(parsed, {
      lookup: (_name, options, callback) => options.all ? callback(null, [selected]) : callback(null, selected.address, selected.family),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif", "User-Agent": "Versorgungs-Kompass-Offline/1.0 (private reading copy)" },
      timeout: 20000,
      signal: AbortSignal.timeout(25000)
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.destroy();
        image(new URL(response.headers.location, parsed).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { response.destroy(); reject(new Error("EXTERNAL_HTTP_" + response.statusCode)); return; }
      const mimeType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (mimeType && !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "application/octet-stream"].includes(mimeType)) { response.destroy(); reject(new Error("EXTERNAL_REFERENCE_NOT_RASTER_IMAGE")); return; }
      const chunks = [];
      let size = 0;
      response.on("data", chunk => { size += chunk.length; if (size > 10 * 1024 * 1024) { response.destroy(); reject(new Error("EXTERNAL_IMAGE_TOO_LARGE")); } else chunks.push(chunk); });
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const detected = bytes.subarray(0, 3).equals(Buffer.from([0xff,0xd8,0xff])) ? "image/jpeg"
          : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
          : /^GIF8[79]a/.test(bytes.subarray(0, 6).toString()) ? "image/gif"
          : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp"
          : bytes.subarray(4, 8).toString() === "ftyp" && /avif|avis/.test(bytes.subarray(8, 32).toString()) ? "image/avif" : "";
        if (!detected) { reject(new Error("EXTERNAL_REFERENCE_NOT_RASTER_IMAGE")); return; }
        resolve({ mimeType: detected, size, sha256: digest(bytes), base64: bytes.toString("base64"), capturedAt: new Date().toISOString() });
      });
      response.on("error", () => reject(new Error("EXTERNAL_READ_FAILED")));
    });
    request.on("timeout", () => { request.destroy(); reject(new Error("EXTERNAL_TIMEOUT")); });
    request.on("error", () => reject(new Error("EXTERNAL_READ_FAILED")));
  });
}

export async function captureExternal(snapshot) {
  const politics = snapshot.externalSources?.bundestagHealthCommittee;
  if (politics?.status === "captured") {
    const rows = politics.payload.members || [];
    snapshot.data.bundestag_health_committee = rows;
    snapshot.counts.bundestag_health_committee = rows.length;
    snapshot.tableHashes.bundestag_health_committee = digest(JSON.stringify(rows));
  }
  const grouped = new Map();
  for (const reference of snapshot.externalAssetReferences || []) {
    if (!grouped.has(reference.sourceUrl)) grouped.set(reference.sourceUrl, []);
    grouped.get(reference.sourceUrl).push(reference);
  }
  const jobs = [...grouped.entries()];
  const captured = [];
  const unavailable = [];
  let offset = 0;
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => {
    while (offset < jobs.length) {
      const [url, references] = jobs[offset++];
      try {
        let asset;
        try { asset = await image(url); }
        catch (first) { if (!["EXTERNAL_READ_FAILED", "EXTERNAL_TIMEOUT"].includes(first.message)) throw first; asset = await image(url); }
        for (const reference of references) captured.push({ ...reference, ...asset });
      } catch (error) {
        const code = /^EXTERNAL_[A-Z_0-9]+$/.test(error.message) ? error.message : "EXTERNAL_READ_FAILED";
        for (const reference of references) unavailable.push({ ...reference, code, checkedAt: new Date().toISOString() });
      }
    }
  }));
  snapshot.assets.push(...captured);
  snapshot.externalAssetResults = { capturedReferences: captured.length, unavailableReferences: unavailable };
  snapshot.completeness.externalAssetsPending = 0;
  snapshot.completeness.externalImagesCaptured = captured.length;
  snapshot.completeness.externalReferencesPreserved = unavailable.length;
  snapshot.completeness.externalImageNote = "Externe Webadressen bleiben vollständig gespeichert. Erreichbare Rasterbilder wurden zusätzlich lokal gesichert; nicht verfügbare Bilder und Webseiten bleiben ausdrücklich gekennzeichnete Webverweise.";
  return snapshot;
}
