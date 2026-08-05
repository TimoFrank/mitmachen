#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  loadProtectedIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  EXPECTED_PILOT_END,
  WELCOME_EMAIL_ALTERNATIVE_BOUNDARY,
  WELCOME_EMAIL_BRAND_ASSET_SPECS,
  WELCOME_EMAIL_RELATED_BOUNDARY,
  WELCOME_EMAIL_SENDER_EMAIL,
  WELCOME_EMAIL_SENDER_NAME,
  WELCOME_EMAIL_SUBJECT,
  WELCOME_EMAIL_TEMPLATE_ID,
  containsHiddenEmailContent,
  loadProtectedBrandedSetPasswordLink,
  loadWelcomeEmailTemplates,
  renderGuestWelcomeEmail,
  validateWelcomeEmailBrandMarkup,
  validateBrandedSetPasswordLink
} from "./render_pre_gematik_guest_welcome_email.mjs";
import {
  PASSWORD_INVITATION_TTL_MS,
  activatePreparedPasswordInvitation,
  createPasswordInvitationGcsStore,
  readBoundPreparedPasswordInvitation,
  validatePasswordInvitationBucket,
  validatePasswordInvitationLink
} from "./provision_pre_gematik_password_invitation.mjs";

export const WELCOME_EMAIL_SEND_OPERATION =
  "SEND_PRE_GEMATIK_GUEST_WELCOME_EMAIL";
export const WELCOME_EMAIL_SMTP_HOST = "w01abca0.kasserver.com";
export const WELCOME_EMAIL_SMTP_PORT = 465;
export const WELCOME_EMAIL_SMTP_SECURITY = "implicit_tls";

const MAX_MAIL_BYTES = 512 * 1024;
const MAX_SMTP_CONFIG_BYTES = 16 * 1024;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const EXPECTED_MAIL_HEADERS = Object.freeze([
  "content-type",
  "from",
  "mime-version",
  "reply-to",
  "subject",
  "to",
  "x-versorgungs-kompass-template"
]);
const EXPECTED_SMTP_KEYS = Object.freeze([
  "host",
  "password",
  "port",
  "security",
  "sender_email",
  "username",
  "version"
]);

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
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

async function loadOwnerOnlyFile(
  filePath,
  { label, maximumBytes, repository, encoding = "utf8" }
) {
  if (
    !path.isAbsolute(String(filePath || ""))
    || /[\u0000-\u001f\u007f]/u.test(String(filePath || ""))
  ) {
    throw new IdentityPlatformOnboardingError(
      `${label} muss ein absoluter Dateipfad sein.`
    );
  }
  let linkMetadata;
  try {
    linkMetadata = await fs.lstat(filePath);
  } catch {
    throw new IdentityPlatformOnboardingError(`${label} fehlt.`);
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(`${label} darf kein Symlink sein.`);
  }
  const [resolved, resolvedRepository] = await Promise.all([
    fs.realpath(filePath),
    fs.realpath(repository)
  ]);
  const metadata = await fs.stat(resolved);
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isFile()
    || metadata.size === 0
    || metadata.size > maximumBytes
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new IdentityPlatformOnboardingError(
      `${label} muss owner-only und ausserhalb des Git-Worktrees liegen.`
    );
  }
  return Object.freeze({
    contents: await fs.readFile(resolved, encoding),
    path: resolved
  });
}

function safeString(value, label, maximumLength) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.length > maximumLength
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new IdentityPlatformOnboardingError(`${label} ist ungueltig.`);
  }
  return value;
}

export function validateWelcomeEmailSmtpConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte SMTP-Konfiguration ist ungueltig."
    );
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== EXPECTED_SMTP_KEYS.length
    || keys.some((key, index) => key !== EXPECTED_SMTP_KEYS[index])
    || value.version !== 1
    || value.host !== WELCOME_EMAIL_SMTP_HOST
    || value.port !== WELCOME_EMAIL_SMTP_PORT
    || value.security !== WELCOME_EMAIL_SMTP_SECURITY
    || value.sender_email !== WELCOME_EMAIL_SENDER_EMAIL
    || value.username !== WELCOME_EMAIL_SENDER_EMAIL
    || !EMAIL_PATTERN.test(value.sender_email)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die SMTP-Konfiguration ist nicht exakt auf das freigegebene Domain-Postfach gepinnt."
    );
  }
  const password = safeString(value.password, "Das SMTP-Passwort", 128);
  if (password.length < 10) {
    throw new IdentityPlatformOnboardingError(
      "Das SMTP-Passwort ist zu kurz."
    );
  }
  return Object.freeze({
    version: 1,
    host: WELCOME_EMAIL_SMTP_HOST,
    port: WELCOME_EMAIL_SMTP_PORT,
    security: WELCOME_EMAIL_SMTP_SECURITY,
    username: WELCOME_EMAIL_SENDER_EMAIL,
    password,
    sender_email: WELCOME_EMAIL_SENDER_EMAIL
  });
}

function parseHeaders(rawMail) {
  if (
    typeof rawMail !== "string"
    || !rawMail.endsWith("\r\n")
    || !rawMail.includes("\r\n\r\n")
    || /(?<!\r)\n/u.test(rawMail)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt keine kanonische CRLF-MIME-Struktur."
    );
  }
  const separatorIndex = rawMail.indexOf("\r\n\r\n");
  const headerBlock = rawMail.slice(0, separatorIndex);
  const body = rawMail.slice(separatorIndex + 4);
  const unfolded = headerBlock.replace(/\r\n[ \t]+/gu, " ");
  if (unfolded !== headerBlock) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei darf keine gefalteten oder zusaetzlichen Header enthalten."
    );
  }
  const headers = new Map();
  for (const line of unfolded.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new IdentityPlatformOnboardingError(
        "Die EML-Datei besitzt einen ungueltigen Header."
      );
    }
    const name = line.slice(0, separator).toLowerCase();
    const value = line.slice(separator + 1).trim();
    const values = headers.get(name) || [];
    values.push(value);
    headers.set(name, values);
  }
  return Object.freeze({ headers, body });
}

function exactlyOneHeader(headers, name) {
  const values = headers.get(name) || [];
  if (values.length !== 1 || values[0] === "") {
    throw new IdentityPlatformOnboardingError(
      `Die EML-Datei besitzt keinen eindeutigen ${name}-Header.`
    );
  }
  return values[0];
}

function canonicalMimePartBody(section, expectedHeaders) {
  if (!section.startsWith("\r\n") || !section.endsWith("\r\n")) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt einen ungueltigen MIME-Teil."
    );
  }
  const canonicalSection = section.slice(2, -2);
  const partSeparator = canonicalSection.indexOf("\r\n\r\n");
  if (
    partSeparator < 0
    || canonicalSection.slice(0, partSeparator) !== expectedHeaders
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt nicht freigegebene MIME-Header."
    );
  }
  return canonicalSection.slice(partSeparator + 4);
}

function decodeCanonicalMimeBase64(encoded) {
  const lines = encoded.split("\r\n");
  if (
    lines.length === 0
    || lines.some((line, lineIndex) =>
      line.length === 0
      || line.length > 76
      || (lineIndex < lines.length - 1 && line.length !== 76)
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(line)
    )
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt keine kanonische Base64-Kodierung."
    );
  }
  const compact = lines.join("");
  const decoded = Buffer.from(compact, "base64");
  if (decoded.toString("base64") !== compact) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt einen ungueltigen Base64-Inhalt."
    );
  }
  return decoded;
}

function decodeCanonicalUtf8MimePart(section, expectedHeaders) {
  const decoded = decodeCanonicalMimeBase64(
    canonicalMimePartBody(section, expectedHeaders)
  );
  const text = decoded.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(decoded)) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt keinen kanonischen UTF-8-Inhalt."
    );
  }
  return text;
}

