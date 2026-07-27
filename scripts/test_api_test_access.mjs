import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";

import {
  WRITE_CLASSES,
  accessScopeForProfile,
  assertAccessScopePermission,
  assertIapJwtClaims,
  policyForRequest,
  sessionCapabilities,
  validateIdentityConfiguration
} from "../api/security-policy.mjs";
import {
  ENROLLMENT_GLOBAL_LOCK_NAME,
  IAP_IDENTITY_ISSUER,
  assertEmptyEnrollmentRequest,
  canonicalIapSubject,
  canonicalVerifiedEmail,
  consumeAllowlistedIapIdentity,
  enrollVerifiedIapIdentity,
  submitIapAutoEnrollment,
  submitIapEnrollment
} from "../api/test-access-enrollment.mjs";
import { normalizedRequestLogPath } from "../api/request-log-privacy.mjs";

const projectRoot = new URL("../", import.meta.url);
const apiSource = readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const enrollmentSource = readFileSync(new URL("api/test-access-enrollment.mjs", projectRoot), "utf8");
const frontendSource = readFileSync(new URL("frontend/app/versorgungs-kompass.js", projectRoot), "utf8");

for (const [method, pathname, role, writeClass] of [
  ["GET", "/api/contacts", "viewer", WRITE_CLASSES.READ],
  ["POST", "/api/contacts", "editor", WRITE_CLASSES.TEST_OBJECT_CREATE],
  ["PATCH", "/api/contacts/contact-1", "editor", WRITE_CLASSES.TEST_OBJECT_UPDATE],
  ["POST", "/api/organizations", "editor", WRITE_CLASSES.TEST_OBJECT_CREATE],
  ["PATCH", "/api/organizations/organization-1", "editor", WRITE_CLASSES.TEST_OBJECT_UPDATE],
  ["PATCH", "/api/profile", "viewer", WRITE_CLASSES.SELF_SERVICE],
  ["POST", "/api/saved-views", "viewer", WRITE_CLASSES.SELF_SERVICE],
  ["DELETE", "/api/saved-views/view-1", "viewer", WRITE_CLASSES.SELF_SERVICE],
  ["PUT", "/api/user-settings", "viewer", WRITE_CLASSES.SELF_SERVICE],
  ["PATCH", "/api/notifications/read", "viewer", WRITE_CLASSES.SELF_SERVICE],
  ["POST", "/api/profile/avatar", "viewer", WRITE_CLASSES.RESTRICTED],
  ["POST", "/api/contact-notes", "editor", WRITE_CLASSES.RESTRICTED],
  ["POST", "/api/stakeholder-import", "admin", WRITE_CLASSES.RESTRICTED],
  ["DELETE", "/api/hospitations/hospitation-1", "admin", WRITE_CLASSES.RESTRICTED],
  ["GET", "/api/export", "admin", WRITE_CLASSES.RESTRICTED]
]) {
  const policy = policyForRequest(method, pathname);
  assert.equal(policy?.role, role, `${method} ${pathname}: Rollenstufe stimmt nicht.`);
  assert.equal(policy?.writeClass, writeClass, `${method} ${pathname}: Write-Class stimmt nicht.`);
}
assert.equal(policyForRequest("POST", "/api/unknown-write"), null, "Unbekannte Writes muessen fail-closed bleiben.");
assert.equal(policyForRequest("POST", "/api/auth/auto-enrollment"), null, "Auto-Enrollment muss fail-closed entfernt sein.");
assert.equal(policyForRequest("POST", "/api/auth/enrollment"), null, "Manuelles Enrollment muss fail-closed entfernt sein.");
assert.equal(
  normalizedRequestLogPath("/api/auth/auto-enrollment"),
  "/api/:unmatched",
  "Entferntes Auto-Enrollment muss nur noch als unbekannte API-Route protokolliert werden."
);

const iapAudience = "/projects/123/global/backendServices/456";
const iapNow = 2_000_000_000;
const validIapClaims = {
  iss: IAP_IDENTITY_ISSUER,
  aud: iapAudience,
  iat: iapNow - 300,
  exp: iapNow + 300,
  nbf: iapNow - 300
};
assert.doesNotThrow(() => assertIapJwtClaims(validIapClaims, iapAudience, { nowSeconds: iapNow }));
for (const boundaryClaims of [
  { ...validIapClaims, iat: iapNow + 30, nbf: iapNow + 30, exp: iapNow + 660 },
  { ...validIapClaims, iat: iapNow - 629, nbf: iapNow - 629, exp: iapNow - 29 },
  { ...validIapClaims, nbf: iapNow + 30, exp: iapNow + 300 }
]) {
  assert.doesNotThrow(
    () => assertIapJwtClaims(boundaryClaims, iapAudience, { nowSeconds: iapNow }),
    "IAP-Claims an der erlaubten Skew-/Laufzeitgrenze muessen gueltig bleiben."
  );
}

