#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const INPUT_VERSION = 1;
export const EXPECTED_ENVIRONMENT = "pre-gematik";
export const CREATE_OPERATION = "CREATE_PRE_GEMATIK_IDENTITY_PLATFORM_ACCOUNT";
export const RECOVER_LINK_OPERATION = "RECOVER_PRE_GEMATIK_SET_PASSWORD_LINK";
export const EXPECTED_CONTINUE_URL = "https://versorgungs-kompass.de/start";

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_LINK_BYTES = 16 * 1024;
const MAX_API_RESPONSE_BYTES = 1024 * 1024;
const IDENTITY_TOOLKIT_TIMEOUT_MS = 15_000;
const IDENTITY_TOOLKIT_ORIGIN = "https://identitytoolkit.googleapis.com";
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const UID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const GOOGLE_PROVIDER_UID_PATTERN = /^[0-9]{6,255}$/u;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/u;
const ACCESS_TOKEN_PATTERN = /^[^\s\u0000-\u001f\u007f]{20,16384}$/u;
const ACTION_CODE_PATTERN = /^[A-Za-z0-9_-]{20,1024}$/u;
const PASSWORD_ACTION_PATH = "/konto/passwort-festlegen";
const FIREBASE_ACTION_PATH = "/__/auth/action";
const ALLOWED_ACTION_PARAMETERS = new Set([
  "apiKey",
  "continueUrl",
  "lang",
  "mode",
  "oobCode"
]);

export class IdentityPlatformOnboardingError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "IdentityPlatformOnboardingError";
    this.exitCode = exitCode;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new IdentityPlatformOnboardingError(`${label} muss ein JSON-Objekt sein.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new IdentityPlatformOnboardingError(
      `${label} enthaelt fehlende oder nicht freigegebene Felder.`
    );
  }
}

function assertText(value, label, maximumLength, pattern) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.length > maximumLength
    || /[\u0000-\u001f\u007f]/u.test(value)
    || (pattern && !pattern.test(value))
  ) {
    throw new IdentityPlatformOnboardingError(`${label} ist ungueltig.`);
  }
}

function canonicalHttpsUrl(value, label) {
  assertText(value, label, 2048);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new IdentityPlatformOnboardingError(`${label} muss eine kanonische HTTPS-URL sein.`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.href !== value
  ) {
    throw new IdentityPlatformOnboardingError(
      `${label} muss eine kanonische HTTPS-URL ohne Zugangsdaten, Query oder Fragment sein.`
    );
  }
  return parsed.href;
}

export function validateIdentityPlatformAccountDocument(value) {
  assertExactKeys(
    value,
    [
      "version",
      "project_id",
      "uid",
      "email",
      "display_name",
      "email_ownership_verified",
      "continue_url"
    ],
    "Eingabedokument"
  );
  if (value.version !== INPUT_VERSION) {
    throw new IdentityPlatformOnboardingError(
      `Eingabedokument.version muss exakt ${INPUT_VERSION} sein.`
    );
  }
  assertText(value.project_id, "Eingabedokument.project_id", 30, PROJECT_PATTERN);
  assertText(value.uid, "Eingabedokument.uid", 128, UID_PATTERN);
  assertText(value.email, "Eingabedokument.email", 256, EMAIL_PATTERN);
  if (value.email !== value.email.toLowerCase()) {
    throw new IdentityPlatformOnboardingError(
      "Eingabedokument.email muss bereits kanonisch kleingeschrieben sein."
    );
  }
  assertText(value.display_name, "Eingabedokument.display_name", 128);
  if (value.email_ownership_verified !== true) {
    throw new IdentityPlatformOnboardingError(
      "Die unabhaengige E-Mail-Inhaberschaft muss vor dem Admin-Apply bestaetigt sein."
    );
  }
  const continueUrl = canonicalHttpsUrl(
    value.continue_url,
    "Eingabedokument.continue_url"
  );
  if (continueUrl !== EXPECTED_CONTINUE_URL) {
    throw new IdentityPlatformOnboardingError(
      `Eingabedokument.continue_url muss exakt ${EXPECTED_CONTINUE_URL} sein.`
    );
  }
  return Object.freeze({
    version: INPUT_VERSION,
    project_id: value.project_id,
    uid: value.uid,
    email: value.email,
    display_name: value.display_name,
    email_ownership_verified: true,
    continue_url: continueUrl
  });
}

function canonicalDocument(value) {
  return JSON.stringify({
    continue_url: value.continue_url,
    display_name: value.display_name,
    email: value.email,
    email_ownership_verified: value.email_ownership_verified,
    project_id: value.project_id,
    uid: value.uid,
    version: value.version
  });
}

export function identityPlatformAccountFingerprint(document) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalDocument(document), "utf8")
    .digest("hex")}`;
}

function repositoryRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Der Git-Worktree konnte nicht sicher bestimmt werden."
    );
  }
}

function insideDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function loadProtectedIdentityPlatformAccountDocument(
  inputPath,
  { repository = repositoryRoot() } = {}
) {
  if (!path.isAbsolute(String(inputPath || ""))) {
    throw new IdentityPlatformOnboardingError(
      "--input muss ein absoluter geschuetzter Dateipfad sein."
    );
  }
  let linkMetadata;
  try {
    linkMetadata = await fs.lstat(inputPath);
  } catch {
    throw new IdentityPlatformOnboardingError("Das geschuetzte Eingabedokument fehlt.");
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Eingabedokument darf kein Symlink sein."
    );
  }
  const resolved = await fs.realpath(inputPath);
  const resolvedRepository = await fs.realpath(repository);
  const metadata = await fs.stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isFile()
    || metadata.size === 0
    || metadata.size > MAX_INPUT_BYTES
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das Eingabedokument muss owner-only und ausserhalb des Git-Worktrees liegen."
    );
  }
  try {
    return validateIdentityPlatformAccountDocument(
      JSON.parse(await fs.readFile(resolved, "utf8"))
    );
  } catch (error) {
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Eingabedokument enthaelt kein gueltiges JSON."
    );
  }
}

async function protectedCreateOnlyOutputPath(outputPath, repository) {
  if (!path.isAbsolute(String(outputPath || ""))) {
    throw new IdentityPlatformOnboardingError(
      "--output muss ein absoluter geschuetzter Dateipfad sein."
    );
  }
  const requested = path.resolve(outputPath);
  const parent = path.dirname(requested);
  const basename = path.basename(requested);
  let parentLinkMetadata;
  try {
    parentLinkMetadata = await fs.lstat(parent);
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Ausgabeverzeichnis existiert nicht."
    );
  }
  if (parentLinkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Ausgabeverzeichnis darf kein Symlink sein."
    );
  }
  const resolvedParent = await fs.realpath(parent);
  const resolvedRepository = await fs.realpath(repository);
  const metadata = await fs.stat(resolvedParent);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolvedParent, resolvedRepository)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das Ausgabeverzeichnis muss owner-only und ausserhalb des Git-Worktrees liegen."
    );
  }
  const resolvedOutput = path.join(resolvedParent, basename);
  try {
    await fs.lstat(resolvedOutput);
    throw new IdentityPlatformOnboardingError(
      "Die Set-password-Linkdatei existiert bereits; nichts wurde ueberschrieben."
    );
  } catch (error) {
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    if (error?.code !== "ENOENT") {
      throw new IdentityPlatformOnboardingError(
        "Die Set-password-Linkdatei konnte nicht create-only geprueft werden."
      );
    }
  }
  return resolvedOutput;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new IdentityPlatformOnboardingError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseIdentityPlatformAccountArguments(argv) {
  const options = {
    help: false,
    apply: false,
    recoverLinkOnly: false,
    input: "",
    output: "",
    confirmEnvironment: "",
    confirmProject: "",
    confirmOperation: "",
    confirmFingerprint: ""
  };
  const valueOptions = new Map([
    ["--input", "input"],
    ["--output", "output"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-project", "confirmProject"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--recover-link-only") options.recoverLinkOnly = true;
    else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = optionValue(argv, index, argument);
      index += 1;
    } else {
      throw new IdentityPlatformOnboardingError(
        "Unbekannte oder unvollstaendige Kommandozeilenoption."
      );
    }
  }
  return Object.freeze(options);
}