export function validateWelcomeEmailEml(rawMail) {
  const parsedMail = parseHeaders(rawMail);
  const { headers, body } = parsedMail;
  const actualHeaderNames = [...headers.keys()].sort();
  if (
    actualHeaderNames.length !== EXPECTED_MAIL_HEADERS.length
    || actualHeaderNames.some(
      (name, index) => name !== EXPECTED_MAIL_HEADERS[index]
    )
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei enthaelt nicht freigegebene oder fehlende Header."
    );
  }
  const from = exactlyOneHeader(headers, "from");
  const replyTo = exactlyOneHeader(headers, "reply-to");
  const to = exactlyOneHeader(headers, "to");
  const subject = exactlyOneHeader(headers, "subject");
  const mimeVersion = exactlyOneHeader(headers, "mime-version");
  const contentType = exactlyOneHeader(headers, "content-type");
  const template = exactlyOneHeader(
    headers,
    "x-versorgungs-kompass-template"
  );
  const contentTypeMatch = contentType.match(
    /^multipart\/related; boundary="vk-pre-gematik-welcome-related-v5"; type="multipart\/alternative"; start="<(vk-welcome\.([a-f0-9]{24})@versorgungs-kompass\.de)>"$/u
  );
  if (
    from !== `${WELCOME_EMAIL_SENDER_NAME} <${WELCOME_EMAIL_SENDER_EMAIL}>`
    || replyTo !== `<${WELCOME_EMAIL_SENDER_EMAIL}>`
    || !/^<[^<>]+>$/u.test(to)
    || subject !== WELCOME_EMAIL_SUBJECT
    || mimeVersion !== "1.0"
    || !contentTypeMatch
    || template !== WELCOME_EMAIL_TEMPLATE_ID
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei entspricht nicht dem freigegebenen Domain-Mailvertrag."
    );
  }
  const recipient = to.slice(1, -1);
  if (
    recipient !== recipient.toLowerCase()
    || !EMAIL_PATTERN.test(recipient)
    || recipient === WELCOME_EMAIL_SENDER_EMAIL
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt keinen eindeutigen persoenlichen Empfaenger."
    );
  }

  const rootContentId = contentTypeMatch[1];
  const cidToken = contentTypeMatch[2];
  const relatedSections = body.split(`--${WELCOME_EMAIL_RELATED_BOUNDARY}`);
  if (
    relatedSections.length !== WELCOME_EMAIL_BRAND_ASSET_SPECS.length + 3
    || relatedSections[0] !== ""
    || relatedSections.at(-1) !== "--\r\n"
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt keine exakte eingebettete MIME-Struktur."
    );
  }
  const alternativeBody = canonicalMimePartBody(
    relatedSections[1],
    `Content-Type: multipart/alternative; boundary="${WELCOME_EMAIL_ALTERNATIVE_BOUNDARY}"\r\nContent-ID: <${rootContentId}>`
  );
  const alternativeSections = alternativeBody.split(
    `--${WELCOME_EMAIL_ALTERNATIVE_BOUNDARY}`
  );
  if (
    alternativeSections.length !== 4
    || alternativeSections[0] !== ""
    || alternativeSections[3] !== "--"
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei besitzt keine exakte Text-/HTML-Alternativstruktur."
    );
  }
  const expectedAlternativeHeaders = Object.freeze([
    'Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64',
    'Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64'
  ]);
  const [textPart, htmlPart] = alternativeSections
    .slice(1, 3)
    .map((section, index) =>
      decodeCanonicalUtf8MimePart(
        section,
        expectedAlternativeHeaders[index]
      )
    );
  if (/cid:/iu.test(textPart)) {
    throw new IdentityPlatformOnboardingError(
      "Die Text-Mail darf keine eingebetteten Content-IDs enthalten."
    );
  }
  const brandAssets = WELCOME_EMAIL_BRAND_ASSET_SPECS.map((spec, index) => {
    const contentId =
      `${spec.cidPrefix}.${cidToken}@versorgungs-kompass.de`;
    const encodedAsset = canonicalMimePartBody(
      relatedSections[index + 2],
      `Content-Type: image/png; name="${spec.filename}"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${contentId}>\r\nContent-Disposition: inline; filename="${spec.filename}"`
    );
    const bytes = decodeCanonicalMimeBase64(encodedAsset);
    if (
      bytes.length === 0
      || bytes.length > 32 * 1024
      || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      || bytes.subarray(12, 16).toString("ascii") !== "IHDR"
      || bytes.readUInt32BE(16) !== 72
      || bytes.readUInt32BE(20) !== 72
      || bytes[24] !== 8
      || bytes[25] !== 6
      || createHash("sha256").update(bytes).digest("hex") !== spec.pngSha256
    ) {
      throw new IdentityPlatformOnboardingError(
        "Die EML-Datei besitzt kein freigegebenes eingebettetes Mail-Signet."
      );
    }
    return Object.freeze({ ...spec, contentId });
  });
  validateWelcomeEmailBrandMarkup(htmlPart, brandAssets);
  const decodedCombined = `${textPart}\n${htmlPart}`;
  const lower = decodedCombined.toLowerCase();
  if (containsHiddenEmailContent(decodedCombined)) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei enthaelt verborgene Inhalte."
    );
  }
  for (const forbidden of [
    "firebase",
    "steam-capsule",
    "identity platform",
    "google cloud",
    "<script",
    "<form",
    "<svg",
    "<object",
    "<iframe",
    "<embed",
    "<video",
    "<audio",
    "<picture",
    "<source",
    "<link",
    "data:",
    "javascript:",
    "background-image",
    "@import",
    "http://"
  ]) {
    if (lower.includes(forbidden)) {
      throw new IdentityPlatformOnboardingError(
        "Die EML-Datei enthaelt nicht freigegebene Technik oder aktive Inhalte."
      );
    }
  }
  if (/\son[a-z]+\s*=|url\s*\(/iu.test(decodedCombined)) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei enthaelt nicht freigegebene Technik oder aktive Inhalte."
    );
  }
  const remoteUrls = [...decodedCombined.matchAll(/https?:\/\/[^"<\s]+/gu)]
    .map((match) => match[0].replaceAll("&amp;", "&"));
  const actionUrls = remoteUrls.filter((url) => {
    try {
      return validatePasswordInvitationLink(url).href === url;
    } catch {
      return false;
    }
  });
  const continueUrls = remoteUrls.filter((url) => url === EXPECTED_CONTINUE_URL);
  if (
    remoteUrls.length !== 4
    || actionUrls.length !== 3
    || new Set(actionUrls).size !== 1
    || continueUrls.length !== 1
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei enthaelt keinen exklusiven gebrandeten 48-Stunden-Wrapperlink."
    );
  }
  if (
    (htmlPart.match(/<a\s+href=/gu) || []).length !== 1
    || !htmlPart.includes("Persönlichen Zugang einrichten")
    || !textPart.includes("Bitte richte deinen Zugang innerhalb von 48 Stunden vollständig ein.")
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei entspricht nicht der freigegebenen Onboarding-Vorlage."
    );
  }
  return Object.freeze({ recipient, textPart, htmlPart });
}