const missingExp = { ...validIapClaims };
delete missingExp.exp;
const missingIat = { ...validIapClaims };
delete missingIat.iat;
for (const [label, claims] of [
  ["missing exp", missingExp],
  ["missing iat", missingIat],
  ["NaN exp", { ...validIapClaims, exp: Number.NaN }],
  ["NaN iat", { ...validIapClaims, iat: Number.NaN }],
  ["string exp", { ...validIapClaims, exp: String(validIapClaims.exp) }],
  ["string iat", { ...validIapClaims, iat: String(validIapClaims.iat) }],
  ["exp equals iat", { ...validIapClaims, exp: validIapClaims.iat }],
  ["exp before iat", { ...validIapClaims, exp: validIapClaims.iat - 1 }],
  ["expired beyond skew", { ...validIapClaims, iat: iapNow - 630, exp: iapNow - 30 }],
  ["future iat", { ...validIapClaims, iat: iapNow + 31, exp: iapNow + 300 }],
  ["future nbf", { ...validIapClaims, nbf: iapNow + 31 }],
  ["nbf after exp", { ...validIapClaims, nbf: iapNow + 21, exp: iapNow + 20 }],
  ["lifetime over ten minutes plus skew", { ...validIapClaims, iat: iapNow - 331, exp: iapNow + 300 }],
  ["issuer mismatch", { ...validIapClaims, iss: "https://attacker.example.invalid" }],
  ["audience mismatch", { ...validIapClaims, aud: "/projects/attacker/global/backendServices/1" }]
]) {
  assert.throws(
    () => assertIapJwtClaims(claims, iapAudience, { nowSeconds: iapNow }),
    (error) => error.status === 401,
    `IAP-Negativfall muss fail-closed bleiben: ${label}.`
  );
}

const iapRuntimeEnvironment = {
  API_AUTH_MODE: "iap",
  IAP_JWT_AUDIENCE: iapAudience
};
assert.equal(validateIdentityConfiguration(iapRuntimeEnvironment).mode, "iap");

const standardEditor = { role: "editor", access_scope: "standard", scope_ref: null };
const testViewer = { role: "viewer", access_scope: "test_only", scope_ref: "cohort-a" };
const testEditor = { role: "editor", access_scope: "test_only", scope_ref: "cohort-a" };
const invalidTestEditor = { role: "editor", access_scope: "test_only", scope_ref: "" };

assert.equal(accessScopeForProfile(standardEditor), "standard");
assert.equal(accessScopeForProfile(testEditor), "test_only");
for (const writeClass of Object.values(WRITE_CLASSES)) {
  assert.doesNotThrow(
    () => assertAccessScopePermission(standardEditor, { writeClass }),
    `Standardrollen duerfen ihren bestehenden Vertrag fuer ${writeClass} behalten.`
  );
}
for (const writeClass of [
  WRITE_CLASSES.READ,
  WRITE_CLASSES.SELF_SERVICE,
  WRITE_CLASSES.TEST_OBJECT_CREATE,
  WRITE_CLASSES.TEST_OBJECT_UPDATE
]) {
  assert.doesNotThrow(() => assertAccessScopePermission(testEditor, { writeClass }));
}
for (const writeClass of [WRITE_CLASSES.RESTRICTED]) {
  assert.throws(
    () => assertAccessScopePermission(testEditor, { writeClass }),
    (error) => error.status === 403
  );
}
assert.throws(
  () => assertAccessScopePermission(invalidTestEditor, { writeClass: WRITE_CLASSES.READ }),
  (error) => error.status === 403,
  "Testzugang ohne feste Kohorte darf auch Reads nicht erhalten."
);
assert.throws(
  () => assertAccessScopePermission({ role: "admin", access_scope: "future_scope" }, { writeClass: WRITE_CLASSES.READ }),
  (error) => error.status === 403,
  "Unbekannte Scopes muessen fail-closed bleiben."
);