export function validateIdentityPlatformAccountConfirmations(options, document, fingerprint) {
  if (!options.apply) {
    if (
      options.output
      || options.confirmEnvironment
      || options.confirmProject
      || options.confirmOperation
      || options.confirmFingerprint
    ) {
      throw new IdentityPlatformOnboardingError(
        "Output- und Apply-Bestaetigungen sind nur zusammen mit --apply erlaubt."
      );
    }
    return;
  }
  const expectedOperation = options.recoverLinkOnly
    ? RECOVER_LINK_OPERATION
    : CREATE_OPERATION;
  if (
    !options.output
    || options.confirmEnvironment !== EXPECTED_ENVIRONMENT
    || options.confirmProject !== document.project_id
    || options.confirmOperation !== expectedOperation
    || options.confirmFingerprint !== fingerprint
    || !FINGERPRINT_PATTERN.test(options.confirmFingerprint)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Apply-Bestaetigungen fuer Projekt, Operation, Fingerprint oder Output fehlen."
    );
  }
}

function userNotFound(error) {
  return ["auth/user-not-found", "USER_NOT_FOUND"].includes(String(error?.code || ""));
}

async function lookupUser(auth, method, value) {
  try {
    return await auth[method](value);
  } catch (error) {
    if (userNotFound(error)) return null;
    throw new IdentityPlatformOnboardingError(
      "Der Identity-Platform-Istzustand konnte nicht sicher gelesen werden."
    );
  }
}

async function requireCreateOnlyState(auth, document) {
  const [byUid, byEmail] = await Promise.all([
    lookupUser(auth, "getUser", document.uid),
    lookupUser(auth, "getUserByEmail", document.email)
  ]);
  if (byUid || byEmail) {
    throw new IdentityPlatformOnboardingError(
      "UID oder E-Mail existiert bereits; der create-only Vorgang wurde abgebrochen."
    );
  }
}

async function requireExactRecoveryState(auth, document) {
  const [byUid, byEmail] = await Promise.all([
    lookupUser(auth, "getUser", document.uid),
    lookupUser(auth, "getUserByEmail", document.email)
  ]);
  const isExactPasswordOnlyUser = (user) => (
    user
    && user.uid === document.uid
    && String(user.email || "").toLowerCase() === document.email
    && user.displayName === document.display_name
    && user.emailVerified === true
    && user.disabled !== true
    && user.hasPasswordCredential === true
    && Array.isArray(user.providerIds)
    && user.providerIds.length === 1
    && user.providerIds[0] === "password"
    && !user.phoneNumber
    && user.emailLinkSignin !== true
    && user.customAuth !== true
    && user.hasCustomAttributes !== true
    && user.hasMfaEnrollment !== true
    && !user.tenantId
    && !user.initialEmail
  );
  if (
    !byUid
    || !byEmail
    || !isExactPasswordOnlyUser(byUid)
    || !isExactPasswordOnlyUser(byEmail)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der vorhandene Account entspricht nicht exakt dem bestaetigten Link-Recovery-Zustand."
    );
  }
}

export function generateUnsharedBootstrapPassword(randomBytes = crypto.randomBytes) {
  const value = `Aa1!${randomBytes(36).toString("base64url")}`;
  if (
    value.length < 20
    || !/[a-z]/u.test(value)
    || !/[A-Z]/u.test(value)
    || !/[0-9]/u.test(value)
    || !/[^A-Za-z0-9]/u.test(value)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das interne Bootstrap-Geheimnis konnte nicht sicher erzeugt werden."
    );
  }
  return value;
}