function mailFingerprint(rawMail) {
  const digest = createHash("sha256");
  digest.update("versorgungs-kompass-pre-gematik-welcome-mail-v5\0", "utf8");
  digest.update(rawMail, "utf8");
  return `sha256:${digest.digest("hex")}`;
}

export function defaultWelcomeEmailReceiptDirectory() {
  let account;
  try {
    account = os.userInfo();
  } catch {
    account = null;
  }
  const homeDirectory = String(account?.homedir || "");
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : account?.uid;
  if (
    !path.isAbsolute(homeDirectory)
    || homeDirectory === path.parse(homeDirectory).root
    || account?.uid !== currentUid
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das feste Verzeichnis fuer Versandbelege konnte nicht sicher bestimmt werden."
    );
  }
  return path.join(
    homeDirectory,
    ".local",
    "state",
    "versorgungs-kompass",
    "pre-gematik-welcome-email"
  );
}

export function welcomeEmailReceiptPath(receiptDirectory, fingerprint) {
  if (
    !path.isAbsolute(receiptDirectory)
    || !FINGERPRINT_PATTERN.test(fingerprint)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der deterministische Versandbeleg konnte nicht abgeleitet werden."
    );
  }
  return path.join(
    receiptDirectory,
    `welcome-send-${fingerprint.slice("sha256:".length)}.json`
  );
}

