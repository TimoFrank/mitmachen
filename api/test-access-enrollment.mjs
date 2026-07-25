import crypto from "node:crypto";

export const IAP_IDENTITY_ISSUER = "https://cloud.google.com/iap";
export const ENROLLMENT_GLOBAL_LOCK_NAME = "versorgungs-kompass:pre-gematik:identity-bindings";
const ENROLLMENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EMPTY_BODY_CHECK_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function canonicalIapSubject(value = "") {
  const subject = String(value || "").trim();
  const googleAccountPrefix = "accounts.google.com:";
  if (!subject.startsWith(googleAccountPrefix)) return subject;
  const googleAccountId = subject.slice(googleAccountPrefix.length);
  return /^[0-9]{1,64}$/u.test(googleAccountId) ? googleAccountId : subject;
}

export function canonicalVerifiedEmail(value = "") {
  const email = typeof value === "string" ? value.trim() : "";
  const firstAt = email.indexOf("@");
  if (
    !email
    || email.length > 320
    || !/^[!-~]+$/u.test(email)
    || firstAt <= 0
    || firstAt !== email.lastIndexOf("@")
    || firstAt === email.length - 1
    || email.includes("*")
    || email.includes("%")
  ) {
    throw httpError(401, "Signierte IAP-Identitaet enthaelt keine gueltige E-Mail-Adresse.");
  }
  return email.replace(/[A-Z]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32)
  );
}

export async function assertEmptyEnrollmentRequest(request) {
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_EMPTY_BODY_CHECK_BYTES) {
      throw httpError(413, "Die Registrierungsanfrage darf keinen Request Body enthalten.");
    }
  }
  if (size !== 0) {
    throw httpError(400, "Die Registrierungsanfrage darf keinen Request Body enthalten.");
  }
}

function verifiedIapIdentity(payload = {}) {
  const issuer = String(payload.iss || "").trim();
  const subject = canonicalIapSubject(payload.sub);
  const email = canonicalVerifiedEmail(payload.email);
  if (issuer !== IAP_IDENTITY_ISSUER || !subject || subject.length > 512 || /[\u0000-\u001f\u007f]/u.test(subject)) {
    throw httpError(401, "Signierte IAP-Identitaet ist ungueltig.");
  }
  return Object.freeze({ issuer, subject, email });
}

async function acquireEnrollmentLocks(client, identity) {
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '15s'");
  await client.query(
    "select pg_advisory_xact_lock(hashtext($1))",
    [ENROLLMENT_GLOBAL_LOCK_NAME]
  );
  await client.query(
    "select pg_advisory_xact_lock(hashtextextended($1 || chr(31) || $2, 0))",
    [identity.issuer, identity.subject]
  );
}

function enrollmentResponse(row = {}) {
  return Object.freeze({
    requestId: String(row.request_id || ""),
    status: "pending",
    expiresAt: new Date(row.expires_at).toISOString()
  });
}

function autoEnrollmentResponse(row = {}) {
  return Object.freeze({
    status: "active",
    enrollmentId: String(row.request_id || "")
  });
}

function assertAppliedAllowlistResult(row, now) {
  const profileId = String(row.profile_id || "").trim();
  const role = String(row.role || "").trim().toLowerCase();
  const accessScope = String(row.access_scope || "").trim().toLowerCase();
  const scopeRef = String(row.scope_ref || "").trim();
  const expiresAt = new Date(row.expires_at);
  const valid = UUID_PATTERN.test(String(row.request_id || ""))
    && UUID_PATTERN.test(String(row.allowlist_id || ""))
    && String(row.status || "") === "applied"
    && profileId.length > 0
    && profileId.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(profileId)
    && ["viewer", "editor"].includes(role)
    && accessScope === "test_only"
    && scopeRef.length > 0
    && scopeRef.length <= 128
    && !/[\u0000-\u001f\u007f]/u.test(scopeRef)
    && Number.isFinite(expiresAt.getTime())
    && expiresAt.getTime() > now.getTime();
  if (!valid) {
    throw httpError(503, "Automatischer Testzugang lieferte keinen sicheren Berechtigungsvertrag.");
  }
}