function validateSetPasswordLink(value, document, expectedApiKey) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_LINK_BYTES) {
    throw new IdentityPlatformOnboardingError(
      "Identity Platform lieferte keinen gueltigen Set-password-Link."
    );
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Identity Platform lieferte keinen gueltigen Set-password-Link."
    );
  }

  for (const [name] of parsed.searchParams) {
    if (
      !ALLOWED_ACTION_PARAMETERS.has(name)
      || parsed.searchParams.getAll(name).length !== 1
    ) {
      throw new IdentityPlatformOnboardingError(
        "Identity Platform lieferte keinen gueltigen Set-password-Link."
      );
    }
  }

  const expectedFirebaseOrigin = `https://${document.project_id}.firebaseapp.com`;
  const brandedAction = new URL(PASSWORD_ACTION_PATH, document.continue_url);
  const sourceIsExpected =
    (
      parsed.origin === expectedFirebaseOrigin
      && parsed.pathname === FIREBASE_ACTION_PATH
    )
    || (
      parsed.origin === brandedAction.origin
      && parsed.pathname === PASSWORD_ACTION_PATH
    );
  const apiKey = parsed.searchParams.get("apiKey");
  const oobCode = parsed.searchParams.get("oobCode");
  const continueUrl = parsed.searchParams.get("continueUrl");
  const language = parsed.searchParams.get("lang");

  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.hash
    || !sourceIsExpected
    || parsed.searchParams.get("mode") !== "resetPassword"
    || !apiKey
    || !API_KEY_PATTERN.test(apiKey)
    || apiKey !== expectedApiKey
    || !oobCode
    || !ACTION_CODE_PATTERN.test(oobCode)
    || continueUrl !== document.continue_url
    || (language !== null && language !== "de")
  ) {
    throw new IdentityPlatformOnboardingError(
      "Identity Platform lieferte keinen gueltigen Set-password-Link."
    );
  }

  brandedAction.searchParams.set("mode", "resetPassword");
  brandedAction.searchParams.set("oobCode", oobCode);
  brandedAction.searchParams.set("apiKey", apiKey);
  brandedAction.searchParams.set("continueUrl", document.continue_url);
  brandedAction.searchParams.set("lang", "de");
  return brandedAction.href;
}

async function generateSetPasswordLink(auth, document) {
  const expectedApiKey = String(auth?.webApiKey || "");
  if (!API_KEY_PATTERN.test(expectedApiKey)) {
    throw new IdentityPlatformOnboardingError(
      "Der gepinnte Identity-Platform-Web-API-Key fehlt im Admin-Readback."
    );
  }
  try {
    return validateSetPasswordLink(await auth.generatePasswordResetLink(
      document.email,
      {
        url: document.continue_url,
        handleCodeInApp: false
      }
    ), document, expectedApiKey);
  } catch (error) {
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    throw new IdentityPlatformOnboardingError(
      "Der einmalige Set-password-Link konnte nicht sicher erzeugt werden."
    );
  }
}

function safeSummary({ apply, recoverLinkOnly, fingerprint, linkWritten = false }) {
  return [
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    `operation=${recoverLinkOnly ? "link-recovery" : "account-create-only"}`,
    "account_count=1",
    `target_state=${recoverLinkOnly ? "exact-existing" : "absent"}`,
    `set_password_link_file_created=${linkWritten}`,
    `input_fingerprint=${fingerprint}`
  ].join(" ");
}