function transportMail(rawMail, { sentAt, messageId }) {
  if (
    !(sentAt instanceof Date)
    || Number.isNaN(sentAt.valueOf())
    || !/^[a-z0-9-]{36}$/u.test(messageId)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Transportzeit oder Message-ID ist ungueltig."
    );
  }
  const marker = "\r\nMIME-Version: 1.0\r\n";
  if (rawMail.split(marker).length !== 2) {
    throw new IdentityPlatformOnboardingError(
      "Die Transport-Header konnten nicht eindeutig eingefuegt werden."
    );
  }
  const transportHeaders = [
    `Date: ${sentAt.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${messageId}@versorgungs-kompass.de>`
  ].join("\r\n");
  return rawMail.replace(marker, `\r\n${transportHeaders}${marker}`);
}

function curlConfigEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildSmtpCurlConfig({ smtp, recipient }) {
  const quote = (value) => `"${curlConfigEscape(value)}"`;
  return [
    "silent",
    "show-error",
    "fail-with-body",
    "ssl-reqd",
    "connect-timeout = 15",
    "max-time = 45",
    `url = ${quote(`smtps://${smtp.host}:${smtp.port}`)}`,
    `user = ${quote(`${smtp.username}:${smtp.password}`)}`,
    `mail-from = ${quote(smtp.sender_email)}`,
    `mail-rcpt = ${quote(recipient)}`,
    'upload-file = "-"',
    ""
  ].join("\n");
}