assert.deepEqual(sessionCapabilities(standardEditor), {
  canRead: true,
  canSelfService: true,
  canWriteDomain: true,
  canCreateTestObjects: false,
  canEditTestObjects: false,
  canDelete: false,
  canExport: false,
  canOperate: false
});
assert.deepEqual(sessionCapabilities(testViewer), {
  canRead: true,
  canSelfService: true,
  canWriteDomain: false,
  canCreateTestObjects: false,
  canEditTestObjects: false,
  canDelete: false,
  canExport: false,
  canOperate: false
});
assert.deepEqual(sessionCapabilities(testEditor), {
  canRead: true,
  canSelfService: true,
  canWriteDomain: false,
  canCreateTestObjects: true,
  canEditTestObjects: true,
  canDelete: false,
  canExport: false,
  canOperate: false
});

assert.equal(canonicalIapSubject("accounts.google.com:123456789"), "123456789");
assert.equal(canonicalIapSubject("external-subject"), "external-subject");
assert.equal(canonicalIapSubject("accounts.google.com:not-numeric"), "accounts.google.com:not-numeric");
assert.equal(
  canonicalVerifiedEmail(" Test.User+Tag@Example.COM "),
  "test.user+tag@example.com",
  "Plus- und Punktadressierung muss unveraendert bleiben; nur ASCII-Grossbuchstaben werden normalisiert."
);
for (const invalidEmail of [
  "tést@example.invalid",
  "tester@exämple.invalid",
  "tester%tag@example.invalid",
  "tester*tag@example.invalid",
  "tester@@example.invalid",
  "@example.invalid",
  "tester@",
  "tester @example.invalid",
  12345
]) {
  assert.throws(
    () => canonicalVerifiedEmail(invalidEmail),
    (error) => error.status === 401,
    `Nicht exakt allowlist-faehige IAP-E-Mail muss abgelehnt werden: ${String(invalidEmail)}`
  );
}
await assert.doesNotReject(assertEmptyEnrollmentRequest(Readable.from([])));
await assert.rejects(
  assertEmptyEnrollmentRequest(Readable.from([Buffer.from("{}")])),
  (error) => error.status === 400
);

function fakeEnrollmentPool(initial = {}) {
  const state = {
    binding: Boolean(initial.binding),
    enrollment: initial.enrollment ? { ...initial.enrollment } : null,
    generatedRequestId: initial.generatedRequestId || "11111111-1111-4111-8111-111111111111",
    connectCount: 0,
    committed: false,
    rollbackAttempted: false,
    rolledBack: false,
    released: false,
    releaseError: null,
    queries: []
  };
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/gu, " ").trim();
      state.queries.push({ sql: normalized, params });
      if (normalized === "commit") {
        state.committed = true;
        return { rows: [] };
      }
      if (normalized === "rollback") {
        state.rollbackAttempted = true;
        if (initial.rollbackError) throw initial.rollbackError;
        state.rolledBack = true;
        return { rows: [] };
      }
      if (normalized === "begin") return { rows: [] };
      if (initial.queryError && normalized.startsWith(String(initial.failOn || ""))) {
        throw initial.queryError;
      }
      if (/^select 1 from public\.identity_bindings/u.test(normalized)) {
        return { rows: state.binding ? [{ "?column?": 1 }] : [] };
      }
      if (/^select request_id, status, expires_at, verified_email from public\.identity_enrollment_requests/u.test(normalized)) {
        return { rows: state.enrollment ? [{ ...state.enrollment }] : [] };
      }
      if (/^insert into public\.identity_enrollment_requests/u.test(normalized)) {
        state.enrollment = {
          request_id: state.generatedRequestId,
          status: "pending",
          expires_at: params[3],
          verified_email: params[2]
        };
        state.storedIdentity = { issuer: params[0], subject: params[1], email: params[2] };
        return { rows: [{ ...state.enrollment }] };
      }
      if (/^update public\.identity_enrollment_requests set last_seen_at/u.test(normalized)) {
        return { rows: [{ ...state.enrollment }] };
      }
      return { rows: [] };
    },
    release(error) {
      state.released = true;
      state.releaseError = error || null;
    }
  };
  return {
    state,
    async connect() {
      state.connectCount += 1;
      if (initial.connectError) throw initial.connectError;
      return client;
    }
  };
}

const verifiedPayload = {
  iss: IAP_IDENTITY_ISSUER,
  sub: "accounts.google.com:123456789",
  email: "Tester@Example.invalid"
};
const fixedNow = new Date("2026-07-24T10:00:00.000Z");
const firstRequestId = "11111111-1111-4111-8111-111111111111";
const firstPool = fakeEnrollmentPool({ generatedRequestId: firstRequestId });
const first = await enrollVerifiedIapIdentity(firstPool, verifiedPayload, {
  now: fixedNow
});
assert.deepEqual(first, {
  requestId: firstRequestId,
  status: "pending",
  expiresAt: "2026-07-25T10:00:00.000Z"
});
assert.deepEqual(firstPool.state.storedIdentity, {
  issuer: IAP_IDENTITY_ISSUER,
  subject: "123456789",
  email: "tester@example.invalid"
});
assert.equal(firstPool.state.released, true);
assert.deepEqual(Object.keys(first).sort(), ["expiresAt", "requestId", "status"], "Enrollment-Antwort darf keine PII enthalten.");