export async function executeIdentityPlatformAccountOnboarding({
  auth,
  document,
  fingerprint,
  options,
  repository = repositoryRoot(),
  randomBytes = crypto.randomBytes,
  log = console.log
}) {
  validateIdentityPlatformAccountConfirmations(options, document, fingerprint);
  if (options.recoverLinkOnly) await requireExactRecoveryState(auth, document);
  else await requireCreateOnlyState(auth, document);

  if (!options.apply) {
    log(safeSummary({
      apply: false,
      recoverLinkOnly: options.recoverLinkOnly,
      fingerprint
    }));
    return Object.freeze({ applied: false, accountCreated: false, linkWritten: false });
  }

  const outputPath = await protectedCreateOnlyOutputPath(options.output, repository);
  let outputHandle;
  let outputCreated = false;
  let accountCreated = false;
  let accountCreationMayHaveCommitted = false;
  try {
    outputHandle = await fs.open(outputPath, "wx", 0o600);
    outputCreated = true;

    if (!options.recoverLinkOnly) {
      const bootstrapPassword = generateUnsharedBootstrapPassword(randomBytes);
      let created;
      try {
        accountCreationMayHaveCommitted = true;
        created = await auth.createUser({
          uid: document.uid,
          email: document.email,
          emailVerified: true,
          password: bootstrapPassword,
          displayName: document.display_name,
          disabled: false
        });
      } catch (error) {
        if (["auth/email-already-exists", "auth/uid-already-exists"].includes(String(error?.code || ""))) {
          accountCreationMayHaveCommitted = false;
          throw new IdentityPlatformOnboardingError(
            "UID oder E-Mail wurde konkurrierend angelegt; create-only Apply wurde abgebrochen."
          );
        }
        throw new IdentityPlatformOnboardingError(
          "Der Identity-Platform-Account konnte nicht sicher create-only angelegt werden."
        );
      }
      accountCreated = true;
      if (
        created?.uid !== document.uid
        || String(created?.email || "").toLowerCase() !== document.email
        || created?.emailVerified !== true
        || created?.disabled === true
      ) {
        throw new IdentityPlatformOnboardingError(
          "Der create-only Account entspricht nicht dem bestaetigten Sollzustand."
        );
      }
    }

    const setPasswordLink = await generateSetPasswordLink(auth, document);
    await outputHandle.writeFile(`${setPasswordLink}\n`, "utf8");
    await outputHandle.sync();
    await outputHandle.close();
    outputHandle = null;
    log(safeSummary({
      apply: true,
      recoverLinkOnly: options.recoverLinkOnly,
      fingerprint,
      linkWritten: true
    }));
    return Object.freeze({
      applied: true,
      accountCreated,
      linkWritten: true
    });
  } catch (error) {
    if (outputHandle) await outputHandle.close().catch(() => {});
    if (outputCreated) await fs.unlink(outputPath).catch(() => {});
    if (accountCreated || accountCreationMayHaveCommitted) {
      throw new IdentityPlatformOnboardingError(
        "Der Account wurde moeglicherweise create-only angelegt, aber keine "
        + "Linkdatei ausgegeben. Nicht erneut create-only ausfuehren; nach "
        + "read-only Abgleich "
        + "--recover-link-only mit einem neuen Output-Pfad verwenden.",
        1
      );
    }
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    throw new IdentityPlatformOnboardingError(
      "Der geschuetzte Identity-Platform-Onboarding-Vorgang ist fehlgeschlagen."
    );
  }
}

function shortLivedGoogleAccessToken(projectId) {
  let token;
  try {
    token = execFileSync(
      "gcloud",
      ["auth", "print-access-token", "--project", projectId],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 20 * 1024
      }
    ).trim();
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Es konnte kein kurzlebiges Google-Admin-Token bezogen werden."
    );
  }
  if (!ACCESS_TOKEN_PATTERN.test(token)) {
    throw new IdentityPlatformOnboardingError(
      "Das kurzlebige Google-Admin-Token ist ungueltig."
    );
  }
  return token;
}

function identityPlatformApiKey() {
  const value = String(process.env.IAP_EXTERNAL_AUTH_API_KEY || "").trim();
  if (!API_KEY_PATTERN.test(value)) {
    throw new IdentityPlatformOnboardingError(
      "IAP_EXTERNAL_AUTH_API_KEY fehlt oder ist ungueltig."
    );
  }
  return value;
}

function identityToolkitErrorCode(payload) {
  return String(payload?.error?.message || "").trim().split(/\s+/u)[0];
}

function mapIdentityToolkitError(code) {
  if (code === "EMAIL_EXISTS") return "auth/email-already-exists";
  if (["DUPLICATE_LOCAL_ID", "LOCAL_ID_EXISTS"].includes(code)) {
    return "auth/uid-already-exists";
  }
  if (["USER_NOT_FOUND", "EMAIL_NOT_FOUND"].includes(code)) {
    return "auth/user-not-found";
  }
  return "auth/internal-error";
}

