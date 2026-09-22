import { SYNC_TABLES, rowChanges, conflictsFor, validateOperation, operationFingerprint, syncError } from "./mac-sync-contract.mjs";
import { withinSyncTransaction } from "./mac-sync-context.mjs";

const qid = value => {
  if (!SYNC_TABLES.includes(value)) throw syncError("SYNC_TABLE_INVALID", 400);
  return `public."${value}"`;
};
export async function readSyncData(client) {
  const data = {};
  // row_to_json preserves microsecond timestamps and SQL dates as strings.
  for (const table of SYNC_TABLES) {
    const identity = ["changes", "activity_events", "hospitation_observation_changes"].includes(table);
    const rows = await client.query(`select (to_jsonb(t)${identity ? " || jsonb_build_object('id', t.id::text)" : ""})::text as document from ${qid(table)} t order by to_jsonb(t)::text`);
    data[table] = rows.rows.map(row => JSON.parse(row.document));
  }
  if (Buffer.byteLength(JSON.stringify(data)) > 20_000_000) throw syncError("SYNC_SNAPSHOT_TOO_LARGE", 413);
  return data;
}
export async function lockSyncData(client) {
  await client.query("set local lock_timeout = '3s'");
  await client.query("set local statement_timeout = '15s'");
  // Includes children: an online child added before a deletion must be noticed.
  // Reads remain available. No network call is made while these locks are held.
  await client.query(`lock table ${[...SYNC_TABLES].sort().map(qid).join(", ")} in share row exclusive mode`);
}
export async function snapshotForSync(pool) {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout = '15s'");
    const data = await readSyncData(client);
    await client.query("commit");
    return { protocol: 1, exportedAt: new Date().toISOString(), data };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
export async function applySyncOperation({ pool, deviceId, profile, operation, execute }) {
  validateOperation(operation);
  const digest = operationFingerprint(operation);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockSyncData(client);
    const receipt = (await client.query("select fingerprint, result from mac_sync.receipts where device_id = $1 and operation_id = $2", [deviceId, operation.id])).rows[0];
    if (receipt) {
      if (receipt.fingerprint !== digest) throw syncError("SYNC_OPERATION_REUSED", 409);
      await client.query("commit");
      return { ...receipt.result, repeated: true };
    }
    const before = await readSyncData(client);
    const conflicts = conflictsFor(operation.guards, before);
    if (conflicts.length) {
      await client.query("rollback");
      return { applied: false, conflicts };
    }
    const result = await withinSyncTransaction(client, { operationId: operation.id, profile }, () => execute(operation));
    if (result.status >= 400) {
      await client.query("rollback");
      return { applied: false, validation: result.body, status: result.status };
    }
    const after = await readSyncData(client);
    const changes = rowChanges(before, after, { includeVersions: true });
    const guarded = new Set(operation.guards.map(row => `${row.table}:${row.key}`));
    const uncovered = changes.filter(row => !guarded.has(`${row.table}:${row.key}`));
    if (uncovered.length) {
      await client.query("rollback");
      return { applied: false, conflicts: uncovered.map(row => ({ ...row, before: null, after: null, remote: row.before, reason: "related_record_changed" })) };
    }
    const receiptResult = { applied: true, operationId: operation.id, result: result.body, changes };
    await client.query("insert into mac_sync.receipts (device_id, operation_id, fingerprint, result) values ($1, $2, $3, $4::jsonb)", [deviceId, operation.id, digest, JSON.stringify(receiptResult)]);
    await client.query("commit");
    return receiptResult;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
