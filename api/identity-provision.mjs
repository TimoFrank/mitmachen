import crypto from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { verifyIdentityBootstrapClaim } from "./identity-bootstrap-claim.mjs";

const { Client } = pg;
const INPUT_PATH = "/run/identity/provision.json";
const BOOTSTRAP_HMAC_PATH = "/run/secrets/identity-bootstrap-hmac";
const APPROVAL_SECRET_PATH = "/run/identity/approval-secret";
const APPROVAL_TOKEN_PATH = "/run/identity/approval-token";
const GOOGLE_ISSUER = "https://accounts.google.com";
const IAP_ISSUER = "https://cloud.google.com/iap";
const MAX_INPUT_BYTES = 64 * 1024;
const APPROVAL_TTL_SECONDS = 15 * 60;
const APPROVAL_CLOCK_SKEW_SECONDS = 30;

class SafeProvisionError extends Error {}

function fail(message) {
  throw new SafeProvisionError(message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label + " muss ein JSON-Objekt sein.");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(label + " enthaelt fehlende oder nicht erlaubte Felder.");
  }
}

function cleanText(value, label, maximumLength) {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > maximumLength) {
    fail(label + " ist leer, nicht kanonisch oder zu lang.");
  }
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    fail(label + " enthaelt Steuerzeichen.");
  }
  return value;
}

function sha256(value) {
  return "sha256:" + crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function approvalToken(secretHex, issuedAt, inputFingerprint, stateFingerprintValue) {
  if (!/^[a-f0-9]{64}$/u.test(secretHex)) fail("Kurzlebiger Bestaetigungsschluessel ist ungueltig.");
  const message = ["identity-approval-v1", issuedAt, inputFingerprint, stateFingerprintValue].join("\n");
  const signature = crypto
    .createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(message, "utf8")
    .digest("hex");
  return `approve-v1.${issuedAt}.${signature}`;
}

function verifiedApprovalToken(token, secretHex, inputFingerprint, stateFingerprintValue) {
  const match = String(token || "").match(/^approve-v1\.([1-9][0-9]{9})\.([a-f0-9]{64})$/u);
  if (!match) fail("Kurzlebige Bestaetigung fehlt oder ist ungueltig.");
  const issuedAt = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + APPROVAL_CLOCK_SKEW_SECONDS || issuedAt < now - APPROVAL_TTL_SECONDS) {
    fail("Kurzlebige Bestaetigung ist abgelaufen oder zukuenftig.");
  }
  const expected = approvalToken(secretHex, issuedAt, inputFingerprint, stateFingerprintValue);
  const suppliedBytes = Buffer.from(token, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) {
    fail("Kurzlebige Bestaetigung passt nicht zu Eingabe und Datenbankzustand.");
  }
}

async function readApprovalSecret() {
  const secret = String(await readFile(
    process.env.IDENTITY_APPROVAL_SECRET_FILE || APPROVAL_SECRET_PATH,
    "utf8"
  ));
  if (!/^[a-f0-9]{64}$/u.test(secret)) fail("Kurzlebiger Bestaetigungsschluessel ist ungueltig.");
  return secret;
}