function validateGoogleImportRecord(value) {
  assertExactKeys(
    value,
    [
      "localId",
      "email",
      "emailVerified",
      "displayName",
      "disabled",
      "providerUserInfo"
    ],
    "Google-Importdatensatz"
  );
  assertText(value.localId, "Google-Importdatensatz.localId", 128, UID_PATTERN);
  assertText(value.email, "Google-Importdatensatz.email", 256, EMAIL_PATTERN);
  assertText(value.displayName, "Google-Importdatensatz.displayName", 128);
  if (
    value.email !== value.email.toLowerCase()
    || value.emailVerified !== true
    || value.disabled !== false
    || !Array.isArray(value.providerUserInfo)
    || value.providerUserInfo.length !== 1
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der Google-Importdatensatz entspricht nicht dem freigegebenen create-only Vertrag."
    );
  }
  const provider = value.providerUserInfo[0];
  assertExactKeys(
    provider,
    ["providerId", "rawId", "email", "displayName"],
    "Google-Providerdatensatz"
  );
  assertText(
    provider.rawId,
    "Google-Providerdatensatz.rawId",
    255,
    GOOGLE_PROVIDER_UID_PATTERN
  );
  if (
    provider.providerId !== "google.com"
    || provider.email !== value.email
    || provider.displayName !== value.displayName
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der Google-Providerdatensatz entspricht nicht dem freigegebenen Providervertrag."
    );
  }
  return Object.freeze({
    localId: value.localId,
    email: value.email,
    emailVerified: true,
    displayName: value.displayName,
    disabled: false,
    providerUserInfo: Object.freeze([
      Object.freeze({
        providerId: "google.com",
        rawId: provider.rawId,
        email: provider.email,
        displayName: provider.displayName
      })
    ])
  });
}

function validIdentityToolkitUser(value) {
  if (
    !isPlainObject(value)
    || typeof value.localId !== "string"
    || value.localId.length === 0
  ) {
    return false;
  }
  const optionalStrings = [
    "email",
    "displayName",
    "passwordHash",
    "passwordSalt",
    "password",
    "salt",
    "rawPassword",
    "phoneNumber",
    "customAttributes",
    "tenantId",
    "initialEmail"
  ];
  const optionalBooleans = [
    "emailVerified",
    "disabled",
    "customAuth",
    "emailLinkSignin"
  ];
  if (
    optionalStrings.some(
      (key) => value[key] !== undefined && typeof value[key] !== "string"
    )
    || optionalBooleans.some(
      (key) => value[key] !== undefined && typeof value[key] !== "boolean"
    )
    || (
      value.passwordUpdatedAt !== undefined
      && typeof value.passwordUpdatedAt !== "number"
    )
    || (value.version !== undefined && !Number.isInteger(value.version))
    || (value.mfaInfo !== undefined && !Array.isArray(value.mfaInfo))
    || (
      value.providerUserInfo !== undefined
      && !Array.isArray(value.providerUserInfo)
    )
  ) {
    return false;
  }
  return (value.providerUserInfo || []).every((provider) => (
    isPlainObject(provider)
    && typeof provider.providerId === "string"
    && provider.providerId.length > 0
    && [
      "rawId",
      "federatedId",
      "email",
      "displayName",
      "phoneNumber"
    ].every(
      (key) => provider[key] === undefined || typeof provider[key] === "string"
    )
  ));
}

