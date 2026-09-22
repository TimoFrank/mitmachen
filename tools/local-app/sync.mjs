import { randomBytes, randomUUID } from "node:crypto";
import { SYNC_TABLES, fingerprint, rowKey, syncError, prepareOperation } from "../../api/mac-sync-contract.mjs";
import { lockSyncData, readSyncData } from "../../api/mac-sync-database.mjs";
import { loadSchemaColumns, tableImportPlan, importTable, verifyImportedTable, resetIdentitySequences, foreignKeyRevalidationStatements } from "./import-snapshot.mjs";

const ORIGIN = "https://versorgungs-kompass.de";
export async function replaceLocalData(pool, snapshot, profileId, assets = null) {
  if (snapshot?.protocol !== 1 || !Number.isFinite(Date.parse(snapshot.exportedAt)) || !snapshot.data
    || Object.keys(snapshot.data).sort().join() !== [...SYNC_TABLES].sort().join()) throw syncError("SYNC_SNAPSHOT_INVALID");
  for (const table of SYNC_TABLES) {
    const rows = snapshot.data[table];
    if (!Array.isArray(rows) || new Set(rows.map(row => rowKey(table, row))).size !== rows.length) throw syncError("SYNC_SNAPSHOT_INVALID");
  }
  const profile = snapshot.data.profiles.find(row => row.id === profileId);
  if (!profile || profile.active !== true || profile.role !== "admin") throw syncError("SYNC_PROFILE_MISMATCH");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const identity = (await client.query("select current_database() as database, current_user as username")).rows[0];
    if (identity.database !== "versorgungs_kompass_local" || identity.username !== "vk_local_admin") throw syncError("SYNC_LOCAL_DATABASE_REQUIRED");
    await lockSyncData(client);
    const state = (await client.query("select state from local_app.sync_state where singleton for update")).rows[0]?.state;
    const pending = (await client.query("select count(*)::int as count from local_app.operations where status='pending'")).rows[0].count;
    if (pending) throw syncError("SYNC_LOCAL_CHANGES_PENDING");
    const before = await readSyncData(client);
    if (fingerprint(before) !== state.fingerprint) throw syncError("SYNC_UNTRACKED_LOCAL_CHANGES");
    const columns = await loadSchemaColumns(client);
    const plans = SYNC_TABLES.map(table => tableImportPlan(table, snapshot.data[table], columns.get(table)));
    // Retain every prior accepted state in the private local database. Never
    // use this import boundary with a production connection or pending edits.
    if (fingerprint(before) !== fingerprint(snapshot.data)) {
      await client.query("insert into local_app.sync_history (kind, document) values ('before-pull', $1::jsonb)", [JSON.stringify({ data: before, receivedAt: new Date().toISOString() })]);
      await client.query("set local session_replication_role = replica");
      for (const table of [...SYNC_TABLES].reverse()) await client.query(`delete from public."${table}"`);
      for (const plan of plans) await importTable(client, plan);
      await client.query("set local session_replication_role = origin");
      const constraints = (await client.query("select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and con.contype='f' order by c.relname, con.conname")).rows;
      for (const constraint of constraints) for (const sql of foreignKeyRevalidationStatements(constraint)) await client.query(sql);
      for (const plan of plans) await verifyImportedTable(client, plan);
      await resetIdentitySequences(client, columns);
    }
    const after = await readSyncData(client);
    if (assets) {
      for (const item of assets) {
        if (item.content) await client.query("insert into local_app.sync_assets (path,reference,content_type,content) values ($1,$2,$3,$4) on conflict do nothing", [item.path, item.reference, item.contentType, item.content]);
      }
      await client.query("delete from local_app.sync_asset_current");
      for (const item of assets) await client.query("insert into local_app.sync_asset_current (path,reference) values ($1,$2)", [item.path, item.reference]);
    }
    await client.query("update local_app.sync_state set state=state || $1::jsonb where singleton", [JSON.stringify({ fingerprint: fingerprint(after), lastSync: new Date().toISOString(), sourceDate: snapshot.exportedAt, status: "current", error: null, pendingSince: null })]);
    await client.query("update local_app.operations set reconciled=true where status <> 'pending' and reconciled=false");
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
export function createLocalSync({ pool, profileId, transport = fetch, intervalMs = 30 * 60_000 }) {
  let busy = false, timer = null, stopped = false, inFlight = null;
  const readState = async () => (await pool.query("select state from local_app.sync_state where singleton")).rows[0].state;
  const saveState = patch => pool.query("update local_app.sync_state set state=state || $1::jsonb where singleton", [JSON.stringify(patch)]);
  async function labelConflicts(result) {
    const names = { contacts: "Kontakt", organizations: "Organisation", profiles: "Profil", contact_notes: "Kontaktnotiz", hospitations: "Hospitation", hospitation_observations: "Beobachtung", formats: "Format", format_participants: "Teilnahme", saved_views: "Gespeicherte Ansicht", user_settings: "Persönliche Einstellungen" };
    for (const item of result.conflicts || []) {
      const row = item.after || item.remote || item.before || {};
      let context = row.name || row.title || row.display_name || row.contact_name || row.organization_name;
      if (row.contact_id && ["contact_notes", "format_participants"].includes(item.table)) context = (await pool.query("select name from public.contacts where id=$1", [row.contact_id])).rows[0]?.name;
      item.caption = [names[item.table] || "Geänderter Eintrag", context].filter(Boolean).join(" · ");
    }
    return result;
  }
  async function remote(route, { method = "GET", body, credential, binary = false } = {}) {
    const headers = { accept: "application/json" };
    if (credential) headers.authorization = `Bearer ${credential.id}.${credential.secret}`;
    if (body) headers["content-type"] = "application/json";
    const response = await transport(`${ORIGIN}/api/mac-sync/${route}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(30_000) });
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 25_000_000) throw syncError("SYNC_RESPONSE_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    if (binary && response.ok) return { content: Buffer.concat(chunks), contentType: response.headers.get("content-type") || "application/octet-stream" };
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!response.ok) throw syncError(payload.code || "SYNC_REMOTE_UNAVAILABLE", response.status);
    return payload;
  }
  async function refreshAssets(snapshot, credential) {
    const references = [];
    for (const [table, field, prefix] of [["profiles", "avatar_url", "profile-avatar"], ["contacts", "image_storage_path", "contact-images"], ["stakeholder_organizations", "logo_url", "stakeholder-logos"], ["contact_note_attachments", "storage_path", "contact-note-attachments"]]) {
      for (const row of snapshot.data[table] || []) {
        const source = row[field];
        if (!source || (table !== "contacts" && table !== "contact_note_attachments" && !/^(?:gs:|private:|\/api\/)/u.test(source))) continue;
        const path = `/api/${prefix}/${encodeURIComponent(row.id)}${table === "contact_note_attachments" ? "/content" : ""}`;
        references.push({ path, reference: fingerprint({ source, updated: row.image_updated_at || row.updated_at }) });
      }
    }
    for (const item of references) {
      if ((await pool.query("select 1 from local_app.sync_assets where path=$1 and reference=$2", [item.path, item.reference])).rowCount) continue;
      const asset = await remote("asset", { method: "POST", body: { path: item.path }, credential, binary: true });
      // Cache each completed download privately so a later rate limit or
      // disconnect resumes here. It becomes visible only with the data pull.
      await pool.query("insert into local_app.sync_assets (path,reference,content_type,content) values ($1,$2,$3,$4) on conflict do nothing", [item.path, item.reference, asset.contentType, asset.content]);
    }
    // Only switch current references in the same transaction as the data pull.
    // Older bytes remain in this private database for recovery.
    return references;
  }
  async function status() {
    const state = await readState();
    const pending = (await pool.query("select count(*)::int as count from local_app.operations where status='pending'")).rows[0].count;
    const conflict = (await pool.query("select id, operation, conflict from local_app.operations where status='pending' and conflict is not null order by sequence limit 1")).rows[0];
    return { paired: state.paired === true, dataVersion: state.fingerprint, status: busy ? "syncing" : pending && state.status === "current" ? "pending" : state.status, lastSync: state.lastSync, sourceDate: state.sourceDate,
      expiresAt: state.expiresAt, pending, error: state.error || null, conflict: conflict ? { ...conflict, revision: fingerprint(conflict.conflict) } : null };
  }
  async function beginPairing() {
    if (busy) throw syncError("SYNC_BUSY");
    busy = true;
    try {
      const credential = { id: randomUUID(), secret: randomBytes(32).toString("hex"), code: randomBytes(32).toString("hex"), label: "Versorgungs-Kompass auf diesem Mac" };
      // Store before the request so connection loss cannot leave a secret only
      // in memory. It never reaches the browser or a cloud-synced folder.
      await saveState({ credential, paired: false, status: "pairing", error: null });
      const result = await remote("begin", { method: "POST", body: credential });
      await saveState({ pairingExpiresAt: result.expiresAt });
      return { url: `${ORIGIN}/mac-abgleich?code=${credential.code}`, expiresAt: result.expiresAt };
    } finally { busy = false; schedule(10_000); }
  }
  function schedule(delay = intervalMs) {
    clearTimeout(timer);
    if (!stopped) { timer = setTimeout(() => { run().catch(() => schedule()); }, delay); timer.unref?.(); }
  }
  async function perform() {
    if (busy || stopped) return status();
    busy = true;
    let pairing = false, retryDelay = intervalMs;
    try {
      let state = await readState();
      if (!state.credential) return;
      const identity = await remote("poll", { credential: state.credential });
      if (!identity.paired) { pairing = true; return; }
      if (identity.profileId !== profileId) throw syncError("SYNC_PROFILE_MISMATCH");
      await saveState({ paired: true, expiresAt: identity.expiresAt });
      // Limit each run so an active editor cannot starve the background worker.
      for (let count = 0; count < 100; count++) {
        const next = (await pool.query("select id, operation, conflict from local_app.operations where status='pending' order by sequence limit 1")).rows[0];
        if (!next) break;
        if (next.conflict) { await saveState({ status: "conflict" }); return; }
        const receipts = (await pool.query("select sequence, operation, receipt from local_app.operations where status='applied' and reconciled=false order by sequence")).rows;
        const prepared = prepareOperation(next.operation, receipts);
        const result = await remote("apply", { method: "POST", body: prepared, credential: state.credential });
        if (!result.applied) {
          await labelConflicts(result);
          await pool.query("update local_app.operations set conflict=$2::jsonb where id=$1 and status='pending'", [next.id, JSON.stringify(result)]);
          await saveState({ status: "conflict", error: null }); return;
        }
        await pool.query("update local_app.operations set status='applied', conflict=null, receipt=$2::jsonb where id=$1", [next.id, JSON.stringify(result)]);
      }
      const snapshot = await remote("snapshot", { credential: state.credential });
      const assets = await refreshAssets(snapshot, state.credential);
      await replaceLocalData(pool, snapshot, profileId, assets);
    } catch (error) {
      const code = /^SYNC_[A-Z_]+$/u.test(error.code || "") ? error.code : "SYNC_OFFLINE";
      if (error.status === 429) retryDelay = 60_000;
      await saveState({ status: error.status === 401 || error.status === 403 ? "reconnect" : error.status === 429 ? "retry_wait" : "offline", error: code }).catch(() => {});
    } finally { busy = false; schedule(pairing ? 10_000 : retryDelay); }
    return status();
  }
  async function run() {
    if (inFlight) return inFlight;
    if (busy || stopped) return status();
    inFlight = perform();
    try { await inFlight; } finally { inFlight = null; }
    return status();
  }
  async function resolve({ id, choice, revision }) {
    if (busy || !["local", "online"].includes(choice)) throw syncError("SYNC_DECISION_INVALID");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const row = (await client.query("select operation, conflict from local_app.operations where id=$1 and status='pending' for update", [id])).rows[0];
      if (!row?.conflict || fingerprint(row.conflict) !== revision) throw syncError("SYNC_DECISION_STALE");
      const decision = { at: new Date().toISOString(), choice, operation: row.operation, conflict: row.conflict };
      if (choice === "local") {
        if (!row.conflict.conflicts?.length) throw syncError("SYNC_VALIDATION_REQUIRES_EDIT");
        const guards = new Map(row.operation.guards.map(guard => [`${guard.table}:${guard.key}`, guard]));
        for (const conflict of row.conflict.conflicts) {
          const old = guards.get(`${conflict.table}:${conflict.key}`) || conflict;
          guards.set(`${conflict.table}:${conflict.key}`, { table: conflict.table, key: conflict.key, before: conflict.remote, after: old.after });
        }
        row.operation.guards = [...guards.values()];
        row.operation.normalizationCursor = (await client.query("select coalesce(max(sequence),0)::text as cursor from local_app.operations where status='applied'")).rows[0].cursor;
      }
      await client.query("update local_app.operations set operation=$2::jsonb, status=$3, conflict=null, decisions=decisions || $4::jsonb where id=$1", [id, JSON.stringify(row.operation), choice === "online" ? "skipped" : "pending", JSON.stringify([decision])]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    await run();
    return status();
  }
  async function asset(path) {
    const state = await readState();
    if (!state.lastSync || !state.paired) return null;
    const row = (await pool.query("select a.content_type,a.content from local_app.sync_assets a join local_app.sync_asset_current c using (path,reference) where a.path=$1", [path])).rows[0];
    return row || { missing: true };
  }
  async function history() {
    const rows = (await pool.query("select id, decisions from local_app.operations where jsonb_array_length(decisions)>0 order by sequence desc limit 100")).rows;
    return { items: rows.flatMap(row => row.decisions.map(decision => ({ id: row.id, ...decision }))), limit: 100 };
  }
  return { status, beginPairing, run, resolve, asset, history, start() { stopped = false; schedule(1000); }, async stop() { stopped = true; clearTimeout(timer); await inFlight?.catch(() => {}); } };
}