export async function curlSmtpTransport({
  curlConfig,
  rawMail,
  environment = process.env
}) {
  const configDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vk-welcome-smtp-curl-")
  );
  const configPath = path.join(configDirectory, "curl.conf");
  let configHandle;
  try {
    await fs.chmod(configDirectory, 0o700);
    await fs.writeFile(configPath, curlConfig, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    configHandle = await fs.open(configPath, "r");

    // curl must receive a regular file descriptor on Linux. Node implements
    // extra "pipe" descriptors as sockets there, which /dev/fd cannot reopen.
    // Unlinking the owner-only file before spawn keeps the credentials
    // anonymous while the inherited descriptor remains readable by curl.
    await fs.unlink(configPath);

    await new Promise((resolve, reject) => {
      const child = spawn("curl", ["--disable", "--config", "/dev/fd/3"], {
        env: environment,
        stdio: ["pipe", "ignore", "pipe", configHandle.fd]
      });
      let stderrBytes = 0;
      child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.length;
        if (stderrBytes > 64 * 1024) child.kill("SIGTERM");
      });
      child.on("error", () => reject(new Error("curl unavailable")));
      child.on("close", (code, signal) => {
        if (code === 0 && !signal) resolve();
        else reject(new Error("smtp transport failed"));
      });
      child.stdin.on("error", () => {});
      child.stdin.end(rawMail, "utf8");
    });
  } finally {
    await configHandle?.close().catch(() => {});
    await fs.rm(configDirectory, { force: true, recursive: true });
  }
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new IdentityPlatformOnboardingError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseWelcomeEmailSendArguments(argv) {
  const options = {
    help: false,
    apply: false,
    input: "",
    linkFile: "",
    mailFile: "",
    smtpConfig: "",
    invitationBucket: "",
    confirmOperation: "",
    confirmFingerprint: ""
  };
  const valueOptions = new Map([
    ["--input", "input"],
    ["--link-file", "linkFile"],
    ["--mail-file", "mailFile"],
    ["--smtp-config", "smtpConfig"],
    ["--invitation-bucket", "invitationBucket"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
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

function validateApplyArguments(options, fingerprint) {
  if (
    !options.input
    || !options.linkFile
    || !options.mailFile
    || !options.smtpConfig
    || !options.invitationBucket
  ) {
    throw new IdentityPlatformOnboardingError(
      "Account-, Link-, EML-, SMTP- oder Einladungs-Bucket-Eingabe fehlt."
    );
  }
  validatePasswordInvitationBucket(options.invitationBucket);
  if (!options.apply) {
    if (
      options.confirmOperation
      || options.confirmFingerprint
    ) {
      throw new IdentityPlatformOnboardingError(
        "Apply-Bestaetigungen sind nur mit --apply erlaubt."
      );
    }
    return;
  }
  if (
    options.confirmOperation !== WELCOME_EMAIL_SEND_OPERATION
    || options.confirmFingerprint !== fingerprint
    || !FINGERPRINT_PATTERN.test(options.confirmFingerprint)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Apply-Bestaetigungen fuer SMTP-Versand oder Fingerprint fehlen."
    );
  }
}

async function assertSafeReceiptPath(receiptPath, repository) {
  if (
    !path.isAbsolute(String(receiptPath || ""))
    || /[\u0000-\u001f\u007f]/u.test(String(receiptPath || ""))
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der deterministische Versandbeleg muss ein absoluter geschuetzter Dateipfad sein."
    );
  }
  const requested = path.resolve(receiptPath);
  const parent = path.dirname(requested);
  try {
    await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Das feste Verzeichnis fuer Versandbelege konnte nicht sicher angelegt werden."
    );
  }
  let existing;
  try {
    existing = await fs.lstat(requested);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new IdentityPlatformOnboardingError(
        "Der Versandbeleg konnte nicht create-only geprueft werden."
      );
    }
  }
  if (existing) {
    throw new IdentityPlatformOnboardingError(
      "Der Versandbeleg existiert bereits; ein erneuter Versand wurde verhindert."
    );
  }
  const parentLinkMetadata = await fs.lstat(parent).catch(() => null);
  if (!parentLinkMetadata || parentLinkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(
      "Das Elternverzeichnis fuer den Versandbeleg ist ungueltig."
    );
  }
  const [resolvedParent, resolvedRepository] = await Promise.all([
    fs.realpath(parent),
    fs.realpath(repository)
  ]);
  const metadata = await fs.stat(resolvedParent);
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolvedParent, resolvedRepository)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das Elternverzeichnis fuer den Versandbeleg muss owner-only und ausserhalb des Git-Worktrees liegen."
    );
  }
  return requested;
}

async function writeReceipt(receiptPath, payload, { create = false } = {}) {
  const contents = `${JSON.stringify(payload, null, 2)}\n`;
  if (create) {
    const handle = await fs.open(receiptPath, "wx", 0o600);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return;
  }
  await fs.writeFile(receiptPath, contents, { encoding: "utf8", mode: 0o600 });
}

function safeSummary({ apply, fingerprint, accepted = false, activated = false }) {
  return [
    "schema_version=1",
    `operation=${WELCOME_EMAIL_SEND_OPERATION}`,
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    `smtp_accepted=${accepted}`,
    `invitation_activated=${activated}`,
    `mail_fingerprint=${fingerprint}`
  ].join("\n");
}