function identityToolkitUser(value) {
  const providers = (Array.isArray(value?.providerUserInfo) ? value.providerUserInfo : [])
    .map((provider) => Object.freeze({
      providerId: String(provider?.providerId || ""),
      rawId: String(provider?.rawId || ""),
      federatedId: String(provider?.federatedId || ""),
      email: String(provider?.email || ""),
      displayName: String(provider?.displayName || ""),
      phoneNumber: String(provider?.phoneNumber || "")
    }))
    .filter((provider) => provider.providerId)
    .sort((left, right) => (
      `${left.providerId}\u0000${left.rawId}`.localeCompare(
        `${right.providerId}\u0000${right.rawId}`
      )
    ));
  const providerIds = new Set(providers.map((provider) => provider.providerId));
  const passwordUpdatedAt = Number(value?.passwordUpdatedAt || 0);
  const passwordVersion = Number(value?.version || 0);
  const hasPasswordCredential = (
    (typeof value?.passwordHash === "string" && value.passwordHash.length > 0)
    || (typeof value?.passwordSalt === "string" && value.passwordSalt.length > 0)
    || (typeof value?.password === "string" && value.password.length > 0)
    || (typeof value?.salt === "string" && value.salt.length > 0)
    || (typeof value?.rawPassword === "string" && value.rawPassword.length > 0)
    || (Number.isFinite(passwordUpdatedAt) && passwordUpdatedAt > 0)
    || (Number.isFinite(passwordVersion) && passwordVersion > 0)
    || providerIds.has("password")
  );
  if (hasPasswordCredential) {
    providerIds.add("password");
  }
  return Object.freeze({
    uid: String(value?.localId || ""),
    email: String(value?.email || ""),
    emailVerified: value?.emailVerified === true,
    disabled: value?.disabled === true,
    displayName: String(value?.displayName || ""),
    providerIds: Object.freeze([...providerIds].sort()),
    providers: Object.freeze(providers),
    hasPasswordCredential,
    phoneNumber: String(value?.phoneNumber || ""),
    emailLinkSignin: value?.emailLinkSignin === true,
    customAuth: value?.customAuth === true,
    hasCustomAttributes: (
      typeof value?.customAttributes === "string"
      && value.customAttributes.length > 0
    ),
    hasMfaEnrollment: Array.isArray(value?.mfaInfo) && value.mfaInfo.length > 0,
    tenantId: String(value?.tenantId || ""),
    initialEmail: String(value?.initialEmail || "")
  });
}

