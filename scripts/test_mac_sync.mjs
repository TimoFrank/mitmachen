import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { once } from "node:events";
import { Pool } from "pg";
import { fingerprint, rowChanges, conflictsFor, validateOperation, syncRouteAllowed, SYNC_TABLES } from "../api/mac-sync-contract.mjs";
import { readSyncData, snapshotForSync, applySyncOperation } from "../api/mac-sync-database.mjs";
import { initializeLocalSync } from "../api/mac-sync-local.mjs";
import { currentSyncContext, invokeApi } from "../api/mac-sync-context.mjs";
import { createMacSyncHandler, assertSyncAdmin } from "../api/mac-sync-http.mjs";
import { createLocalSync, replaceLocalData } from "../tools/local-app/sync.mjs";

assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
assert.equal(rowChanges({ contacts: [{ id: "x", name: "A", updated_at: "1" }] }, { contacts: [{ name: "A", id: "x", updated_at: "2" }] }).length, 0);
const difference = rowChanges({ contacts: [{ id: "x", name: "A" }] }, { contacts: [{ id: "x", name: "B" }] });
assert.equal(conflictsFor(difference, { contacts: [{ id: "x", name: "C" }] }).length, 1);
assert.equal(conflictsFor(difference, { contacts: [{ id: "x", name: "A" }] }).length, 0);
for (const path of ["/api/profile/avatar", "/api/contacts/x/image", "/api/auth/session", "/api/admin/hospitation-import/apply", "/api/activities", "/api/contacts?x=1", "/api/contacts/x%2fy"]) assert.equal(syncRouteAllowed("POST", path), false, path);
assert.equal(syncRouteAllowed("PUT", "/api/hospitations/x/observations/sync"), true);
assert.throws(() => validateOperation({ id: randomUUID(), protocol: 2, method: "POST", path: "/api/contacts", body: {}, guards: [] }));

