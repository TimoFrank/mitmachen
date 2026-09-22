import { randomUUID } from "node:crypto";
import { fingerprint, rowChanges, syncRouteAllowed, syncError } from "./mac-sync-contract.mjs";
import { readSyncData, lockSyncData } from "./mac-sync-database.mjs";
import { withinSyncTransaction } from "./mac-sync-context.mjs";

export async function initializeLocalSync(pool) {
  const identity = (await pool.query("select current_database() as database, current_user as username")).rows[0];
  if (identity.database !== "versorgungs_kompass_local" || identity.username !== "vk_local_admin") throw syncError("SYNC_LOCAL_DATABASE_REQUIRED", 500);
  await pool.query(`create schema if not exists local_app;
    revoke all on schema local_app from public;
    create table if not exists local_app.sync_state (singleton boolean primary key default true check (singleton), state jsonb not null);
    create table if not exists local_app.operations (
      sequence bigint generated always as identity primary key, id uuid unique not null,
      operation jsonb not null, status text not null default 'pending' check (status in ('pending','applied','skipped')),
      conflict jsonb, decisions jsonb not null default '[]', receipt jsonb, reconciled boolean not null default false, created_at timestamptz not null default now());
    create index if not exists local_sync_pending on local_app.operations (sequence) where status = 'pending';
    create table if not exists local_app.sync_assets (path text not null, reference text not null, content_type text not null, content bytea not null, primary key(path,reference));
    create table if not exists local_app.sync_asset_current (path text primary key, reference text not null);
    create table if not exists local_app.sync_history (id bigint generated always as identity primary key, kind text not null, document jsonb not null, created_at timestamptz not null default now());`);
  const data = await readSyncData(pool);
  await pool.query("insert into local_app.sync_state (state) values ($1::jsonb) on conflict do nothing", [JSON.stringify({ fingerprint: fingerprint(data), paired: false, lastSync: null, status: "not_connected" })]);
}
export async function captureLocalOperation({ pool, method, path, body, profile, execute, expectedFingerprint }) {
  if (!syncRouteAllowed(method, path)) throw syncError("SYNC_ROUTE_DISABLED", 403);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockSyncData(client);
    const state = (await client.query("select state from local_app.sync_state where singleton for update")).rows[0]?.state;
    const before = await readSyncData(client);
    if (state?.fingerprint !== fingerprint(before)) throw syncError("SYNC_UNTRACKED_LOCAL_CHANGES", 409);
    if (expectedFingerprint !== state.fingerprint) throw syncError("SYNC_VIEW_OUTDATED", 409);
    const operation = { protocol: 1, id: randomUUID(), method, path, body, guards: [] };
    const result = await withinSyncTransaction(client, { operationId: operation.id, profile }, () => execute(operation));
    if (result.status >= 400) { await client.query("rollback"); return result; }
    const after = await readSyncData(client);
    operation.guards = rowChanges(before, after, { includeVersions: true });
    await client.query("insert into local_app.operations (id, operation) values ($1, $2::jsonb)", [operation.id, JSON.stringify(operation)]);
    await client.query("update local_app.sync_state set state = state || $1::jsonb where singleton", [JSON.stringify({ fingerprint: fingerprint(after), pendingSince: new Date().toISOString() })]);
    await client.query("commit");
    result.headers = { ...result.headers, "x-local-data-version": fingerprint(after) };
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