export async function executeWelcomeEmailSend({
  options,
  repository = repositoryRoot(),
  transport = curlSmtpTransport,
  invitationStoreFactory = ({ bucket, projectId }) =>
    createPasswordInvitationGcsStore({ bucket, projectId }),
  readPreparedInvitation = readBoundPreparedPasswordInvitation,
  activateInvitation = activatePreparedPasswordInvitation,
  receiptDirectory = defaultWelcomeEmailReceiptDirectory(),
  log = console.log,
  now = () => new Date(),
  messageIdFactory = () => randomUUID()
}) {
  const [mailFile, smtpFile, document, rawActionUrl, templates] =
    await Promise.all([
      loadOwnerOnlyFile(options.mailFile, {
        label: "Die geschuetzte EML-Datei",
        maximumBytes: MAX_MAIL_BYTES,
        repository
      }),
      loadOwnerOnlyFile(options.smtpConfig, {
        label: "Die geschuetzte SMTP-Konfiguration",
        maximumBytes: MAX_SMTP_CONFIG_BYTES,
        repository
      }),
      loadProtectedIdentityPlatformAccountDocument(
        options.input,
        { repository }
      ),
      loadProtectedBrandedSetPasswordLink(
        options.linkFile,
        { repository }
      ),
      loadWelcomeEmailTemplates()
    ]);
  let smtpDocument;
  try {
    smtpDocument = JSON.parse(smtpFile.contents);
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte SMTP-Konfiguration ist kein gueltiges JSON-Dokument."
    );
  }
  const smtp = validateWelcomeEmailSmtpConfig(smtpDocument);
  const actionUrl = validateBrandedSetPasswordLink(rawActionUrl, document);
  const expectedMail = await renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: WELCOME_EMAIL_SENDER_NAME,
    senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
    pilotEnd: EXPECTED_PILOT_END,
    ...templates
  });
  if (mailFile.contents !== expectedMail.eml) {
    throw new IdentityPlatformOnboardingError(
      "Die EML-Datei stimmt nicht bytegenau mit Account, Einmal-Link und versionierter Vorlage ueberein."
    );
  }
  const { recipient } = validateWelcomeEmailEml(mailFile.contents);
  if (recipient !== document.email) {
    throw new IdentityPlatformOnboardingError(
      "Der EML-Empfaenger stimmt nicht mit dem geschuetzten Gastkonto ueberein."
    );
  }
  const invitationStore = invitationStoreFactory({
    bucket: options.invitationBucket,
    projectId: document.project_id
  });
  const preparedInvitation = await readPreparedInvitation({
    actionUrl,
    account: document,
    store: invitationStore
  });
  const fingerprint = mailFingerprint(mailFile.contents);
  validateApplyArguments(options, fingerprint);
  if (!options.apply) {
    log(safeSummary({ apply: false, fingerprint }));
    return Object.freeze({
      applied: false,
      accepted: false,
      activated: false,
      fingerprint
    });
  }

  const receiptPath = await assertSafeReceiptPath(
    welcomeEmailReceiptPath(receiptDirectory, fingerprint),
    repository
  );
  const sentAt = now();
  const messageId = messageIdFactory();
  const canonicalMessageId =
    `<${messageId}@versorgungs-kompass.de>`;
  const rawTransportMail = transportMail(
    mailFile.contents,
    { sentAt, messageId }
  );
  const pending = Object.freeze({
    version: 1,
    operation: WELCOME_EMAIL_SEND_OPERATION,
    status: "sending",
    mail_fingerprint: fingerprint,
    send_started_at: sentAt.toISOString(),
    message_id: canonicalMessageId
  });
  await writeReceipt(receiptPath, pending, { create: true });
  try {
    await transport({
      curlConfig: buildSmtpCurlConfig({
        smtp,
        recipient
      }),
      rawMail: rawTransportMail
    });
  } catch {
    await writeReceipt(receiptPath, {
      ...pending,
      status: "unknown",
      failed_at: now().toISOString()
    }).catch(() => {});
    throw new IdentityPlatformOnboardingError(
      "Der SMTP-Ausgang ist unklar. Nicht erneut senden, bevor der Versandbeleg und das Zielpostfach geprueft wurden."
    );
  }

  const acceptedAt = now();
  if (!(acceptedAt instanceof Date) || Number.isNaN(acceptedAt.valueOf())) {
    await writeReceipt(receiptPath, {
      ...pending,
      status: "smtp_accepted_activation_pending",
      accepted_at: null,
      invitation_digest: preparedInvitation.digest,
      prepared_generation: preparedInvitation.generation
    }).catch(() => {});
    throw new IdentityPlatformOnboardingError(
      "SMTP hat die Mail angenommen, aber die Aktivierungszeit ist unklar. "
      + "Nicht erneut senden; Versandbeleg und prepared-Generation abgleichen.",
      1
    );
  }
  const acceptedAtIso = acceptedAt.toISOString();
  const activationPending = {
    ...pending,
    status: "smtp_accepted_activation_pending",
    accepted_at: acceptedAtIso,
    invitation_digest: preparedInvitation.digest,
    prepared_generation: preparedInvitation.generation
  };
  await writeReceipt(receiptPath, activationPending).catch(() => {});

  let activeInvitation;
  try {
    activeInvitation = await activateInvitation({
      prepared: preparedInvitation,
      acceptedAt: acceptedAtIso,
      store: invitationStore
    });
  } catch {
    await writeReceipt(receiptPath, {
      ...activationPending,
      activation_status: "reconciliation_required"
    }).catch(() => {});
    throw new IdentityPlatformOnboardingError(
      "SMTP hat die Mail angenommen, aber die 48-Stunden-Einladung ist noch nicht "
      + "bestaetigt aktiv. Nicht erneut senden; Versandbeleg sowie prepared-/active-"
      + "Generation abgleichen und die Aktivierung reconciliieren.",
      1
    );
  }
  const expectedExpiry = new Date(
    acceptedAt.valueOf() + PASSWORD_INVITATION_TTL_MS
  ).toISOString();
  if (
    activeInvitation.record?.accepted_at !== acceptedAtIso
    || activeInvitation.record?.expires_at !== expectedExpiry
  ) {
    await writeReceipt(receiptPath, {
      ...activationPending,
      activation_status: "reconciliation_required"
    }).catch(() => {});
    throw new IdentityPlatformOnboardingError(
      "SMTP hat die Mail angenommen, aber die aktive Einladung ist nicht exakt auf "
      + "48 Stunden bestaetigt. Nicht erneut senden; den Aktivierungsnachweis abgleichen.",
      1
    );
  }
  try {
    await writeReceipt(receiptPath, {
      ...pending,
      status: "accepted",
      accepted_at: acceptedAtIso,
      invitation_status: "active",
      invitation_expires_at: expectedExpiry,
      invitation_digest: activeInvitation.digest,
      active_generation: activeInvitation.generation
    });
  } catch {
    throw new IdentityPlatformOnboardingError(
      "SMTP hat die Mail angenommen und die Einladung wurde aktiviert, aber der "
      + "Versandbeleg ist unvollstaendig. Nicht erneut senden; active-Generation abgleichen.",
      1
    );
  }
  log(safeSummary({
    apply: true,
    fingerprint,
    accepted: true,
    activated: true
  }));
  return Object.freeze({
    applied: true,
    accepted: true,
    activated: true,
    fingerprint
  });
}

