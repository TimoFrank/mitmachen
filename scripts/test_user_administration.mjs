import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { createUserAdministration, adminAccountRows, validateAdminInvitation, assertUserAdministrator, adminFingerprint } from "../api/user-administration.mjs";
import { createAdminInvitationDelivery } from "../api/user-administration-email.mjs";
import { policyForRequest, assertAccessScopePermission } from "../api/security-policy.mjs";
import { safeReturnPath } from "../api/google-hosting.mjs";

const project = "admin-test-project";
const actor = { id: "admin-profile", role: "admin", active: true, access_scope: "standard", scope_ref: null };
const request = (suffix = crypto.randomUUID()) => ({ operationId: crypto.randomUUID(), name: "Testperson", email: `${suffix}@example.invalid`, role: "viewer", emailOwnershipVerified: true });
const rejected = (promise, status) => assert.rejects(promise, error => error.status === status);
for (const value of [null, {}, { ...actor, role: "editor" }, { ...actor, active: false }, { ...actor, access_scope: "test_only", scope_ref: "test" }]) assert.throws(() => assertUserAdministrator(value));
assertUserAdministrator(actor);
for (const value of [{ ...request(), role: "admin" }, { ...request(), emailOwnershipVerified: false }, { ...request(), name: "x\nInjected" }, { ...request(), email: "X@example.invalid" }, { ...request(), uid: "adopt-existing" }]) assert.throws(() => validateAdminInvitation(value));
for (const [method, url] of [["GET", "/api/admin/users"], ["PATCH", "/api/admin/users/a"], ["POST", "/api/admin/users/invitations"], ["POST", "/api/admin/users/invitations/a/send"]]) {
  const policy = policyForRequest(method, url); assert.equal(policy.role, "admin");
  assert.throws(() => assertAccessScopePermission({ ...actor, access_scope: "test_only", scope_ref: "test" }, policy));
}
assert.equal(policyForRequest("DELETE", "/api/admin/users/a"), null);
assert.equal(safeReturnPath("/administration/nutzer"), "/administration/nutzer");
assert.equal(adminAccountRows([{ uid: "other", email: "same@example.invalid" }], [{ id: "p", email: "same@example.invalid" }], [], project)[0].status, "unbound", "Never infer identity from email");

// Real templates, wrapper record and generation-bound object storage, with no external mail/network.
const temporary = await mkdtemp(path.join(os.tmpdir(), "vk-user-admin-"));
try {
  const smtpFile = path.join(temporary, "smtp.json");
  await writeFile(smtpFile, JSON.stringify({ version: 1, host: "w01abca0.kasserver.com", port: 465, security: "implicit_tls", username: "zugang@versorgungs-kompass.de", sender_email: "zugang@versorgungs-kompass.de", password: "synthetic-password-only" }), { mode: 0o600 });
  const objects = new Map(); let safe = true;
  const bucket = {
    getMetadata: async () => [{ iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: safe ? "enforced" : "inherited" } }],
    file: (name, options) => ({ save: async (body, config) => { assert.equal(config.preconditionOpts.ifGenerationMatch, 0); if (objects.has(name)) throw Object.assign(new Error(), { code: 412 }); objects.set(name, body); }, getMetadata: async () => [{ generation: "1" }], download: async () => { assert.equal(options.generation, "1"); return [Buffer.from(objects.get(name))]; } })
  };
  const delivery = await createAdminInvitationDelivery({ bucket, project, accessEnd: new Date(Date.now() + 86400000).toISOString(), smtpFile, transportFactory: options => { assert.equal(options.secure, true); return { sendMail: async mail => ({ accepted: mail.envelope.to }) }; } });
  const input = request("delivery"); const row = { id: input.operationId, uid: `managed-${input.operationId}`, profile_id: crypto.randomUUID(), input };
  const value = await delivery.prepare(row);
  assert.match(value.previewText, /\[Passwort festlegen\]/u);
  assert.doesNotMatch(value.previewText, /[?&]token=/u);
  assert.equal(value.fingerprint, adminFingerprint({ eml: value.eml, accessEnd: value.accessEnd }));
  await delivery.storePrepared(value); await delivery.storePrepared(value);
  assert.ok(Date.parse(await delivery.send(value)));
  const accepted = new Date().toISOString(); await delivery.activate(value, accepted); await delivery.activate(value, accepted);
  assert.equal(objects.size, 2);
  const active = JSON.parse(objects.get(`active/${value.digest}.json`));
  assert.equal(Date.parse(active.expires_at) - Date.parse(active.accepted_at), 48 * 3600000);
  await rejected(delivery.activate(value, new Date(Date.now() + 1000).toISOString()), 409);
  safe = false; await rejected(delivery.check(), 503);
} finally { await rm(temporary, { recursive: true, force: true }); }