export function createIdentityToolkitAdminClient({
  projectId,
  apiKey,
  accessToken,
  fetchImpl = globalThis.fetch
}) {
  assertText(projectId, "Identity-Platform-Projekt", 30, PROJECT_PATTERN);
  if (!API_KEY_PATTERN.test(String(apiKey || ""))) {
    throw new IdentityPlatformOnboardingError(
      "Der Identity-Platform-API-Key ist ungueltig."
    );
  }
  if (!ACCESS_TOKEN_PATTERN.test(String(accessToken || ""))) {
    throw new IdentityPlatformOnboardingError("Das Google-Admin-Token ist ungueltig.");
  }
  if (typeof fetchImpl !== "function") {
    throw new IdentityPlatformOnboardingError("Die sichere HTTP-Laufzeit fehlt.");
  }

  const apiRoot = `${IDENTITY_TOOLKIT_ORIGIN}/v1/projects/${encodeURIComponent(projectId)}`;

  async function request(pathname, body) {
    let response;
    try {
      response = await fetchImpl(
        `${apiRoot}${pathname}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
            "x-goog-user-project": projectId
          },
          body: JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(IDENTITY_TOOLKIT_TIMEOUT_MS)
        }
      );
    } catch {
      throw Object.assign(new Error("Identity Toolkit request failed."), {
        code: "auth/internal-error"
      });
    }

    const contentLength = Number(response.headers?.get?.("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_API_RESPONSE_BYTES) {
      throw Object.assign(new Error("Identity Toolkit response too large."), {
        code: "auth/internal-error"
      });
    }

    let payload;
    try {
      const responseText = await response.text();
      if (Buffer.byteLength(responseText, "utf8") > MAX_API_RESPONSE_BYTES) {
        throw new Error("response too large");
      }
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw Object.assign(new Error("Identity Toolkit rejected the request."), {
        code: mapIdentityToolkitError(identityToolkitErrorCode(payload))
      });
    }
    if (!isPlainObject(payload)) {
      throw Object.assign(new Error("Identity Toolkit returned invalid JSON."), {
        code: "auth/internal-error"
      });
    }
    return payload;
  }

  async function lookup(body) {
    const payload = await request("/accounts:lookup", body);
    if (payload.users !== undefined && !Array.isArray(payload.users)) {
      throw Object.assign(new Error("Identity Platform returned an invalid user lookup."), {
        code: "auth/internal-error"
      });
    }
    const users = Array.isArray(payload.users) ? payload.users : [];
    if (users.length === 0) {
      throw Object.assign(new Error("Identity Platform user not found."), {
        code: "auth/user-not-found"
      });
    }
    if (users.length !== 1) {
      throw Object.assign(new Error("Identity Platform returned an ambiguous user lookup."), {
        code: "auth/internal-error"
      });
    }
    if (!validIdentityToolkitUser(users[0])) {
      throw Object.assign(new Error("Identity Platform returned an invalid user."), {
        code: "auth/internal-error"
      });
    }
    return identityToolkitUser(users[0]);
  }

  return Object.freeze({
    webApiKey: apiKey,
    getUser: (uid) => lookup({ localId: [uid] }),
    getUserByEmail: (email) => lookup({ email: [email] }),
    getUserByProviderUid: (providerId, rawId) => lookup({
      federatedUserId: [{ providerId, rawId }]
    }),
    async importGoogleUserCreateOnly(value) {
      const record = validateGoogleImportRecord(value);
      const payload = await request("/accounts:batchCreate", {
        users: [record],
        sanityCheck: true,
        allowOverwrite: false
      });
      if (!Array.isArray(payload.error) && payload.error !== undefined) {
        throw Object.assign(new Error("Identity Platform returned an invalid import result."), {
          code: "auth/internal-error"
        });
      }
      if ((payload.error || []).length > 0) {
        throw Object.assign(new Error("Identity Platform rejected the create-only import."), {
          code: "auth/import-user-error"
        });
      }
      return Object.freeze({ successCount: 1, failureCount: 0 });
    },
    async createUser(value) {
      await request("/accounts", {
        localId: value.uid,
        email: value.email,
        emailVerified: value.emailVerified,
        password: value.password,
        displayName: value.displayName,
        disabled: value.disabled
      });
      return lookup({ localId: [value.uid] });
    },
    async generatePasswordResetLink(email, settings) {
      const payload = await request("/accounts:sendOobCode", {
        requestType: "PASSWORD_RESET",
        email,
        continueUrl: settings?.url,
        canHandleCodeInApp: settings?.handleCodeInApp === true,
        returnOobLink: true
      });
      return String(payload.oobLink || "");
    }
  });
}

export async function defaultIdentityPlatformAuth(projectId) {
  return createIdentityToolkitAdminClient({
    projectId,
    apiKey: identityPlatformApiKey(),
    accessToken: shortLivedGoogleAccessToken(projectId)
  });
}

export function usage() {
  return `Administratives Identity-Platform-Onboarding fuer genau einen pre-gematik Account

Preview create-only:
  node scripts/provision_pre_gematik_identity_platform_account.mjs \\
    --input /absolut/owner-only/account.json

Apply create-only und Set-password-Link:
  node scripts/provision_pre_gematik_identity_platform_account.mjs \\
    --input /absolut/owner-only/account.json \\
    --output /absolut/owner-only/set-password-link.txt \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project PROJECT_ID \\
    --confirm-operation ${CREATE_OPERATION} \\
    --confirm-fingerprint sha256:FINGERPRINT

Nur wenn der Account nach einem bestaetigten Teilfehler bereits exakt existiert:
  zusaetzlich --recover-link-only und
  --confirm-operation ${RECOVER_LINK_OPERATION}

Der Operator gibt weder E-Mail, UID, Passwort noch Link aus. Der Link wird
create-only mit Modus 0600 ausserhalb des Git-Worktrees geschrieben. Er ist
eine Set-password-Einladung fuer den E-Mail/Passwort-Provider und kein
passwortloser IAP-Login.`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseIdentityPlatformAccountArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const document = await loadProtectedIdentityPlatformAccountDocument(options.input);
  const fingerprint = identityPlatformAccountFingerprint(document);
  const auth = await defaultIdentityPlatformAuth(document.project_id);
  await executeIdentityPlatformAccountOnboarding({
    auth,
    document,
    fingerprint,
    options
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof IdentityPlatformOnboardingError
      ? error.message
      : "Der Identity-Platform-Admin-Operator ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode = error instanceof IdentityPlatformOnboardingError ? error.exitCode : 1;
  });
}