const container = `vk-mac-sync-test-${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const docker = (args, input) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`Test-Datenbank: ${result.stderr || result.error?.message}`);
  return result.stdout.trim();
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = { id: "synthetic-sync-admin", display_name: "Alex Beispiel", role: "admin", active: true, access_scope: "standard" };
for (const changes of [{ role: "editor" }, { active: false }, { access_scope: "test_only" }]) assert.throws(() => assertSyncAdmin({ ...profile, ...changes }));
let localPool, remoteAdmin, runtime, localProcess, syncServer, worker;
let localLogs = "", serviceOrigin = "", deviceOrigin = "";
let remoteUserDisabled = false, loseNextApplyResponse = false, configuration, imageVersion = 1;
let assetCalls = 0, limitAssetDownload = false;
try {
  docker(["run", "--rm", "-d", "--name", container, "--label", "versorgungs-kompass.test=mac-sync", "-e", "POSTGRES_USER=vk_local_admin", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=versorgungs_kompass_local", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
  const port = Number(/:(\d+)\s*$/u.exec(docker(["port", container, "5432/tcp"]))[1]);
  const connection = { host: "127.0.0.1", port, user: "vk_local_admin", password, max: 4 };
  localPool = new Pool({ ...connection, database: "versorgungs_kompass_local" });
  for (let i = 0; i < 60; i++) { try { await localPool.query("select 1"); break; } catch { if (i === 59) throw new Error("PostgreSQL nicht bereit"); await delay(250); } }
  await localPool.query("create database sync_remote");
  await localPool.query(`create role vk_app login password '${password}'`);
  remoteAdmin = new Pool({ ...connection, database: "sync_remote" });
  const schema = await readFile(new URL("../deploy/postgres/pre-gematik/schema.sql", import.meta.url), "utf8");
  await localPool.query(schema); await remoteAdmin.query(schema);
  const runtimeRole = await readFile(new URL("../deploy/postgres/pre-gematik/runtime-role.sql", import.meta.url), "utf8");
  const runtimeGrants = await readFile(new URL("../deploy/postgres/pre-gematik/grants.sql", import.meta.url), "utf8");
  docker(["exec", "-i", container, "psql", "-U", "vk_local_admin", "-d", "sync_remote", "-v", "ON_ERROR_STOP=1"], runtimeRole);
  docker(["exec", "-i", container, "psql", "-U", "vk_local_admin", "-d", "sync_remote", "-v", "runtime_role=vk_app_runtime"], runtimeGrants);
  await remoteAdmin.query("grant vk_app_runtime to vk_app");
  const privileges = (await remoteAdmin.query("select has_table_privilege('vk_app','public.activity_events','SELECT') as read, has_table_privilege('vk_app','public.activity_events','INSERT') as append, has_table_privilege('vk_app','public.activity_events','UPDATE') as update, has_table_privilege('vk_app','public.activity_events','DELETE') as delete, has_table_privilege('vk_app','public.activity_events','TRUNCATE') as truncate")).rows[0];
  assert.deepEqual(privileges, { read: true, append: true, update: false, delete: false, truncate: false });
  await remoteAdmin.query(await readFile(new URL("../deploy/postgres/pre-gematik/mac-sync.sql", import.meta.url), "utf8"));
  await remoteAdmin.query("insert into profiles (id,email,display_name,role,active) values ($1,'alex@synthetic.example.invalid',$2,'admin',true)", [profile.id, profile.display_name]);
  await remoteAdmin.query("insert into identity_bindings (issuer,subject,profile_id,active) values ('https://cloud.google.com/iap','securetoken.google.com/synthetic:synthetic-user',$1,true)", [profile.id]);
  // An empty local schema is adopted only in this synthetic fixture.
  await initializeLocalSync(localPool);
  await replaceLocalData(localPool, await snapshotForSync(remoteAdmin), profile.id);
  Object.assign(process.env, { NODE_ENV: "test", PORT: "0", DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: "sync_remote", DB_USER: "vk_app", DB_PASSWORD: password, DB_SSL_MODE: "disable", API_AUTH_MODE: "trusted-header", ALLOWED_ORIGIN: "http://127.0.0.1:4199", IMAGE_UPLOAD_MODE: "disabled", ATTACHMENT_UPLOAD_MODE: "disabled", API_AUTH_ALLOW_DEV_PROFILE: "0", API_AUTH_ALLOW_BEARER_DEV: "0", API_LOG_REQUESTS: "0" });
  runtime = await import("../api/server.mjs");
  if (!runtime.server.listening) await once(runtime.server, "listening");
  serviceOrigin = `http://127.0.0.1:${runtime.server.address().port}`;
  configuration = { iapIdentityMode: "external", iapExternalAccessExpiresAtMs: Date.now() + 86400_000 };
  const handler = createMacSyncHandler({ pool: runtime.getPool, origin: "http://127.0.0.1:4199", configuration,
    auth: { getUser: async () => ({ disabled: remoteUserDisabled, emailVerified: true, tokensValidAfterTime: "2020-01-01T00:00:00Z" }) }, state: { consume: async () => true },
    resolveProfile: async request => { request.googleVerifiedIdentity = { identity: { subject: "securetoken.google.com/synthetic:synthetic-user" }, payload: { iss: "https://cloud.google.com/iap", gcip: { uid: "synthetic-user" } } }; return profile; },
    execute: operation => invokeApi(runtime.handle, operation, "http://127.0.0.1:4199"),
    readAsset: async (path, currentProfile) => { assert.equal(currentProfile.id, profile.id); assert.ok([`/api/profile-avatar/${profile.id}`, "/api/profile-avatar/synthetic-sync-extra"].includes(path)); return { status: 200, body: Buffer.from(`synthetic-image-${imageVersion}`), headers: { "content-type": "image/png" } }; }
  });
  syncServer = http.createServer(handler); syncServer.listen(0, "127.0.0.1"); await once(syncServer, "listening");
  deviceOrigin = `http://127.0.0.1:${syncServer.address().port}`;
  const transport = async (url, options) => {
    assert.equal(new URL(url).origin, "https://versorgungs-kompass.de");
    if (url.endsWith("/asset")) {
      assetCalls++;
      if (limitAssetDownload && assetCalls === 2) return new Response(JSON.stringify({ code: "SYNC_RATE_LIMIT" }), { status: 429, headers: { "content-type": "application/json" } });
    }
    const result = await fetch(`${deviceOrigin}${new URL(url).pathname}`, options);
    if (loseNextApplyResponse && url.endsWith("/apply") && result.ok) { loseNextApplyResponse = false; await result.arrayBuffer(); throw new TypeError("Synthetischer Verbindungsabbruch nach Commit"); }
    return result;
  };
  worker = createLocalSync({ pool: localPool, profileId: profile.id, transport, intervalMs: 3600_000 });
  const pairing = await worker.beginPairing();
  const code = new URL(pairing.url).searchParams.get("code");
  const browserPost = (route, data, origin = "http://127.0.0.1:4199") => fetch(`${deviceOrigin}/api/mac-sync/${route}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(data) });
  assert.equal((await browserPost("approve", { code }, "https://foreign.invalid")).status, 403);
  assert.equal((await browserPost("approve", { code })).status, 200);
  assert.equal((await browserPost("approve", { code })).status, 410);
  const localPortServer = http.createServer(); localPortServer.listen(0, "127.0.0.1"); await once(localPortServer, "listening");
  const localPort = localPortServer.address().port; await new Promise(resolve => localPortServer.close(resolve));
  const localOrigin = `http://127.0.0.1:${localPort}`;
  localProcess = spawn(process.execPath, ["--import", "./tools/local-app/pg-timestamps.mjs", "api/server.mjs"], {
    cwd: new URL("../", import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: "test", PORT: String(localPort), DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: "versorgungs_kompass_local", DB_USER: "vk_local_admin", DB_PASSWORD: password, DB_SSL_MODE: "disable", API_AUTH_MODE: "trusted-header", ALLOWED_ORIGIN: localOrigin, LOCAL_APP_SYNC: "1", IMAGE_UPLOAD_MODE: "disabled", ATTACHMENT_UPLOAD_MODE: "disabled", RATE_LIMIT_WRITES_PER_MINUTE: "1000", RATE_LIMIT_READS_PER_MINUTE: "5000" }, stdio: ["ignore", "pipe", "pipe"] });
  localProcess.stdout.on("data", data => { localLogs += data; }); localProcess.stderr.on("data", data => { localLogs += data; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${localOrigin}/readyz`)).ok) break; } catch {} if (localProcess.exitCode !== null || i === 59) throw new Error(`Lokale API nicht bereit: ${localLogs}`); await delay(250); }
  async function local(method, path, body, version) {
    const dataVersion = version || (await worker.status()).dataVersion;
    const response = await fetch(`${localOrigin}${path}`, { method, headers: { origin: localOrigin, "content-type": "application/json", "x-auth-request-user": profile.id, "x-local-data-version": dataVersion }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const contact = await local("POST", "/api/contacts", { name: "Synthetischer Sync-Kontakt", city: "Berlin", ownerId: profile.id });
  assert.equal(contact.status, 201, JSON.stringify(contact));
  const id = contact.body.id;
  assert.ok(id);
  assert.equal((await worker.status()).pending, 1);
  loseNextApplyResponse = true;
  await worker.run();
  assert.equal((await worker.status()).pending, 1, "Abbruch nach Commit lässt die lokale Änderung bis zur Quittung bestehen");
  const committed = (await remoteAdmin.query("select count(*)::int as count from contacts where id=$1", [id])).rows[0].count;
  assert.equal(committed, 1, JSON.stringify(await worker.status()));
  const audits = (await remoteAdmin.query("select count(*)::int as count from changes")).rows[0].count;
  await worker.run();
  assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  assert.equal((await remoteAdmin.query("select count(*)::int as count from changes")).rows[0].count, audits, "Wiederholung erzeugt keinen zweiten Verlaufseintrag");
  assert.equal((await worker.status()).status, "current");
  assert.deepEqual(await readSyncData(localPool), await readSyncData(remoteAdmin));
  console.log("Mac-Abgleich: Anlage, gleiche IDs, Verlust der Antwort nach Commit, idempotenter Wiederanlauf und vollständiger Pull erfolgreich.");
  const note = await local("POST", "/api/contact-notes", { contactId: id, body: "Offline erfasste Notiz", contentType: "free_note" });
  assert.equal(note.status, 201, JSON.stringify(note));
  await worker.run(); assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  assert.equal((await remoteAdmin.query("select body from contact_notes where id=$1", [note.body.id])).rows[0].body, "Offline erfasste Notiz");
  const localCity = await local("PATCH", `/api/contacts/${id}`, { city: "Hamburg" });
  assert.equal(localCity.status, 200, JSON.stringify(localCity));
  await remoteAdmin.query("update contacts set city='München' where id=$1", [id]);
  await worker.run();
  let conflict = (await worker.status()).conflict;
  assert.ok(conflict, JSON.stringify(await worker.status()));
  assert.equal(conflict.conflict.conflicts[0].remote.city, "München");
  assert.equal(conflict.conflict.conflicts[0].after.city, "Hamburg");
  await worker.resolve({ id: conflict.id, revision: conflict.revision, choice: "online" });
  await worker.run();
  assert.equal((await localPool.query("select city from contacts where id=$1", [id])).rows[0].city, "München");
  const decisions = (await localPool.query("select decisions from local_app.operations where id=$1", [conflict.id])).rows[0].decisions;
  assert.equal(decisions[0].conflict.conflicts[0].after.city, "Hamburg", "Verworfene lokale Fassung bleibt erhalten");
  assert.equal((await local("PATCH", `/api/contacts/${id}`, { city: "Bonn" })).status, 200);
  await remoteAdmin.query("update contacts set city='Köln' where id=$1", [id]);
  await worker.run(); conflict = (await worker.status()).conflict;
  await assert.rejects(worker.resolve({ id: conflict.id, revision: "stale", choice: "local" }), /SYNC_DECISION_STALE/u);
  await worker.resolve({ id: conflict.id, revision: conflict.revision, choice: "local" });
  await worker.run();
  assert.equal((await remoteAdmin.query("select city from contacts where id=$1", [id])).rows[0].city, "Bonn");
  assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  console.log("Mac-Abgleich: Notizen, beide Konfliktentscheidungen und dauerhafte Erhaltung beider Fassungen erfolgreich.");
  assert.equal((await local("PATCH", `/api/contacts/${id}`, { city: "Veraltete Eingabe" }, "outdated")).status, 409);
  const beforeInvalid = fingerprint(await readSyncData(localPool));
  assert.equal((await local("POST", "/api/contacts", { name: "" })).status, 400);
  assert.equal(fingerprint(await readSyncData(localPool)), beforeInvalid);
  assert.equal((await local("POST", "/api/profile/avatar", {})).status, 403);
  const credential = (await localPool.query("select state from local_app.sync_state")).rows[0].state.credential;
  const forged = { protocol: 1, id: randomUUID(), method: "PATCH", path: `/api/contacts/${id}`, body: { city: "Ungesichert" }, guards: [] };
  const forgedResult = await applySyncOperation({ pool: runtime.getPool(), deviceId: credential.id, profile, operation: forged, execute: operation => invokeApi(runtime.handle, operation, "http://127.0.0.1:4199") });
  assert.equal(forgedResult.applied, false, "Fehlende Vergleichsfassung darf keine Änderung freigeben");
  assert.equal((await remoteAdmin.query("select city from contacts where id=$1", [id])).rows[0].city, "Bonn");
  const badSnapshot = await snapshotForSync(remoteAdmin);
  badSnapshot.data.contacts[0].organization_id = "missing-parent";
  const beforeBrokenImport = fingerprint(await readSyncData(localPool));
  await assert.rejects(replaceLocalData(localPool, badSnapshot, profile.id));
  assert.equal(fingerprint(await readSyncData(localPool)), beforeBrokenImport, "Ungültiger Pull rollt vollständig zurück");
  assert.equal((await local("DELETE", `/api/contact-notes/${note.body.id}`, {})).status, 200);
  await worker.run(); assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  assert.equal((await remoteAdmin.query("select count(*)::int as count from contact_notes")).rows[0].count, 0);
  // Several dependent edits while offline must not conflict merely because
  // PostgreSQL assigned different timestamps when replaying them online.
  const offlineContact = await local("POST", "/api/contacts", { name: "Zweiter synthetischer Kontakt", ownerId: profile.id });
  assert.equal(offlineContact.status, 201, JSON.stringify(offlineContact));
  const offlinePatch = await local("PATCH", `/api/contacts/${offlineContact.body.id}`, { city: "Leipzig" });
  assert.equal(offlinePatch.status, 200, JSON.stringify(offlinePatch));
  const secondNote = await local("POST", "/api/contact-notes", { contactId: offlineContact.body.id, body: "Erster lokaler Text" });
  assert.equal(secondNote.status, 201, JSON.stringify(secondNote));
  assert.equal((await local("PATCH", `/api/contact-notes/${secondNote.body.id}`, { body: "Offline überarbeiteter Text" })).status, 200);
  await worker.run(); assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  assert.equal((await remoteAdmin.query("select body from contact_notes where id=$1", [secondNote.body.id])).rows[0].body, "Offline überarbeiteter Text");
  const visit = await local("POST", "/api/hospitations", { contactId: id, scheduledOn: "2026-09-23", ownerId: profile.id, goal: "Synthetische Hospitation" });
  assert.equal(visit.status, 201, JSON.stringify(visit));
  const visitId = visit.body.id;
  assert.equal((await local("PATCH", `/api/hospitations/${visitId}`, { documentationSummary: "Erster lokaler Bericht" })).status, 200);
  assert.equal((await local("PATCH", `/api/hospitations/${visitId}`, { documentationSummary: "Überarbeiteter lokaler Bericht" })).status, 200);
  const observations = await local("PUT", `/api/hospitations/${visitId}/observations/sync`, { observations: [{ description: "Synthetische Offline-Beobachtung", evidenceType: "directly_observed" }] });
  assert.equal(observations.status, 200, JSON.stringify(observations));
  const observation = observations.body.items[0];
  assert.equal((await local("PATCH", `/api/hospitation-observations/${observation.id}`, { description: "Offline weiterbearbeitete Beobachtung", expectedUpdatedAt: observation.updatedAt })).status, 200);
  await worker.run(); assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  assert.deepEqual(await readSyncData(localPool), await readSyncData(remoteAdmin));
  const format = await local("POST", "/api/formats", { idempotencyKey: randomUUID(), title: "Synthetisches Offline-Format", formatType: "Roundtable", ownerId: profile.id, status: "Planung" });
  assert.equal(format.status, 201, JSON.stringify(format));
  const formatId = format.body.id;
  const formatPatch = await local("PATCH", `/api/formats/${formatId}`, { title: "Überarbeitetes Offline-Format", expectedUpdatedAt: format.body.updatedAt });
  assert.equal(formatPatch.status, 200, JSON.stringify(formatPatch));
  const participants = await local("POST", `/api/formats/${formatId}/participants/batch`, { items: [{ contactId: id, invitationStatus: "Kandidat" }] });
  assert.equal(participants.status, 200, JSON.stringify(participants));
  const participant = participants.body.participants[0];
  const participantPatch = await local("PATCH", `/api/formats/${formatId}/participants/${id}`, { notes: "Offline ergänzte Teilnahmenotiz", expectedUpdatedAt: participant.updatedAt });
  assert.equal(participantPatch.status, 200, JSON.stringify(participantPatch));
  const archived = await local("POST", `/api/formats/${formatId}/archive`, { expectedUpdatedAt: participantPatch.body.updatedAt });
  assert.equal(archived.status, 200, JSON.stringify(archived));
  assert.equal((await local("POST", `/api/formats/${formatId}/restore`, { expectedUpdatedAt: archived.body.updatedAt })).status, 200);
  await worker.run(); assert.equal((await worker.status()).pending, 0, JSON.stringify(await worker.status()));
  assert.deepEqual(await readSyncData(localPool), await readSyncData(remoteAdmin));
  console.log("Mac-Abgleich: Hospitation mit Bericht und Beobachtung sowie Format, Teilnehmende, Archivierung und Wiederherstellung offline erfolgreich.");
  await remoteAdmin.query("update profiles set avatar_url='gs://synthetic/profile-images/avatar-one.png' where id=$1", [profile.id]);
  await worker.run(); assert.equal((await worker.asset(`/api/profile-avatar/${profile.id}`)).content.toString(), "synthetic-image-1");
  imageVersion = 2;
  await remoteAdmin.query("update profiles set avatar_url='gs://synthetic/profile-images/avatar-two.png' where id=$1", [profile.id]);
  await worker.run(); assert.equal((await worker.asset(`/api/profile-avatar/${profile.id}`)).content.toString(), "synthetic-image-2");
  assert.equal((await localPool.query("select count(*)::int as count from local_app.sync_assets")).rows[0].count, 2, "Vorheriges Bild bleibt wiederherstellbar");
  await remoteAdmin.query("update profiles set avatar_url=null where id=$1", [profile.id]);
  await worker.run(); assert.equal((await worker.asset(`/api/profile-avatar/${profile.id}`)).missing, true);
  assert.ok((await worker.history()).items.length >= 2);
  console.log("Mac-Abgleich: aufeinanderfolgende Offline-Änderungen, privater Dateiabgleich, Bildversionen und lesbarer Konfliktverlauf erfolgreich.");
  const beforeFiles = await readSyncData(localPool);
  imageVersion = 3; assetCalls = 0; limitAssetDownload = true;
  await remoteAdmin.query("update profiles set avatar_url='gs://synthetic/profile-images/avatar-three.png' where id=$1", [profile.id]);
  await remoteAdmin.query("insert into profiles (id,email,display_name,role,active,avatar_url) values ('synthetic-sync-extra','extra@synthetic.example.invalid','Weiteres Testprofil','viewer',true,'gs://synthetic/profile-images/avatar-extra.png')");
  await worker.run();
  assert.equal((await worker.status()).status, "retry_wait");
  assert.equal((await localPool.query("select count(*)::int as count from local_app.sync_assets")).rows[0].count, 3, "Abgeschlossene Datei bleibt nach dem Ratenlimit privat gesichert");
  assert.deepEqual(await readSyncData(localPool), beforeFiles, "Unvollständiger Dateiabgleich ersetzt keine Fachdaten");
  assert.equal((await localPool.query("select count(*)::int as count from local_app.sync_asset_current")).rows[0].count, 0, "Unvollständige Bildfassungen werden noch nicht angezeigt");
  await worker.stop();
  worker = createLocalSync({ pool: localPool, profileId: profile.id, transport, intervalMs: 3600_000 });
  limitAssetDownload = false;
  await worker.run();
  assert.equal(assetCalls, 3, "Nach Neustart wird nur die fehlende Datei erneut angefordert");
  assert.equal((await worker.status()).status, "current");
  assert.equal((await localPool.query("select count(*)::int as count from local_app.sync_asset_current")).rows[0].count, 2);
  assert.deepEqual(await readSyncData(localPool), await readSyncData(remoteAdmin));
  console.log("Mac-Abgleich: unterbrochener Dateiabruf nach Ratenlimit und Neustart fortgesetzt; Daten und Bildfassungen erst vollständig übernommen.");
  remoteUserDisabled = true;
  await worker.run(); assert.equal((await worker.status()).status, "reconnect");
  remoteUserDisabled = false;
  await remoteAdmin.query("update identity_bindings set active=false");
  await worker.run(); assert.equal((await worker.status()).status, "reconnect");
  await remoteAdmin.query("update identity_bindings set active=true");
  await worker.run(); assert.equal((await worker.status()).status, "current");
  const raw = await snapshotForSync(remoteAdmin);
  assert.equal(Object.hasOwn(raw.data, "identity_bindings"), false);
  configuration.iapExternalAccessExpiresAtMs = Date.now() - 1;
  await worker.run(); assert.equal((await worker.status()).status, "reconnect");
  assert.equal(currentSyncContext(), undefined);
  console.log("Mac-Abgleich: Stale-Formularschutz, Fachvalidierung, Uploadsperre, fehlende Vorbedingungen, atomarer FK-Rollback, Löschung, Kontosperre, Binding-Entzug und Zugangsablauf erfolgreich.");
} catch (error) {
  console.error(error.stack || error.message);
  if (localLogs) console.error(localLogs);
  process.exitCode = 1;
} finally {
  await worker?.stop();
  if (localProcess && localProcess.exitCode === null) { const exited = once(localProcess, "exit"); localProcess.kill("SIGTERM"); await exited; }
  if (syncServer) { syncServer.closeAllConnections(); await new Promise(resolve => syncServer.close(resolve)); }
  if (runtime) { runtime.server.closeAllConnections(); await new Promise(resolve => runtime.server.close(resolve)); await runtime.getPool().end(); }
  await localPool?.end(); await remoteAdmin?.end();
  docker(["rm", "--force", container]);
}