export function usage() {
  return `Direkter TLS-SMTP-Versand der geprueften Gast-Willkommensmail

Preview:
  node scripts/send_pre_gematik_guest_welcome_email.mjs \\
    --input /absolut/owner-only/account.json \\
    --link-file /absolut/owner-only/set-password-link.txt \\
    --mail-file /absolut/owner-only/welcome.eml \\
    --smtp-config /absolut/owner-only/smtp.json \\
    --invitation-bucket PRIVATE_INVITATION_BUCKET

Einmaliger Versand:
  zusaetzlich --apply \\
    --confirm-operation ${WELCOME_EMAIL_SEND_OPERATION} \\
    --confirm-fingerprint sha256:<preview-fingerprint>

Die SMTP-Konfiguration bleibt owner-only ausserhalb des Git-Worktrees. Passwort,
Empfaenger und Einmal-Link werden nicht auf stdout ausgegeben.
Vor Preview und Apply wird das inerte prepared-Objekt generationengenau gegen
Account und Wrapperlink geprueft. Erst nach SMTP-Annahme wird active create-only
mit exakt 48 Stunden Laufzeit geschrieben und prepared bedingt geloescht.
Versandbelege liegen fest unter
~/.local/state/versorgungs-kompass/pre-gematik-welcome-email.`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseWelcomeEmailSendArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  await executeWelcomeEmailSend({ options });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof IdentityPlatformOnboardingError
      ? error.message
      : "Der sichere SMTP-Versand ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode =
      error instanceof IdentityPlatformOnboardingError ? error.exitCode : 1;
  });
}