const pendingExpiry = "2026-07-25T09:00:00.000Z";
const pendingPool = fakeEnrollmentPool({
  enrollment: {
    request_id: firstRequestId,
    status: "pending",
    expires_at: pendingExpiry,
    verified_email: "tester@example.invalid"
  }
});
const repeated = await enrollVerifiedIapIdentity(pendingPool, verifiedPayload, {
  now: fixedNow
});
assert.deepEqual(repeated, {
  requestId: firstRequestId,
  status: "pending",
  expiresAt: pendingExpiry
});
assert.equal(
  pendingPool.state.queries.some((query) => query.sql.startsWith("insert into public.identity_enrollment_requests")),
  false
);
const manualGlobalLockIndex = pendingPool.state.queries.findIndex((query) =>
  query.sql === "select pg_advisory_xact_lock(hashtext($1))"
);
const manualSubjectLockIndex = pendingPool.state.queries.findIndex((query) =>
  query.sql === "select pg_advisory_xact_lock(hashtextextended($1 || chr(31) || $2, 0))"
);
const manualRequestReadIndex = pendingPool.state.queries.findIndex((query) =>
  query.sql.startsWith("select request_id, status, expires_at, verified_email")
);
assert.ok(
  manualGlobalLockIndex >= 0
    && manualGlobalLockIndex < manualSubjectLockIndex
    && manualSubjectLockIndex < manualRequestReadIndex,
  "Manuelles Enrollment muss globalen Lock vor Subject-Lock und Request-Read nehmen."
);
assert.deepEqual(pendingPool.state.queries[manualGlobalLockIndex].params, [ENROLLMENT_GLOBAL_LOCK_NAME]);

const mismatchedEmailPool = fakeEnrollmentPool({
  enrollment: {
    request_id: firstRequestId,
    status: "pending",
    expires_at: pendingExpiry,
    verified_email: "other@example.invalid"
  }
});
await assert.rejects(
  enrollVerifiedIapIdentity(mismatchedEmailPool, verifiedPayload, { now: fixedNow }),
  (error) => error.status === 403
);
assert.equal(
  mismatchedEmailPool.state.queries.some((query) =>
    query.sql.startsWith("update public.identity_enrollment_requests")
    || query.sql.startsWith("insert into public.identity_enrollment_requests")
  ),
  false,
  "Pending-Replay mit abweichender verifizierter E-Mail darf weder aktualisieren noch neu anlegen."
);

for (const initial of [
  { binding: true },
  { enrollment: { request_id: firstRequestId, status: "pending", expires_at: "2026-07-23T10:00:00.000Z", verified_email: "tester@example.invalid" } },
  { enrollment: { request_id: firstRequestId, status: "expired", expires_at: "2026-07-23T10:00:00.000Z", verified_email: "tester@example.invalid" } },
  { enrollment: { request_id: firstRequestId, status: "rejected", expires_at: pendingExpiry, verified_email: "tester@example.invalid" } },
  { enrollment: { request_id: firstRequestId, status: "applied", expires_at: pendingExpiry, verified_email: "tester@example.invalid" } }
]) {
  const blockedPool = fakeEnrollmentPool(initial);
  await assert.rejects(
    enrollVerifiedIapIdentity(blockedPool, verifiedPayload, { now: fixedNow }),
    (error) => error.status === 403
  );
  assert.equal(
    blockedPool.state.queries.some((query) => query.sql.startsWith("insert into public.identity_enrollment_requests")),
    false
  );
}

const sensitiveManualConnectError = new Error("sensitive connect detail for tester@example.invalid");
const manualConnectFailurePool = fakeEnrollmentPool({
  connectError: sensitiveManualConnectError
});
await assert.rejects(
  enrollVerifiedIapIdentity(manualConnectFailurePool, verifiedPayload, { now: fixedNow }),
  (error) =>
    error.status === 503
    && error.message === "Registrierungsanfrage konnte nicht sicher verarbeitet werden."
    && !error.message.includes("tester@example.invalid")
);
assert.equal(manualConnectFailurePool.state.connectCount, 1);
assert.equal(manualConnectFailurePool.state.rollbackAttempted, false);
assert.equal(manualConnectFailurePool.state.released, false);