export function canonicalIdentityProvisionInput(value, { bootstrapSecret, nowSeconds } = {}) {
  exactKeys(value, ["schemaVersion", "profile", "identity"], "Eingabe");
  if (value.schemaVersion !== 2) fail("schemaVersion muss exakt 2 sein.");
  exactKeys(value.profile, ["id", "email", "displayName", "initials", "role"], "profile");
  exactKeys(value.identity, ["bootstrapClaim", "accessScope", "scopeRef"], "identity");

  const id = cleanText(value.profile.id, "profile.id", 128);
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(id)) {
    fail("profile.id enthaelt nicht erlaubte Zeichen.");
  }
  const email = cleanText(value.profile.email, "profile.email", 254);
  if (
    email !== email.toLowerCase()
    || email.includes("*")
    || !/^[a-z0-9.!#$%&+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(email)
  ) {
    fail("profile.email muss eine einzelne kleingeschriebene E-Mail-Adresse sein.");
  }
  const displayName = cleanText(value.profile.displayName, "profile.displayName", 120);
  const initials = cleanText(value.profile.initials, "profile.initials", 8);
  if (!/^[\p{L}0-9]{1,8}$/u.test(initials)) {
    fail("profile.initials enthaelt nicht erlaubte Zeichen.");
  }
  const role = cleanText(value.profile.role, "profile.role", 16);
  if (!new Set(["admin", "editor", "viewer"]).has(role)) {
    fail("profile.role ist nicht freigegeben.");
  }
  let verifiedClaim;
  try {
    verifiedClaim = verifyIdentityBootstrapClaim(value.identity.bootstrapClaim, bootstrapSecret, { nowSeconds });
  } catch {
    fail("identity.bootstrapClaim ist ungueltig, abgelaufen oder nicht fuer diesen Server signiert.");
  }
  if (verifiedClaim.issuer !== GOOGLE_ISSUER || verifiedClaim.email !== email) {
    fail("Profil-E-Mail und signierter Google-Claim stimmen nicht exakt ueberein.");
  }
  const issuer = verifiedClaim.issuer;
  const subject = verifiedClaim.subject;
  const accessScope = cleanText(value.identity.accessScope, "identity.accessScope", 16);
  if (!new Set(["standard", "test_only"]).has(accessScope)) {
    fail("identity.accessScope ist nicht freigegeben.");
  }
  const scopeRef = value.identity.scopeRef;
  if (
    (accessScope === "standard" && scopeRef !== null)
    || (accessScope === "test_only" && (
      typeof scopeRef !== "string"
      || scopeRef !== scopeRef.trim()
      || !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(scopeRef)
    ))
  ) {
    fail("identity.scopeRef passt nicht zum ausgewaehlten accessScope.");
  }

  return Object.freeze({
    schemaVersion: 2,
    profile: Object.freeze({ id, email, displayName, initials, role }),
    identity: Object.freeze({ issuer, subject, accessScope, scopeRef })
  });
}

async function loadInput() {
  const metadata = await stat(INPUT_PATH);
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_INPUT_BYTES) {
    fail("Die geschuetzte Eingabedatei ist keine zulaessige regulaere JSON-Datei.");
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(INPUT_PATH, "utf8"));
  } catch {
    fail("Die geschuetzte Eingabedatei enthaelt kein gueltiges JSON.");
  }
  const bootstrapSecret = String(await readFile(
    process.env.IDENTITY_BOOTSTRAP_HMAC_FILE || BOOTSTRAP_HMAC_PATH,
    "utf8"
  ));
  return canonicalIdentityProvisionInput(parsed, { bootstrapSecret });
}

function stateFingerprint(profileRows, bindingRows) {
  return sha256(JSON.stringify({
    profileRows: profileRows.map((row) => ({
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      initials: row.initials,
      role: row.role,
      active: row.active
    })),
    bindingRows: bindingRows.map((row) => ({
      issuer: row.issuer,
      subject: row.subject,
      profile_id: row.profile_id,
      active: row.active,
      access_scope: row.access_scope,
      scope_ref: row.scope_ref
    }))
  }));
}

function printSummary(fields) {
  for (const [key, value] of Object.entries(fields)) {
    process.stdout.write(key + "=" + value + "\n");
  }
}

async function connectOwner() {
  const password = String(await readFile(
    process.env.DB_PASSWORD_FILE || "/run/secrets/db-owner-password",
    "utf8"
  ));
  if (password.includes("\n") || password.includes("\r") || password.length < 48 || password.length > 128) {
    fail("Die Datenbankpasswortdatei ist ungueltig.");
  }
  const client = new Client({
    host: process.env.DB_HOST || "/run/postgresql",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "versorgungs_kompass",
    user: process.env.DB_USER || "vk_owner",
    password,
    ssl: false,
    application_name: "vk-single-server-identity-provision",
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    query_timeout: 20000
  });
  await client.connect();
  return client;
}