if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  if (process.argv.includes("--require-docker")) throw new Error("PostgreSQL-Integration benötigt Docker.");
  console.log("Nutzerverwaltung: Verträge erfolgreich; PostgreSQL-Prüfung ohne Docker übersprungen.");
  process.exit(0);
}
const name = `vk-user-admin-test-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
const docker = args => execFileSync("docker", args, { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let owner, pool;
try {
  docker(["run", "-d", "--rm", "--name", name, "-e", "POSTGRES_PASSWORD=synthetic-only", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
  for (let count = 0; count < 100; count++) {
    if (spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0 && /init process complete/.test(docker(["logs", name]))) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1));
  owner = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres", password: "synthetic-only" }); await owner.connect();
  for (const file of ["schema.sql", "migrations/202609300001_user_administration.sql"]) await owner.query(await readFile(new URL(`../deploy/postgres/pre-gematik/${file}`, import.meta.url), "utf8"));
  await owner.query("create role admin_test_login login password 'synthetic-runtime-only'; grant vk_user_admin_runtime to admin_test_login");
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "admin_test_login", password: "synthetic-runtime-only", database: "postgres", max: 4 });
  const users = new Map(); let sends = 0, activations = 0, revokes = 0, failProvider = false, failSend = false, failActivate = false, failPrepare = false;
  const notFound = () => Object.assign(new Error("not found"), { code: "auth/user-not-found" });
  const auth = {
    listUsers: async () => ({ users: [...users.values()] }),
    getUserByEmail: async email => { const u = [...users.values()].find(v => v.email === email); if (!u) throw notFound(); return u; },
    getUser: async uid => { if (!users.has(uid)) throw notFound(); return users.get(uid); },
    createUser: async value => { const u = { ...value, providerData: [{ providerId: "password" }] }; delete u.password; users.set(u.uid, u); return u; },
    updateUser: async (uid, value) => { if (failProvider) throw new Error("synthetic provider failure"); Object.assign(users.get(uid), value); },
    revokeRefreshTokens: async () => { revokes++; }
  };
  const delivery = { accessEnd: new Date(Date.now() + 86400000).toISOString(), check: async () => {},
    prepare: async row => { if (failPrepare) throw new Error("synthetic prepare failure"); return { fingerprint: "c".repeat(64), subject: "Einladung", previewText: "[Passwort festlegen]", opaqueToken: "never expose this" }; },
    storePrepared: async () => {}, send: async () => { sends++; if (failSend) throw new Error("unknown SMTP result"); return new Date().toISOString(); },
    activate: async () => { activations++; if (failActivate) throw new Error("activation unavailable"); } };
  const admin = createUserAdministration({ pool, auth, delivery, project });
  const seed = async (id, role, enabled = true) => {
    await owner.query("insert into public.profiles(id,email,display_name,role,active) values($1,$2,$1,$3,$4)", [id, `${id}@example.invalid`, role, enabled]);
    await owner.query("insert into public.identity_bindings(issuer,subject,profile_id,active) values('https://cloud.google.com/iap',$1,$2,true)", [`securetoken.google.com/${project}:${id}`, id]);
    users.set(id, { uid: id, email: `${id}@example.invalid`, displayName: id, disabled: !enabled, providerData: [{ providerId: "password" }] });
  };
  await seed(actor.id, "admin"); await seed("second-admin", "admin"); await seed("viewer", "viewer");
  await rejected(admin.list({ ...actor, role: "viewer" }), 403);
  await rejected(admin.list({ ...actor, access_scope: "test_only", scope_ref: "test" }), 403);
  let list = await admin.list(actor);
  const row = id => list.items.find(v => v.id === id);
  await rejected(admin.update(actor, actor.id, { version: row(actor.id).version, role: "viewer", enabled: false }), 409);
  await rejected(admin.update(actor, "viewer", { version: "a".repeat(64), role: "viewer", enabled: false }), 409);
  await admin.update(actor, "viewer", { version: row("viewer").version, role: "editor", enabled: false });
  assert.equal(users.get("viewer").disabled, true); assert.equal(revokes, 1);
  list = await admin.list(actor); assert.equal(row("viewer").status, "blocked");
  const concurrentVersion = row("viewer").version;
  const concurrent = await Promise.allSettled([
    admin.update(actor, "viewer", { version: concurrentVersion, role: "viewer", enabled: false }),
    admin.update(actor, "viewer", { version: concurrentVersion, role: "editor", enabled: false })
  ]);
  assert.equal(concurrent.filter(value => value.status === "fulfilled").length, 1);
  assert.equal(concurrent.find(value => value.status === "rejected").reason.status, 409);

  failProvider = true; await rejected(admin.update(actor, "second-admin", { version: row("second-admin").version, role: "viewer", enabled: true }), 502); failProvider = false;
  assert.equal((await owner.query("select active from public.profiles where id='second-admin'")).rows[0].active, false);
  // An identity-disabled administrator must not count as the remaining active admin.
  users.get(actor.id).disabled = true; await owner.query("update public.profiles set active=true where id='second-admin'");
  list = await admin.list(actor);
  await rejected(admin.update(actor, "second-admin", { version: row("second-admin").version, role: "viewer", enabled: false }), 409);
  users.get(actor.id).disabled = false;
  await rejected(admin.prepare(actor, { ...request(), email: "viewer@example.invalid" }), 409);
  users.set("unbound", { uid: "unbound", email: "unbound@example.invalid" });
  await rejected(admin.prepare(actor, { ...request(), email: "unbound@example.invalid" }), 409);
  const input = request();
  failPrepare = true; await assert.rejects(admin.prepare(actor, input)); failPrepare = false;
  const prepared = await admin.prepare(actor, input);
  assert.equal(prepared.status, "ready"); assert.doesNotMatch(JSON.stringify(prepared), /opaqueToken|never expose/u);
  assert.deepEqual(await admin.prepare(actor, input), prepared);
  await rejected(admin.prepare(actor, { ...input, name: "Changed" }), 409);
  list = await admin.list(actor);
  const uid = `managed-${input.operationId}`;
  await rejected(admin.update(actor, uid, { version: row(uid).version, role: "admin", enabled: true }), 400);
  await rejected(admin.send(actor, input.operationId, { fingerprint: "d".repeat(64) }), 409);
  failActivate = true; await assert.rejects(admin.send(actor, input.operationId, { fingerprint: prepared.preview.fingerprint })); failActivate = false;
  assert.equal(sends, 1);
  assert.equal((await admin.send(actor, input.operationId, { fingerprint: prepared.preview.fingerprint })).status, "sent");
  await admin.send(actor, input.operationId, { fingerprint: prepared.preview.fingerprint }); assert.equal(sends, 1); assert.equal(activations, 2);
  const storedSent = (await owner.query("select package from user_administration.invitations where id=$1", [input.operationId])).rows[0].package;
  assert.deepEqual(Object.keys(storedSent).sort(), ["fingerprint", "previewText", "subject"]);

  const uncertain = request(); const mail = await admin.prepare(actor, uncertain); failSend = true;
  await rejected(admin.send(actor, uncertain.operationId, { fingerprint: mail.preview.fingerprint }), 502); failSend = false;
  await rejected(admin.send(actor, uncertain.operationId, { fingerprint: mail.preview.fingerprint }), 409); assert.equal(sends, 2);
  const changed = request(); const pending = await admin.prepare(actor, changed);
  await owner.query("update public.identity_bindings set scope_ref='external-pilot:other' where subject=$1", [`securetoken.google.com/${project}:managed-${changed.operationId}`]);
  await rejected(admin.send(actor, changed.operationId, { fingerprint: pending.preview.fingerprint }), 409);
  await assert.rejects(pool.query("delete from user_administration.audit"), { code: "42501" });
  await assert.rejects(pool.query("delete from public.profiles"), { code: "42501" });
  await assert.rejects(pool.query("update public.identity_bindings set active=false"), { code: "42501" });
  await owner.query("update public.profiles set role='viewer' where id=$1", [actor.id]);
  await rejected(admin.list(actor), 403);
  assert.ok((await owner.query("select count(*)::int as n from user_administration.audit")).rows[0].n > 10);
  console.log("Nutzerverwaltung: Rollen, Scope, Einladungen, Wiederaufnahme, Versandfehler, Sperren, Konflikte, Postgres-Rechte und Audit erfolgreich geprüft.");
} finally {
  await pool?.end(); await owner?.end();
  spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