for (const [stage, failOn] of [
  ["lock", "select pg_advisory_xact_lock(hashtext($1))"],
  ["database", "select 1 from public.identity_bindings"]
]) {
  const sensitiveQueryError = new Error(`sensitive ${stage} detail for tester@example.invalid`);
  const manualQueryFailurePool = fakeEnrollmentPool({
    failOn,
    queryError: sensitiveQueryError
  });
  await assert.rejects(
    enrollVerifiedIapIdentity(manualQueryFailurePool, verifiedPayload, { now: fixedNow }),
    (error) =>
      error.status === 503
      && error.message === "Registrierungsanfrage konnte nicht sicher verarbeitet werden."
      && !error.message.includes("tester@example.invalid"),
    `Manueller ${stage}-Fehler muss PII-sicher als 503 enden.`
  );
  assert.equal(manualQueryFailurePool.state.rollbackAttempted, true);
  assert.equal(manualQueryFailurePool.state.rolledBack, true);
  assert.equal(manualQueryFailurePool.state.released, true);
  assert.equal(manualQueryFailurePool.state.releaseError, null);
}

const manualRollbackError = new Error("sensitive manual rollback failure");
const manualRollbackFailurePool = fakeEnrollmentPool({
  binding: true,
  rollbackError: manualRollbackError
});
await assert.rejects(
  enrollVerifiedIapIdentity(manualRollbackFailurePool, verifiedPayload, { now: fixedNow }),
  (error) => error.status === 403 && error.message === "Diese Identitaet kann nicht erneut registriert werden."
);
assert.equal(manualRollbackFailurePool.state.rollbackAttempted, true);
assert.equal(manualRollbackFailurePool.state.rolledBack, false);
assert.equal(manualRollbackFailurePool.state.released, true);
assert.equal(
  manualRollbackFailurePool.state.releaseError,
  manualRollbackError,
  "Client mit fehlgeschlagenem manuellem ROLLBACK muss aus dem Pool verworfen werden."
);

function fakeAutoEnrollmentPool({ rows = [], error = null, rollbackError = null } = {}) {
  const state = {
    connectCount: 0,
    functionCallCount: 0,
    committed: false,
    rollbackAttempted: false,
    rolledBack: false,
    released: false,
    releaseError: null,
    queries: []
  };
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/gu, " ").trim();
      state.queries.push({ sql: normalized, params });
      if (normalized === "commit") {
        state.committed = true;
        return { rows: [] };
      }
      if (normalized === "rollback") {
        state.rollbackAttempted = true;
        if (rollbackError) throw rollbackError;
        state.rolledBack = true;
        return { rows: [] };
      }
      if (
        normalized === "begin"
        || normalized.startsWith("set local ")
        || normalized.startsWith("select pg_advisory_xact_lock(")
      ) return { rows: [] };
      state.functionCallCount += 1;
      if (error) throw error;
      return { rows: rows.map((row) => ({ ...row })) };
    },
    release(discardError) {
      state.released = true;
      state.releaseError = discardError || null;
    }
  };
  return {
    state,
    async connect() {
      state.connectCount += 1;
      return client;
    }
  };
}