async function planInTransaction(client, input) {
  const context = (await client.query(
    "select current_database() as database_name, current_user as user_name, "
      + "to_regclass('public.profiles') is not null "
      + "and to_regclass('public.identity_bindings') is not null as schema_ready"
  )).rows[0];
  if (
    context?.database_name !== "versorgungs_kompass"
    || context?.user_name !== "vk_owner"
    || context?.schema_ready !== true
  ) {
    fail("Datenbankziel, Owner-Rolle oder Identity-Schema ist nicht der freigegebene Einzelserver-Stand.");
  }
  await client.query(
    "select pg_advisory_xact_lock(hashtextextended("
      + "'versorgungs-kompass:single-server:identity-v1', 0))"
  );
  const profileRows = (await client.query(
    "select id, email, display_name, initials, role, active "
      + "from public.profiles "
      + "where id = $1 or lower(email) = $2 "
      + "order by id for update",
    [input.profile.id, input.profile.email]
  )).rows;
  if (profileRows.length > 1) {
    fail("Profil-ID und E-Mail-Adresse treffen unterschiedliche bestehende Profile.");
  }
  const existingProfile = profileRows[0] || null;
  if (existingProfile && (
    existingProfile.id !== input.profile.id
    || String(existingProfile.email).toLowerCase() !== input.profile.email
    || existingProfile.display_name !== input.profile.displayName
    || String(existingProfile.initials || "") !== input.profile.initials
    || existingProfile.role !== input.profile.role
    || existingProfile.active !== true
  )) {
    fail("Das bestehende Profil stimmt nicht exakt mit der geschuetzten Eingabe ueberein.");
  }

  const bindingRows = (await client.query(
    "select issuer, subject, profile_id, active, access_scope, scope_ref "
      + "from public.identity_bindings "
      + "where (issuer = $1 and subject = $2) or profile_id = $3 "
      + "order by issuer, subject for update",
    [input.identity.issuer, input.identity.subject, input.profile.id]
  )).rows;
  const subjectCollision = bindingRows.some((binding) => (
    binding.issuer === input.identity.issuer
    && binding.subject === input.identity.subject
    && binding.profile_id !== input.profile.id
  ));
  const profileGoogleCollision = bindingRows.some((binding) => (
    binding.issuer === input.identity.issuer
    && binding.profile_id === input.profile.id
    && binding.subject !== input.identity.subject
  ));
  if (subjectCollision || profileGoogleCollision) {
    fail("Eine bestehende Identity-Bindung kollidiert mit der geschuetzten Eingabe.");
  }
  const profileBindings = bindingRows.filter((binding) => binding.profile_id === input.profile.id);
  const unexpectedBindings = profileBindings.filter((binding) => (
    binding.issuer !== input.identity.issuer && binding.issuer !== IAP_ISSUER
  ));
  if (unexpectedBindings.length > 0) {
    fail("Das Profil besitzt eine nicht freigegebene weitere Identity-Bindung.");
  }
  const legacyIapBindings = profileBindings.filter((binding) => binding.issuer === IAP_ISSUER);
  if (legacyIapBindings.length > 1 || legacyIapBindings.some((binding) => (
    binding.access_scope !== input.identity.accessScope
    || binding.scope_ref !== input.identity.scopeRef
  ))) {
    fail("Die alte IAP-Bindung ist mehrdeutig oder besitzt einen anderen Scope; kein implizites Upgrade ist erlaubt.");
  }
  const exactBindings = bindingRows.filter((binding) => (
    binding.issuer === input.identity.issuer
    && binding.subject === input.identity.subject
    && binding.profile_id === input.profile.id
  ));
  if (exactBindings.length > 1) fail("Die exakte Google-Bindung ist nicht eindeutig.");
  const existingBinding = exactBindings[0] || null;
  if (existingBinding && (
    existingBinding.active !== true
    || existingBinding.access_scope !== input.identity.accessScope
    || existingBinding.scope_ref !== input.identity.scopeRef
  )) {
    fail("Die bestehende Google-Bindung ist inaktiv oder besitzt einen anderen Scope.");
  }

  return Object.freeze({
    currentStateFingerprint: stateFingerprint(profileRows, bindingRows),
    profileAction: existingProfile ? "keep" : "insert",
    bindingAction: existingBinding ? "keep" : "insert",
    legacyBindingAction: legacyIapBindings.some((binding) => binding.active === true)
      ? "deactivate-iap-on-target"
      : legacyIapBindings.length === 1 ? "keep-inactive" : "none"
  });
}

async function readback(client, input) {
  const profiles = (await client.query(
    "select id, email, display_name, initials, role, active "
      + "from public.profiles where id = $1 and lower(email) = $2",
    [input.profile.id, input.profile.email]
  )).rows;
  const bindings = (await client.query(
    "select issuer, subject, profile_id, active, access_scope, scope_ref "
      + "from public.identity_bindings "
      + "where (issuer = $1 and subject = $2) or profile_id = $3 "
      + "order by issuer, subject",
    [input.identity.issuer, input.identity.subject, input.profile.id]
  )).rows;
  if (!identityProvisionRowsMatch(input, profiles, bindings)) {
    fail("Die abschliessende Profil- und Bindungspruefung ist fehlgeschlagen.");
  }
  return stateFingerprint(profiles, bindings);
}

