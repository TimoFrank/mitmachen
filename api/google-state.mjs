import crypto from "node:crypto";

const unavailable = () => Object.assign(new Error("Der Sitzungsschutz ist vorübergehend nicht erreichbar."), { status: 503 });

// A dedicated private bucket provides atomic, cross-instance state. No account
// names, addresses, IPs, tokens or business records are written to object names.
export function createGoogleStateStore({ bucket, now = Date.now }) {
  if (!bucket?.file) throw new TypeError("Ein privater Laufzeit-Bucket ist erforderlich.");
  function key(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
  async function consume(scope, limit, windowMs) {
    const timestamp = now();
    const window = Math.floor(timestamp / windowMs);
    const file = bucket.file(`limits/${key(`${scope}:${windowMs}:${window}`)}.json`);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let generation = 0;
      let count = 0;
      try {
        const [metadata] = await file.getMetadata();
        generation = metadata.generation;
        count = Number(metadata.metadata?.count);
        if (!Number.isSafeInteger(count) || count < 0) throw unavailable();
      } catch (error) {
        if (Number(error.code) !== 404) throw unavailable();
      }
      if (count >= limit) return false;
      try {
        await file.save("", {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: generation },
          metadata: { contentType: "application/octet-stream", cacheControl: "no-store", metadata: { count: String(count + 1) } }
        });
        return true;
      } catch (error) {
        if (Number(error.code) !== 412) throw unavailable();
      }
    }
    throw unavailable();
  }
  return Object.freeze({
    consume,
    async allowReset(email) {
      // A forged forwarding header cannot bypass the global limit.
      return await consume("reset:global", 30, 300_000)
        && await consume("reset:global", 120, 3_600_000)
        && await consume(`reset:account:${key(email)}`, 5, 3_600_000);
    },
    async isRevoked(cookie) {
      try { return (await bucket.file(`revoked/${key(cookie)}`).exists())[0]; }
      catch { throw unavailable(); }
    },
    async revoke(cookie) {
      try {
        await bucket.file(`revoked/${key(cookie)}`).save("", {
          resumable: false, metadata: { cacheControl: "no-store" }
        });
      } catch { throw unavailable(); }
    }
  });
}