const autoRequestId = "22222222-2222-4222-8222-222222222222";
const allowlistId = "33333333-3333-4333-8333-333333333333";
const appliedAutoEnrollment = {
  request_id: autoRequestId,
  status: "applied",
  expires_at: "2026-07-25T10:00:00.000Z",
  allowlist_id: allowlistId,
  profile_id: "tester-profile-1",
  role: "viewer",
  access_scope: "test_only",
  scope_ref: "pre-gematik-external-test-2026-08"
};
const autoPool = fakeAutoEnrollmentPool({ rows: [appliedAutoEnrollment] });
const autoResult = await consumeAllowlistedIapIdentity(autoPool, verifiedPayload, {
  now: fixedNow,
  requestIdFactory: () => autoRequestId
});
assert.deepEqual(autoResult, {
  status: "active",
  enrollmentId: autoRequestId
});
assert.deepEqual(Object.keys(autoResult).sort(), ["enrollmentId", "status"], "Auto-Enrollment-Antwort darf keine PII enthalten.");
assert.equal(autoPool.state.functionCallCount, 1, "Allowlist, Profil, Binding und Konsum muessen in genau einem DB-Statement erfolgen.");
assert.equal(autoPool.state.committed, true);
assert.equal(autoPool.state.rolledBack, false);
assert.equal(autoPool.state.released, true);
const autoFunctionQuery = autoPool.state.queries.find((query) =>
  query.sql.includes("pre_gematik_consume_test_access_allowlist")
);
const autoGlobalLockIndex = autoPool.state.queries.findIndex((query) =>
  query.sql === "select pg_advisory_xact_lock(hashtext($1))"
);
const autoSubjectLockIndex = autoPool.state.queries.findIndex((query) =>
  query.sql === "select pg_advisory_xact_lock(hashtextextended($1 || chr(31) || $2, 0))"
);
const autoFunctionIndex = autoPool.state.queries.findIndex((query) =>
  query.sql.includes("pre_gematik_consume_test_access_allowlist")
);
assert.ok(
  autoGlobalLockIndex >= 0
    && autoGlobalLockIndex < autoSubjectLockIndex
    && autoSubjectLockIndex < autoFunctionIndex,
  "Auto-Enrollment muss globalen Lock vor Subject-Lock und Allowlist-Konsum nehmen."
);
assert.deepEqual(autoPool.state.queries[autoGlobalLockIndex].params, [ENROLLMENT_GLOBAL_LOCK_NAME]);
assert.match(
  autoFunctionQuery.sql,
  /from public\.pre_gematik_consume_test_access_allowlist\(\$1, \$2, \$3, \$4, \$5, \$6\)$/u
);
assert.deepEqual(autoFunctionQuery.params.slice(0, 4), [
  autoRequestId,
  IAP_IDENTITY_ISSUER,
  "123456789",
  "tester@example.invalid"
]);
assert.equal(autoFunctionQuery.params[4], fixedNow);
assert.equal(autoFunctionQuery.params[5].toISOString(), "2026-07-25T10:00:00.000Z");

for (const role of ["viewer", "editor"]) {
  const allowedPool = fakeAutoEnrollmentPool({ rows: [{ ...appliedAutoEnrollment, role }] });
  await assert.doesNotReject(consumeAllowlistedIapIdentity(allowedPool, verifiedPayload, {
    now: fixedNow,
    requestIdFactory: () => autoRequestId
  }));
}

const noMatchPool = fakeAutoEnrollmentPool();
await assert.rejects(
  consumeAllowlistedIapIdentity(noMatchPool, verifiedPayload, {
    now: fixedNow,
    requestIdFactory: () => autoRequestId
  }),
  (error) => error.status === 404 && error.message === "Kein automatischer Testzugang verfuegbar."
);
assert.equal(noMatchPool.state.functionCallCount, 1);
assert.equal(noMatchPool.state.committed, false);
assert.equal(noMatchPool.state.rolledBack, true);
assert.equal(noMatchPool.state.released, true);
assert.doesNotMatch(
  noMatchPool.state.queries.map((query) => query.sql).join("\n"),
  /insert into public\.identity_enrollment_requests/u,
  "No-Match darf nicht implizit den manuellen Pending-Flow ausloesen."
);

const autoRollbackError = new Error("sensitive auto rollback failure");
const autoRollbackFailurePool = fakeAutoEnrollmentPool({
  rollbackError: autoRollbackError
});
await assert.rejects(
  consumeAllowlistedIapIdentity(autoRollbackFailurePool, verifiedPayload, {
    now: fixedNow,
    requestIdFactory: () => autoRequestId
  }),
  (error) => error.status === 404 && error.message === "Kein automatischer Testzugang verfuegbar."
);
assert.equal(autoRollbackFailurePool.state.rollbackAttempted, true);
assert.equal(autoRollbackFailurePool.state.rolledBack, false);
assert.equal(autoRollbackFailurePool.state.released, true);
assert.equal(
  autoRollbackFailurePool.state.releaseError,
  autoRollbackError,
  "Client mit fehlgeschlagenem Auto-Enrollment-ROLLBACK muss aus dem Pool verworfen werden."
);

for (const invalidRows of [
  [{ ...appliedAutoEnrollment, status: "pending" }],
  [{ ...appliedAutoEnrollment, role: "admin" }],
  [{ ...appliedAutoEnrollment, access_scope: "standard" }],
  [{ ...appliedAutoEnrollment, scope_ref: "" }],
  [{ ...appliedAutoEnrollment, expires_at: "2026-07-24T09:59:59.000Z" }],
  [{ ...appliedAutoEnrollment, allowlist_id: "not-a-uuid" }],
  [appliedAutoEnrollment, { ...appliedAutoEnrollment }]
]) {
  const invalidPool = fakeAutoEnrollmentPool({ rows: invalidRows });
  await assert.rejects(
    consumeAllowlistedIapIdentity(invalidPool, verifiedPayload, {
      now: fixedNow,
      requestIdFactory: () => autoRequestId
    }),
    (error) => error.status === 503,
    "Mehrdeutige oder unsichere DB-Ergebnisse muessen fail-closed bleiben."
  );
  assert.equal(invalidPool.state.committed, false);
  assert.equal(invalidPool.state.rolledBack, true);
}