export function identityProvisionRowsMatch(input, profiles, bindings) {
  if (profiles.length !== 1) return false;
  const profile = profiles[0];
  const exactBindings = bindings.filter((binding) => (
    binding.issuer === input.identity.issuer
    && binding.subject === input.identity.subject
    && binding.profile_id === input.profile.id
  ));
  const otherBindings = bindings.filter((binding) => !exactBindings.includes(binding));
  const binding = exactBindings[0];
  return exactBindings.length === 1
    && profile.id === input.profile.id
    && profile.email === input.profile.email
    && profile.display_name === input.profile.displayName
    && String(profile.initials || "") === input.profile.initials
    && profile.role === input.profile.role
    && profile.active === true
    && binding.issuer === input.identity.issuer
    && binding.subject === input.identity.subject
    && binding.profile_id === input.profile.id
    && binding.active === true
    && binding.access_scope === input.identity.accessScope
    && binding.scope_ref === input.identity.scopeRef
    && otherBindings.every((other) => (
      other.profile_id === input.profile.id
      && other.issuer === IAP_ISSUER
      && other.active === false
      && other.access_scope === input.identity.accessScope
      && other.scope_ref === input.identity.scopeRef
    ));
}

async function main() {
  const input = await loadInput();
  const mode = String(process.env.IDENTITY_PROVISION_MODE || "preview");
  if (!new Set(["preview", "apply"]).has(mode)) {
    fail("IDENTITY_PROVISION_MODE muss preview oder apply sein.");
  }
  const inputFingerprint = sha256(JSON.stringify(input));
  const approvalSecret = await readApprovalSecret();
  const client = await connectOwner();
  let transactionOpen = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;
    const plan = await planInTransaction(client, input);
    if (mode === "preview") {
      const issuedAt = Math.floor(Date.now() / 1000);
      const token = approvalToken(
        approvalSecret,
        issuedAt,
        inputFingerprint,
        plan.currentStateFingerprint
      );
      await writeFile(
        process.env.IDENTITY_APPROVAL_TOKEN_FILE || APPROVAL_TOKEN_PATH,
        token,
        { encoding: "utf8" }
      );
      await client.query("rollback");
      transactionOpen = false;
      printSummary({
        mode,
        profileAction: plan.profileAction,
        bindingAction: plan.bindingAction,
        legacyBindingAction: plan.legacyBindingAction
      });
      return;
    }
    const storedApproval = String(await readFile(
      process.env.IDENTITY_APPROVAL_TOKEN_FILE || APPROVAL_TOKEN_PATH,
      "utf8"
    ));
    verifiedApprovalToken(
      storedApproval,
      approvalSecret,
      inputFingerprint,
      plan.currentStateFingerprint
    );
    if (plan.profileAction === "insert") {
      await client.query(
        "insert into public.profiles (id, email, display_name, initials, role, active) "
          + "values ($1, $2, $3, $4, $5, true)",
        [input.profile.id, input.profile.email, input.profile.displayName, input.profile.initials, input.profile.role]
      );
    }
    if (plan.bindingAction === "insert") {
      await client.query(
        "insert into public.identity_bindings "
          + "(issuer, subject, profile_id, active, access_scope, scope_ref) "
          + "values ($1, $2, $3, true, $4, $5)",
        [
          input.identity.issuer,
          input.identity.subject,
          input.profile.id,
          input.identity.accessScope,
          input.identity.scopeRef
        ]
      );
    }
    if (plan.legacyBindingAction === "deactivate-iap-on-target") {
      const deactivated = await client.query(
        "update public.identity_bindings set active = false "
          + "where issuer = $1 and profile_id = $2 and active = true",
        [IAP_ISSUER, input.profile.id]
      );
      if (deactivated.rowCount !== 1) {
        fail("Die alte IAP-Bindung konnte nicht eindeutig auf dem Ziel deaktiviert werden.");
      }
    }
    await readback(client, input);
    commitAttempted = true;
    await client.query("commit");
    transactionOpen = false;
    await readback(client, input);
    printSummary({
      mode,
      result: "success"
    });
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      await client.query("rollback").catch(() => {});
    }
    if (commitAttempted) {
      fail("COMMIT-Ergebnis ist unbekannt; nicht automatisch wiederholen, sondern erneut Preview und Readback ausfuehren.");
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof SafeProvisionError
      ? error.message
      : "Identity-Provisionierung ist fehlgeschlagen; Eingabe- und Verbindungsdaten wurden nicht ausgegeben.";
    process.stderr.write("FEHLER: " + message + "\n");
    process.exitCode = 1;
  });
}
