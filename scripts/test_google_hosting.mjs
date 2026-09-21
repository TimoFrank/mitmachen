import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGoogleStateStore } from "../api/google-state.mjs";
import { createGoogleSessions, sessionCookie, assertGoogleBrowserMutation, assertGoogleHostingEnvironment } from "../api/google-session.mjs";
import { createGoogleHostingHandler, safeReturnPath } from "../api/google-hosting.mjs";
import { validateIdentityConfiguration } from "../api/security-policy.mjs";
import { createPasswordResetBroker } from "../api/password-reset-broker.mjs";
import { renderGoogleServices } from "../deploy/google-hosting/render.mjs";
import { addBinding } from "../deploy/google-hosting/google-api.mjs";

const now = Date.parse("2026-09-21T12:00:00Z");
const env = {
  NODE_ENV: "production", API_AUTH_MODE: "identity-platform", GOOGLE_HOSTING_ENABLED: "1",
  IAP_IDENTITY_MODE: "external", IAP_GCIP_PROJECT_ID: "example-project", IAP_GCIP_TENANT_ID: "",
  IAP_EXTERNAL_ACCESS_EXPIRES_AT: "2026-09-30T16:00:00Z",
  IAP_EXTERNAL_LOGIN_PAGE_URI: "https://example.invalid/anmelden", IAP_EXTERNAL_AUTH_API_KEY: "AIza" + "x".repeat(35)
};
const configuration = validateIdentityConfiguration(env, { nowMs: now });
assert.doesNotThrow(() => assertGoogleHostingEnvironment(env));
for (const name of ["FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST"]) {
  assert.throws(() => assertGoogleHostingEnvironment({ ...env, [name]: "localhost:9099" }));
}
const deployment = {
  project: "example-project", region: "europe-west3", revision: "a".repeat(40),
  image: "europe-west3-docker.pkg.dev/example-project/runtime/app@sha256:" + "b".repeat(64),
  origin: "https://example.invalid", appService: "compass-app", resetService: "compass-password-reset",
  network: "compass-vpc", subnet: "compass-run", sqlConnectionName: "example-project:europe-west3:compass-db",
  database: "compass", databaseUser: "compass_app", databaseSecret: { name: "database-password", version: 2 },
  smtpSecret: { name: "smtp-password", version: 3 }, stateBucket: "example-project-runtime-state",
  invitationBucket: "example-project-invitations", apiKey: env.IAP_EXTERNAL_AUTH_API_KEY,
  accessExpiresAt: env.IAP_EXTERNAL_ACCESS_EXPIRES_AT,
  buckets: { profiles: "profile-images", contacts: "contact-images", attachments: "contact-files", stakeholderLogos: "logos" }
};
const services = renderGoogleServices(deployment);
const appContainer = services.app.spec.template.spec.containers[0];
const resetContainer = services.reset.spec.template.spec.containers[0];
assert.equal(appContainer.env.find((value) => value.name === "GOOGLE_CUTOVER_MODE").value, "closed");
assert.equal(resetContainer.env.find((value) => value.name === "GOOGLE_CUTOVER_MODE").value, "closed");
assert.equal(appContainer.env.some((value) => value.name.includes("SMTP")), false);
assert.equal(resetContainer.env.some((value) => value.name.startsWith("DB_")), false);
assert.equal(services.app.spec.template.metadata.annotations["autoscaling.knative.dev/minScale"], "0");
assert.equal(services.app.spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"], "2");
assert.equal(services.app.spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"], "private-ranges-only");
assert.equal(services.hosting.rewrites[0].run.serviceId, deployment.resetService);
assert.equal(services.hosting.rewrites[1].run.serviceId, deployment.appService);
for (const service of [services.app, services.reset]) {
  const memoryMi = service.spec.template.spec.containers.reduce((sum, container) => sum + Number.parseInt(container.resources.limits.memory, 10), 0);
  assert.ok(memoryMi >= 512, "Die zweite Cloud-Run-Ausführungsumgebung benötigt insgesamt mindestens 512 MiB.");
}
const resetIngressHost = "compass-password-reset-example-ey.a.run.app";
const opened = renderGoogleServices({ ...deployment, cutoverMode: "open", resetIngressHost });
assert.equal(opened.reset.spec.template.spec.containers[0].env.find((value) => value.name === "PASSWORD_RESET_CLOUD_RUN_HOST").value, resetIngressHost);
for (const changes of [
  { cutoverMode: "open" }, { resetIngressHost: "*.run.app" },
  { resetIngressHost: "other-service-example-ey.a.run.app" },
  { resetIngressHost: `${resetIngressHost}.attacker.invalid` }
]) assert.throws(() => renderGoogleServices({ ...deployment, ...changes }));
for (const changes of [{ image: deployment.image.split("@")[0] + ":latest" }, { region: "us-central1" }, { databaseSecret: { name: "database-password", version: "latest" } }, { cutoverMode: "unknown" }]) {
  assert.throws(() => renderGoogleServices({ ...deployment, ...changes }));
}
const previousPolicy = { etag: "unchanged", bindings: [{ role: "roles/storage.objectUser", members: ["serviceAccount:previous@example.invalid"] }] };
addBinding(previousPolicy, "roles/storage.objectUser", "serviceAccount:new@example.invalid");
addBinding(previousPolicy, "roles/storage.objectUser", "serviceAccount:new@example.invalid");
assert.deepEqual(previousPolicy.bindings[0].members, ["serviceAccount:previous@example.invalid", "serviceAccount:new@example.invalid"]);
assert.equal(previousPolicy.etag, "unchanged");
for (const override of [{ GOOGLE_HOSTING_ENABLED: "0" }, { IAP_IDENTITY_MODE: "iam" }, { API_AUTH_ALLOW_DEV_PROFILE: "1" }]) {
  assert.throws(() => validateIdentityConfiguration({ ...env, ...override }, { nowMs: now }));
}
const revoked = new Set();
let identityChanges = {};
let disabled = false;
const token = "header.payload.signature";
const claims = {
  uid: "stable-subject", sub: "stable-subject", aud: "example-project", email: "synthetic@example.invalid", email_verified: true,
  auth_time: now / 1000, firebase: { sign_in_provider: "password" }
};
const auth = {
  async verifySessionCookie(value, checkRevoked) {
    assert.equal(checkRevoked, true);
    if (disabled || value !== token) throw new Error("invalid");
    return { ...claims, iss: "https://session.firebase.google.com/example-project", ...identityChanges };
  },
  async verifyIdToken(value, checkRevoked) {
    assert.equal(checkRevoked, true);
    if (disabled || value !== "fresh-id-token") throw new Error("invalid");
    return { ...claims, iss: "https://securetoken.google.com/example-project", ...identityChanges };
  },
  async createSessionCookie(value, options) {
    assert.equal(value, "fresh-id-token"); assert.ok(options.expiresIn <= 8 * 3_600_000); return token;
  }
};
const state = { isRevoked: async (cookie) => revoked.has(cookie), revoke: async (cookie) => revoked.add(cookie), consume: async () => true };
const sessions = createGoogleSessions({ auth, state, configuration, now: () => now });
const request = () => ({ headers: { cookie: `__session=${token}` } });
const verified = await sessions.verify(request());
assert.equal(verified.iss, "https://cloud.google.com/iap");
assert.equal(verified.sub, "securetoken.google.com/example-project:stable-subject");
assert.equal((await sessions.create("fresh-id-token")).seconds, 28_800);
for (const change of [
  { iss: "https://session.firebase.google.com/other-project" }, { aud: "other-project" },
  { sub: "other-user" }, { email_verified: false }, { firebase: { sign_in_provider: "anonymous" } },
  { firebase: { sign_in_provider: "password", tenant: "wrong-tenant" } }
]) {
  identityChanges = change;
  await assert.rejects(() => sessions.verify(request()));
}
identityChanges = { auth_time: now / 1000 - 301 };
await assert.rejects(() => sessions.create("fresh-id-token"));
identityChanges = {};
disabled = true;
await assert.rejects(() => sessions.verify(request()));
disabled = false;
await sessions.logout(request());
await assert.rejects(() => sessions.verify(request()));
revoked.clear();
await assert.rejects(() => createGoogleSessions({ auth, state: { isRevoked: async () => { throw new Error("storage unavailable"); } }, configuration, now: () => now }).verify(request()));
for (const cookie of ["", "__session=a.b.c; __session=x.y.z", "__session=unsigned", "iap=header.payload.signature"]) {
  assert.throws(() => sessionCookie({ headers: { cookie } }));
}
for (const headers of [{}, { origin: "https://attacker.invalid", "content-type": "application/json" }, { origin: "https://example.invalid", "content-type": "text/plain" }]) {
  assert.throws(() => assertGoogleBrowserMutation({ headers }, "https://example.invalid"));
}
for (const value of ["//attacker.invalid/path", "https://attacker.invalid", "/\\attacker.invalid", "/anmelden", "/api/export"]) assert.equal(safeReturnPath(value), "/start");
assert.equal(safeReturnPath("/versorgung/kontakte?query=test#detail"), "/versorgung/kontakte?query=test#detail");

const objects = new Map();
let generation = 0;
const bucket = { file(name) { return {
  async getMetadata() { if (!objects.has(name)) throw { code: 404 }; return [objects.get(name)]; },
  async save(content, options) {
    const expected = options.preconditionOpts?.ifGenerationMatch;
    if (expected != null && expected !== (objects.get(name)?.generation || 0)) throw { code: 412 };
    objects.set(name, { generation: ++generation, metadata: options.metadata?.metadata });
  },
  async exists() { return [objects.has(name)]; }
}; } };
const store1 = createGoogleStateStore({ bucket, now: () => now });
const store2 = createGoogleStateStore({ bucket, now: () => now });
const limits = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? store1 : store2).consume("shared", 3, 60_000)));
assert.equal(limits.filter(Boolean).length, 3, "Mehrere Instanzen dürfen die gemeinsame Grenze nicht überschreiten.");
await store1.revoke(token);
assert.equal(await store2.isRevoked(token), true);
assert.ok([...objects.keys()].every((name) => !name.includes("synthetic") && !name.includes(token)));
await assert.rejects(() => createGoogleStateStore({ bucket: { file() { return { getMetadata: async () => { throw { code: 403 }; } }; } } }).consume("fail", 2, 60_000));