const failingAutoPool = fakeAutoEnrollmentPool({ error: new Error("sensitive database detail") });
await assert.rejects(
  consumeAllowlistedIapIdentity(failingAutoPool, verifiedPayload, {
    now: fixedNow,
    requestIdFactory: () => autoRequestId
  }),
  (error) => error.status === 503 && !error.message.includes("sensitive database detail")
);
assert.equal(failingAutoPool.state.committed, false);
assert.equal(failingAutoPool.state.rolledBack, true);
assert.equal(failingAutoPool.state.released, true);

for (const invalidPayload of [
  { ...verifiedPayload, email: "not-an-email" },
  { ...verifiedPayload, email: "tést@example.invalid" },
  { ...verifiedPayload, email: "tester%tag@example.invalid" },
  { ...verifiedPayload, email: "tester*tag@example.invalid" },
  { ...verifiedPayload, email: "tester@@example.invalid" },
  { ...verifiedPayload, sub: "subject\u0000unsafe" },
  { ...verifiedPayload, iss: "https://attacker.example.invalid" }
]) {
  const untouchedPool = fakeAutoEnrollmentPool({ rows: [appliedAutoEnrollment] });
  await assert.rejects(
    consumeAllowlistedIapIdentity(untouchedPool, invalidPayload, {
      now: fixedNow,
      requestIdFactory: () => autoRequestId
    }),
    (error) => error.status === 401
  );
  assert.equal(untouchedPool.state.connectCount, 0, "Ungueltige verifizierte Claims duerfen keine DB-Verbindung ausloesen.");
}

let forgedAutoPoolCalls = 0;
const untouchedAutoPool = {
  async connect() {
    forgedAutoPoolCalls += 1;
    throw new Error("Gefälschtes IAP-JWT darf die Auto-Enrollment-Funktion nicht aufrufen.");
  }
};
await assert.rejects(
  submitIapAutoEnrollment(Readable.from([]), {
    verifyIapJwt: async () => {
      throw Object.assign(new Error("IAP-JWT-Signatur ist ungueltig."), { status: 401 });
    },
    pool: untouchedAutoPool
  }),
  (error) => error.status === 401
);
assert.equal(forgedAutoPoolCalls, 0);

let autoBodyVerifyCalls = 0;
await assert.rejects(
  submitIapAutoEnrollment(Readable.from([Buffer.from(JSON.stringify({ email: "attacker@example.invalid" }))]), {
    verifyIapJwt: async () => {
      autoBodyVerifyCalls += 1;
      return verifiedPayload;
    },
    pool: untouchedAutoPool
  }),
  (error) => error.status === 400
);
assert.equal(autoBodyVerifyCalls, 0);
assert.equal(forgedAutoPoolCalls, 0);

let forgedPoolConnections = 0;
const noDatabasePool = {
  async connect() {
    forgedPoolConnections += 1;
    throw new Error("Datenbank darf fuer ein ungeprueftes JWT nicht erreicht werden.");
  }
};
await assert.rejects(
  submitIapEnrollment(Readable.from([]), {
    verifyIapJwt: async () => {
      throw Object.assign(new Error("IAP-JWT-Signatur ist ungueltig."), { status: 401 });
    },
    pool: noDatabasePool
  }),
  (error) => error.status === 401
);
assert.equal(forgedPoolConnections, 0, "Gefälschtes JWT darf keinen DB-Zugriff ausloesen.");

let bodyVerifyCalls = 0;
await assert.rejects(
  submitIapEnrollment(Readable.from([Buffer.from(JSON.stringify({ email: "attacker@example.invalid" }))]), {
    verifyIapJwt: async () => {
      bodyVerifyCalls += 1;
      return verifiedPayload;
    },
    pool: noDatabasePool
  }),
  (error) => error.status === 400
);
assert.equal(bodyVerifyCalls, 0, "Clientseitige Identitaetsdaten muessen vor jeder Identity-Verarbeitung abgewiesen werden.");
assert.equal(forgedPoolConnections, 0);