export async function consumeAllowlistedIapIdentity(pool, payload, options = {}) {
  const identity = verifiedIapIdentity(payload);
  const now = options.now instanceof Date ? options.now : new Date();
  if (!Number.isFinite(now.getTime())) throw new TypeError("Auto-Enrollment-Zeitpunkt ist ungueltig.");
  const expiresAt = new Date(now.getTime() + ENROLLMENT_TTL_MS);
  const requestId = String((options.requestIdFactory || crypto.randomUUID)());
  if (!UUID_PATTERN.test(requestId)) throw new TypeError("Auto-Enrollment-Vorgangsnummer ist ungueltig.");

  let client;
  let rollbackError = null;
  try {
    client = await pool.connect();
    await client.query("begin");
    await acquireEnrollmentLocks(client, identity);
    const result = await client.query(
      `select request_id, status, expires_at, allowlist_id, profile_id, role, access_scope, scope_ref
         from public.pre_gematik_consume_test_access_allowlist($1, $2, $3, $4, $5, $6)`,
      [requestId, identity.issuer, identity.subject, identity.email, now, expiresAt]
    );
    if (!Array.isArray(result?.rows) || result.rows.length > 1) {
      throw httpError(503, "Automatischer Testzugang lieferte kein eindeutiges Ergebnis.");
    }
    if (result.rows.length === 0) {
      throw httpError(404, "Kein automatischer Testzugang verfuegbar.");
    }
    const row = result.rows[0];
    assertAppliedAllowlistResult(row, now);
    await client.query("commit");
    return autoEnrollmentResponse(row);
  } catch (cause) {
    if (client) {
      try {
        await client.query("rollback");
      } catch (error) {
        rollbackError = error instanceof Error
          ? error
          : new Error("Auto-Enrollment-Transaktion konnte nicht zurueckgesetzt werden.", { cause: error });
      }
    }
    if (cause?.status) throw cause;
    const error = new Error("Automatischer Testzugang konnte nicht sicher geprueft werden.", { cause });
    error.status = 503;
    throw error;
  } finally {
    if (client) {
      if (rollbackError) client.release(rollbackError);
      else client.release();
    }
  }
}

export async function enrollVerifiedIapIdentity(pool, payload, options = {}) {
  const identity = verifiedIapIdentity(payload);
  const now = options.now instanceof Date ? options.now : new Date();
  if (!Number.isFinite(now.getTime())) throw new TypeError("Enrollment-Zeitpunkt ist ungueltig.");
  const expiresAt = new Date(now.getTime() + ENROLLMENT_TTL_MS);
  let client;
  let rollbackError = null;
  try {
    client = await pool.connect();
    await client.query("begin");
    await acquireEnrollmentLocks(client, identity);
    const binding = await client.query(
      `select 1
         from public.identity_bindings
        where issuer = $1
          and subject = $2
        limit 1`,
      [identity.issuer, identity.subject]
    );
    if (binding.rows.length) {
      throw httpError(403, "Diese Identitaet kann nicht erneut registriert werden.");
    }

    const existingResult = await client.query(
      `select request_id, status, expires_at, verified_email
         from public.identity_enrollment_requests
        where issuer = $1
          and subject = $2
        for update`,
      [identity.issuer, identity.subject]
    );
    const existing = existingResult.rows[0] || null;
    let row;
    if (existing?.status === "pending" && new Date(existing.expires_at).getTime() > now.getTime()) {
      if (existing.verified_email !== identity.email) {
        throw httpError(403, "Diese Identitaet kann nicht erneut registriert werden.");
      }
      row = (await client.query(
        `update public.identity_enrollment_requests
            set last_seen_at = $2
          where request_id = $1
          returning request_id, status, expires_at`,
        [existing.request_id, now]
      )).rows[0];
    } else if (existing) {
      throw httpError(403, "Diese Identitaet kann nicht erneut registriert werden.");
    } else {
      row = (await client.query(
        `insert into public.identity_enrollment_requests
          (issuer, subject, verified_email, expires_at)
         values ($1, $2, $3, $4)
         returning request_id, status, expires_at`,
        [identity.issuer, identity.subject, identity.email, expiresAt]
      )).rows[0];
    }
    if (!row?.request_id || row.status !== "pending") {
      throw httpError(503, "Registrierungsanfrage konnte nicht sicher gespeichert werden.");
    }
    await client.query("commit");
    return enrollmentResponse(row);
  } catch (cause) {
    if (client) {
      try {
        await client.query("rollback");
      } catch (error) {
        rollbackError = error instanceof Error
          ? error
          : new Error("Enrollment-Transaktion konnte nicht zurueckgesetzt werden.", { cause: error });
      }
    }
    if (cause?.status >= 400 && cause.status < 500) throw cause;
    const error = new Error("Registrierungsanfrage konnte nicht sicher verarbeitet werden.", { cause });
    error.status = 503;
    throw error;
  } finally {
    if (client) {
      if (rollbackError) client.release(rollbackError);
      else client.release();
    }
  }
}

export async function submitIapEnrollment(request, { verifyIapJwt, pool, ...options }) {
  await assertEmptyEnrollmentRequest(request);
  const payload = await verifyIapJwt(request);
  return enrollVerifiedIapIdentity(pool, payload, options);
}

export async function submitIapAutoEnrollment(request, { verifyIapJwt, pool, ...options }) {
  await assertEmptyEnrollmentRequest(request);
  const payload = await verifyIapJwt(request);
  return consumeAllowlistedIapIdentity(pool, payload, options);
}
