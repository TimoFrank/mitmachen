import { createHash, timingSafeEqual } from "node:crypto";
import { assertGoogleBrowserMutation } from "./google-session.mjs";
import { assertIapExternalAccessWindow, accessScopeForProfile } from "./security-policy.mjs";
import { snapshotForSync, applySyncOperation } from "./mac-sync-database.mjs";
import { syncError } from "./mac-sync-contract.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const matches = (value, digest) => timingSafeEqual(Buffer.from(hash(value)), Buffer.from(digest));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const SECRET = /^[a-f0-9]{64}$/u;
export async function syncJsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4_000_000) throw syncError("SYNC_REQUEST_TOO_LARGE", 413);
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw syncError("SYNC_REQUEST_INVALID", 400); }
}
export function assertSyncAdmin(profile) {
  if (!profile || profile.active !== true || profile.role !== "admin" || accessScopeForProfile(profile) !== "standard") throw syncError("SYNC_ADMIN_REQUIRED", 403);
  return profile;
}
export function createMacSyncHandler({ pool, resolveProfile, auth, configuration, state, origin, execute, readAsset, now = Date.now }) {
  const getPool = typeof pool === "function" ? pool : () => pool;
  function windowOpen() { assertIapExternalAccessWindow(configuration, { nowMs: now() }); }
  function nativeRequest(request) {
    if (request.headers.origin || request.headers.cookie || request.headers["sec-fetch-site"]) throw syncError("SYNC_DEVICE_REQUEST_REQUIRED", 403);
    if (request.method === "POST" && request.headers["content-type"] !== "application/json") throw syncError("SYNC_REQUEST_INVALID", 400);
  }
  async function device(request, pending = false) {
    nativeRequest(request); windowOpen();
    const [id, secret, extra] = String(request.headers.authorization || "").replace(/^Bearer /u, "").split(".");
    if (!UUID.test(id || "") || !SECRET.test(secret || "") || extra) throw syncError("SYNC_DEVICE_UNAUTHORIZED", 401);
    const row = (await getPool().query("select * from mac_sync.devices where id = $1", [id])).rows[0];
    if (!row || !matches(secret, row.secret_hash) || row.revoked_at) throw syncError("SYNC_DEVICE_UNAUTHORIZED", 401);
    if (!row.paired_at) {
      if (pending && Date.parse(row.pair_expires_at) > now()) return { device: row, pending: true };
      throw syncError("SYNC_PAIRING_EXPIRED", 401);
    }
    if (Date.parse(row.expires_at) <= now()) throw syncError("SYNC_DEVICE_EXPIRED", 401);
    let user;
    try { user = await auth.getUser(row.google_uid); }
    catch (error) { if (error.code === "auth/user-not-found") throw syncError("SYNC_DEVICE_REVOKED", 401); throw error; }
    if (user.disabled || !user.emailVerified || Date.parse(user.tokensValidAfterTime || 0) > Date.parse(row.paired_at)) throw syncError("SYNC_DEVICE_REVOKED", 401);
    const profiles = (await getPool().query(`select p.*, b.access_scope, b.scope_ref from public.identity_bindings b join public.profiles p on p.id = b.profile_id
      where b.issuer = $1 and b.subject = $2 and b.profile_id = $3 and b.active = true and p.active = true limit 2`, [row.issuer, row.subject, row.profile_id])).rows;
    if (profiles.length !== 1) throw syncError("SYNC_DEVICE_REVOKED", 401);
    return { device: row, profile: assertSyncAdmin(profiles[0]) };
  }
  return async function macSync(request, response) {
    const send = (status, data) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" }); response.end(JSON.stringify(data)); };
    try {
      windowOpen();
      const route = new URL(request.url, origin).pathname;
      if (route === "/api/mac-sync/begin" && request.method === "POST") {
        nativeRequest(request);
        if (!(await state.consume("mac-pair:global", 10, 600_000))) throw syncError("SYNC_RATE_LIMIT", 429);
        const input = await syncJsonBody(request);
        if (!UUID.test(input.id || "") || !SECRET.test(input.secret || "") || !SECRET.test(input.code || "") || typeof input.label !== "string" || input.label.length < 1 || input.label.length > 80) throw syncError("SYNC_REQUEST_INVALID", 400);
        const expiresAt = new Date(now() + 600_000).toISOString();
        await getPool().query(`insert into mac_sync.devices (id, secret_hash, code_hash, label, pair_expires_at) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`, [input.id, hash(input.secret), hash(input.code), input.label, expiresAt]);
        const stored = (await getPool().query("select secret_hash, code_hash, paired_at, pair_expires_at from mac_sync.devices where id = $1", [input.id])).rows[0];
        if (!stored || !matches(input.secret, stored.secret_hash) || !matches(input.code, stored.code_hash) || stored.paired_at) throw syncError("SYNC_PAIRING_INVALID", 409);
        return send(200, { pending: true, expiresAt: stored.pair_expires_at });
      }
      if (["/api/mac-sync/pairing", "/api/mac-sync/approve", "/api/mac-sync/revoke"].includes(route) && request.method === "POST") {
        assertGoogleBrowserMutation(request, origin);
        const profile = assertSyncAdmin(await resolveProfile(request));
        const input = await syncJsonBody(request);
        if (route === "/api/mac-sync/revoke") {
          if (!UUID.test(input.id || "")) throw syncError("SYNC_REQUEST_INVALID", 400);
          await getPool().query("update mac_sync.devices set revoked_at = now() where id = $1 and profile_id = $2", [input.id, profile.id]);
          return send(200, { ok: true });
        }
        if (!SECRET.test(input.code || "")) throw syncError("SYNC_PAIRING_INVALID", 400);
        const candidate = (await getPool().query("select id, label from mac_sync.devices where code_hash = $1 and paired_at is null and revoked_at is null and pair_expires_at > now()", [hash(input.code)])).rows[0];
        if (!candidate) throw syncError("SYNC_PAIRING_EXPIRED", 410);
        if (route === "/api/mac-sync/pairing") return send(200, { label: candidate.label, profile: profile.display_name, id: candidate.id });
        const verified = request.googleVerifiedIdentity;
        if (!verified?.payload?.gcip?.uid || !verified.identity?.subject) throw syncError("SYNC_IDENTITY_REQUIRED", 401);
        const expiresAt = new Date(Math.min(now() + 30 * 86400_000, configuration.iapExternalAccessExpiresAtMs)).toISOString();
        const result = await getPool().query(`update mac_sync.devices set profile_id=$1, issuer=$2, subject=$3, google_uid=$4, paired_at=now(), expires_at=$5
          where id=$6 and paired_at is null and revoked_at is null and pair_expires_at > now() returning id`, [profile.id, verified.payload.iss, verified.identity.subject, verified.payload.gcip.uid, expiresAt, candidate.id]);
        if (result.rowCount !== 1) throw syncError("SYNC_PAIRING_EXPIRED", 410);
        return send(200, { paired: true, expiresAt });
      }
      if (route === "/api/mac-sync/devices" && request.method === "GET") {
        const profile = assertSyncAdmin(await resolveProfile(request));
        const rows = (await getPool().query("select id, label, paired_at, expires_at, revoked_at from mac_sync.devices where profile_id=$1 order by created_at desc limit 50", [profile.id])).rows;
        return send(200, { devices: rows });
      }
      const identity = await device(request, route === "/api/mac-sync/poll");
      if (route === "/api/mac-sync/poll" && request.method === "GET") return send(200, { paired: !identity.pending, profileId: identity.profile?.id, expiresAt: identity.device.expires_at });
      if (identity.pending) throw syncError("SYNC_DEVICE_UNAUTHORIZED", 401);
      if (!(await state.consume(`mac-sync:${identity.device.id}`, 120, 60_000))) throw syncError("SYNC_RATE_LIMIT", 429);
      if (route === "/api/mac-sync/snapshot" && request.method === "GET") return send(200, await snapshotForSync(getPool()));
      if (route === "/api/mac-sync/asset" && request.method === "POST" && readAsset) {
        const input = await syncJsonBody(request);
        if (typeof input.path !== "string" || !/^\/api\/(?:(?:profile-avatar|contact-images|stakeholder-logos)\/[^/?#]+|contact-note-attachments\/[^/?#]+\/content)$/u.test(input.path)
          || input.path.length > 600 || /[\\\u0000-\u001f]|%(?:2f|5c|00)/iu.test(input.path)) throw syncError("SYNC_ASSET_INVALID", 400);
        const result = await readAsset(input.path, identity.profile);
        if (result.status !== 200 || !Buffer.isBuffer(result.body)) return send(result.status >= 400 ? result.status : 502, { error: "Datei nicht verfügbar." });
        if (result.body.length > 25_000_000) throw syncError("SYNC_ASSET_TOO_LARGE", 413);
        response.writeHead(200, { "content-type": result.headers["content-type"] || "application/octet-stream", "content-security-policy": "default-src 'none'; sandbox", "cache-control": "private, no-store" });
        return response.end(result.body);
      }
      if (route === "/api/mac-sync/apply" && request.method === "POST") {
        const operation = await syncJsonBody(request);
        return send(200, await applySyncOperation({ pool: getPool(), deviceId: identity.device.id, profile: identity.profile, operation, execute }));
      }
      return send(404, { error: "Nicht gefunden." });
    } catch (error) {
      const status = Number(error.status) || 503;
      return send(status, { error: status >= 500 ? "Der Abgleich ist vorübergehend nicht erreichbar. Deine Daten bleiben erhalten." : "Bitte prüfe die Verbindung dieses Macs in der Live-Anwendung.", code: /^SYNC_[A-Z_]+$/u.test(error.code || "") ? error.code : "SYNC_UNAVAILABLE" });
    }
  };
}