for (const contract of [
  "select p.*, binding.access_scope, binding.scope_ref",
  "assertAccessScopePermission(profile, policy);",
  "await registerTestAccessObject(transaction, request, \"contacts\", row.id);",
  "await registerTestAccessObject(transaction, request, \"organizations\", row.id);",
  "await assertTestObjectScope(transaction, request, \"contacts\", id);",
  "await assertTestObjectScope(transaction, request, \"organizations\", id);",
  "await assertTestContactParentScope(transaction, request, effectiveOrganizationId);",
  "testMarker: testMarkerForRow(row)",
  "accessScope: profile.accessScope",
  "capabilities: profile.capabilities",
  "select entity_type, entity_id, scope_ref from public.test_access_objects limit 0"
]) {
  assert.ok(apiSource.includes(contract), `API-Testzugangsvertrag fehlt: ${contract}`);
}
for (const removedRuntimeContract of [
  'url.pathname === "/api/auth/auto-enrollment"',
  'url.pathname === "/api/auth/enrollment"',
  "submitIapAutoEnrollment(request",
  "submitIapEnrollment(request",
  "API_AUTH_AUTO_ENROLLMENT_ENABLED"
]) {
  assert.ok(!apiSource.includes(removedRuntimeContract), `Entfernter Enrollment-Runtimevertrag ist noch aktiv: ${removedRuntimeContract}`);
}
assert.match(
  apiSource,
  /url\.pathname === "\/api\/auth\/bootstrap"[\s\S]*API_AUTH_MODE === "iap"[\s\S]*resolveRequestProfile\(request\)[\s\S]*status\) === 403[\s\S]*redirectResponse\(response, "\/#zugriff-verweigert"\)/u,
  "Der IAP-Bootstrap muss eine bestehende aktive Bindung prüfen und unbekannte Konten neutral zur Hauptseite zurückführen."
);
assert.match(
  apiSource,
  /const error = new Error\("Anmeldung nicht möglich\."\);\s*error\.status = 403;/u,
  "Die öffentliche 403-Antwort darf keine internen Binding-Details offenlegen."
);
assert.match(
  enrollmentSource,
  /from public\.pre_gematik_consume_test_access_allowlist\(\$1, \$2, \$3, \$4, \$5, \$6\)/u,
  "Auto-Enrollment muss ausschliesslich die atomare DB-Funktion aufrufen."
);
assert.doesNotMatch(
  apiSource.slice(
    apiSource.indexOf("async function resolveRequestProfile("),
    apiSource.indexOf("async function loadDevelopmentHeaderProfile(")
  ),
  /(?:consumeAllowlistedIapIdentity|submitIapAutoEnrollment|pre_gematik_consume_test_access_allowlist)/u,
  "GET /api/session und normale Reads duerfen Auto-Enrollment nicht als Seiteneffekt ausloesen."
);
for (const contract of [
  "function canCreateCareObject()",
  "function canEditCareObject(entity = {})",
  "entityScope === profileScope",
  "organizations.filter((organization) => canEditCareObject(organization))",
  "contact.status !== \"archived\"",
  "&& canEditCareObject(contact)",
  "activeOrganizationEditorSteps()",
  "organizationEditorScope === \"care\" && !isTestAccess()",
  "delete contactForWrite[field]"
]) {
  assert.ok(frontendSource.includes(contract), `Frontend-Testscope-Vertrag fehlt: ${contract}`);
}
assert.match(
  frontendSource,
  /const editable = canEditCareObject\(organization\)/u,
  "Organisationen dürfen nur im eigenen Testscope bearbeitbar erscheinen."
);
assert.match(
  frontendSource,
  /const editableDetail = expertScope \? canEditContacts\(\) : canEditCareObject\(contact\)/u,
  "Kontakte dürfen nur im eigenen Testscope bearbeitbar erscheinen."
);
assert.doesNotMatch(enrollmentSource, /console\.(?:log|warn|error)/u, "Enrollment darf keine Identitaetsdaten protokollieren.");
assert.doesNotMatch(
  enrollmentSource.slice(enrollmentSource.indexOf("function enrollmentResponse"), enrollmentSource.indexOf("function autoEnrollmentResponse")),
  /(?:email|subject|issuer)/u,
  "Die opake Enrollment-Antwort darf keine Identity-Claims enthalten."
);
assert.doesNotMatch(
  enrollmentSource.slice(enrollmentSource.indexOf("function autoEnrollmentResponse"), enrollmentSource.indexOf("function assertAppliedAllowlistResult")),
  /(?:email|subject|issuer|profile)/u,
  "Die opake Auto-Enrollment-Antwort darf keine Identity- oder Profildaten enthalten."
);

console.log("API Test Access OK: Self-Service-Enrollment ist entfernt; vorprovisionierte Bindungen und Testobjekt-Grenzen bleiben fail-closed.");