let finishDelivery;
let deliveryStarted;
const started = new Promise((resolve) => { deliveryStarted = resolve; });
const broker = createPasswordResetBroker({
  identityClient: { lookupByEmail: async () => ({ localId: "test", email: "test@example.invalid", emailVerified: true, providerUserInfo: [{ providerId: "password", email: "test@example.invalid" }], passwordHash: "hash" }), generatePasswordResetActionUrl: async () => "https://example.invalid/action" },
  sendPasswordResetEmail: async () => { deliveryStarted(); await new Promise((resolve) => { finishDelivery = resolve; }); },
  awaitDelivery: true, minimumResponseMs: 0, rateLimiter: { allow: async () => true }
});
let completed = false;
const delivery = broker.request({ email: "test@example.invalid", clientIp: "127.0.0.1" }).then(() => { completed = true; });
await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error("Versand nicht gestartet")), 2000))]);
assert.equal(completed, false, "Cloud Run darf nicht vor Ende des Versands antworten.");
finishDelivery(); await delivery; assert.equal(completed, true);

const directory = await mkdtemp(path.join(os.tmpdir(), "vk-google-test-"));
const server = http.createServer(createGoogleHostingHandler({
  apiHandler: async (req, res) => { await sessions.verify(req); res.end("protected-api"); },
  resolveProfile: (req) => sessions.verify(req), sessions, state,
  root: directory, origin: "https://example.invalid", cutoverMode: "open"
}));
try {
  await writeFile(path.join(directory, "public-index.html"), "public-entry");
  await writeFile(path.join(directory, "versorgungs-kompass.html"), "protected-app");
  await symlink("/etc/passwd", path.join(directory, "escape.txt"));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const publicResponse = await fetch(base); assert.equal(await publicResponse.text(), "public-entry");
  assert.match(publicResponse.headers.get("cache-control"), /no-store/u);
  const denied = await fetch(base + "/start", { redirect: "manual", headers: { "x-goog-iap-jwt-assertion": token, "x-auth-request-user": "admin" } });
  assert.equal(denied.status, 302);
  assert.match(denied.headers.get("location"), /^\/anmelden\?/u);
  assert.equal((await fetch(base + "/api/session")).status, 401);
  const permitted = await fetch(base + "/start", { headers: request().headers });
  assert.equal(await permitted.text(), "protected-app");
  assert.equal((await fetch(base + "/escape.txt", { headers: request().headers })).status, 404);
  assert.equal((await fetch(base + "/api/auth/session", { method: "POST", body: '{}' })).status, 403);
  const loggedIn = await fetch(base + "/api/auth/session", { method: "POST", headers: { origin: "https://example.invalid", "content-type": "application/json" }, body: JSON.stringify({ idToken: "fresh-id-token" }) });
  assert.equal(loggedIn.status, 200);
  assert.match(loggedIn.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Lax/u);
} finally {
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
console.log("Google Hosting: Identität, Sperrung, CSRF, gemeinsame Limits, wartender Mailversand und HTTP-Grenzen erfolgreich.");
