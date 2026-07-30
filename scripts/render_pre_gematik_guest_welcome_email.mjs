#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  identityPlatformAccountFingerprint,
  loadProtectedIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";

export const WELCOME_EMAIL_OPERATION = "RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL";
export const WELCOME_EMAIL_SUBJECT =
  "Willkommen beim Versorgungs-Kompass – dein persönlicher Testzugang";
export const EXPECTED_PILOT_END = "2026-08-17T16:00:00Z";
export const PASSWORD_ACTION_ORIGIN = "https://versorgungs-kompass.de";
export const PASSWORD_ACTION_PATH = "/konto/passwort-festlegen";

const MAX_LINK_BYTES = 16 * 1024;
const MAX_TEMPLATE_BYTES = 256 * 1024;
const API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/u;
const ACTION_CODE_PATTERN = /^[A-Za-z0-9_-]{20,1024}$/u;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ALLOWED_ACTION_PARAMETERS = new Set([
  "apiKey",
  "continueUrl",
  "lang",
  "mode",
  "oobCode"
]);
const TEMPLATE_DIRECTORY = new URL("../templates/email/", import.meta.url);
const TEXT_TEMPLATE = new URL(
  "pre-gematik-guest-welcome.txt",
  TEMPLATE_DIRECTORY
);
const HTML_TEMPLATE = new URL(
  "pre-gematik-guest-welcome.html",
  TEMPLATE_DIRECTORY
);
const REQUIRED_PLACEHOLDERS = Object.freeze([
  "ACTION_URL",
  "DISPLAY_NAME",
  "PILOT_END",
  "RECIPIENT_EMAIL",
  "SENDER_EMAIL",
  "SENDER_NAME"
]);

function safeText(value, label, maximumLength, pattern) {
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
  return value;
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

async function assertOwnerOnlyRegularFile(filePath, label, maximumBytes, repository) {
  if (!path.isAbsolute(String(filePath || ""))) {
    throw new IdentityPlatformOnboardingError(`${label} muss ein absoluter Dateipfad sein.`);
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
  const resolved = await fs.realpath(filePath);
  const resolvedRepository = await fs.realpath(repository);
  const metadata = await fs.stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
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
  return resolved;
}

export function validateBrandedSetPasswordLink(value, document) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || Buffer.byteLength(value, "utf8") > MAX_LINK_BYTES
    || /[\r\n\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte Linkdatei enthaelt keinen gueltigen Einladungslink."
    );
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte Linkdatei enthaelt keinen gueltigen Einladungslink."
    );
  }
  const parameterNames = [...parsed.searchParams.keys()];
  const exactParameters =
    parameterNames.length === ALLOWED_ACTION_PARAMETERS.size
    && parameterNames.every((name) =>
      ALLOWED_ACTION_PARAMETERS.has(name)
      && parsed.searchParams.getAll(name).length === 1
    );
  if (
    parsed.origin !== PASSWORD_ACTION_ORIGIN
    || parsed.pathname !== PASSWORD_ACTION_PATH
    || parsed.username
    || parsed.password
    || parsed.hash
    || parsed.href !== value
    || !exactParameters
    || parsed.searchParams.get("mode") !== "resetPassword"
    || !API_KEY_PATTERN.test(parsed.searchParams.get("apiKey") || "")
    || !ACTION_CODE_PATTERN.test(parsed.searchParams.get("oobCode") || "")
    || parsed.searchParams.get("continueUrl") !== EXPECTED_CONTINUE_URL
    || parsed.searchParams.get("lang") !== "de"
    || document.continue_url !== EXPECTED_CONTINUE_URL
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der Einladungslink ist nicht exakt auf den gebrandeten Passwort-Flow gepinnt."
    );
  }
  return parsed.href;
}

export async function loadProtectedBrandedSetPasswordLink(
  linkPath,
  { repository = repositoryRoot() } = {}
) {
  const resolved = await assertOwnerOnlyRegularFile(
    linkPath,
    "Die geschuetzte Linkdatei",
    MAX_LINK_BYTES,
    repository
  );
  const raw = await fs.readFile(resolved, "utf8");
  if (raw !== `${raw.trim()}\n`) {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte Linkdatei muss exakt eine abgeschlossene URL-Zeile enthalten."
    );
  }
  return raw.trim();
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPilotEnd(value) {
  if (value !== EXPECTED_PILOT_END) {
    throw new IdentityPlatformOnboardingError(
      `--pilot-end muss exakt ${EXPECTED_PILOT_END} sein.`
    );
  }
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin"
  }).format(new Date(value)) + " Uhr";
}

function assertTemplateContract(template, kind) {
  if (
    typeof template !== "string"
    || template.length === 0
    || Buffer.byteLength(template, "utf8") > MAX_TEMPLATE_BYTES
  ) {
    throw new IdentityPlatformOnboardingError(
      `Die versionierte ${kind}-Mailvorlage ist leer oder zu gross.`
    );
  }
  const actualPlaceholders = [...template.matchAll(/\{\{([A-Z_]+)\}\}/gu)]
    .map((match) => match[1]);
  const unique = [...new Set(actualPlaceholders)].sort();
  if (
    unique.length !== REQUIRED_PLACEHOLDERS.length
    || unique.some((name, index) => name !== [...REQUIRED_PLACEHOLDERS].sort()[index])
  ) {
    throw new IdentityPlatformOnboardingError(
      `Die versionierte ${kind}-Mailvorlage besitzt unerwartete Platzhalter.`
    );
  }
  const actionCount = actualPlaceholders.filter((name) => name === "ACTION_URL").length;
  if (actionCount !== (kind === "HTML" ? 2 : 1)) {
    throw new IdentityPlatformOnboardingError(
      `Die ${kind}-Mailvorlage besitzt nicht die freigegebene CTA-/Fallback-Struktur.`
    );
  }
}

function renderTemplate(template, values, { html = false } = {}) {
  let rendered = template;
  for (const name of REQUIRED_PLACEHOLDERS) {
    const raw = values[name];
    const replacement = html ? htmlEscape(raw) : raw;
    rendered = rendered.replaceAll(`{{${name}}}`, replacement);
  }
  if (/\{\{[A-Z_]+\}\}/u.test(rendered) || rendered.trim() === "") {
    throw new IdentityPlatformOnboardingError(
      "Die Willkommensmail konnte nicht vollstaendig gerendert werden."
    );
  }
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

function assertRenderedMailContract(text, html, actionUrl) {
  const combined = `${text}\n${html}`.toLowerCase();
  for (const forbidden of [
    "firebase",
    "steam-capsule",
    "identity platform",
    "google cloud",
    "tracking",
    "<script",
    "<form",
    "<img",
    "http://"
  ]) {
    if (combined.includes(forbidden)) {
      throw new IdentityPlatformOnboardingError(
        "Die gerenderte Willkommensmail enthaelt nicht freigegebene Technik oder aktive Inhalte."
      );
    }
  }
  const anchorMatches = [...html.matchAll(/<a\s+href="([^"]+)"/gu)];
  if (
    anchorMatches.length !== 1
    || anchorMatches[0][1] !== htmlEscape(actionUrl)
    || text.split(actionUrl).length - 1 !== 1
    || html.split(htmlEscape(actionUrl)).length - 1 !== 2
  ) {
    throw new IdentityPlatformOnboardingError(
      "CTA und sichtbare Fallback-Adresse entsprechen nicht dem freigegebenen Mailvertrag."
    );
  }
  const remoteUrls = [...html.matchAll(/https?:\/\/[^"<\s]+/gu)]
    .map((match) => match[0].replaceAll("&amp;", "&"));
  if (
    remoteUrls.length !== 2
    || remoteUrls.some((url) => url !== actionUrl)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die HTML-Mail enthaelt einen fremden Remote-Ursprung oder Tracker."
    );
  }
}

function encodedHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function crlf(value) {
  return value.replace(/\r?\n/gu, "\r\n");
}

function renderEml({ recipient, senderName, senderEmail, subject, text, html }) {
  const boundary = "vk-pre-gematik-welcome-boundary-v1";
  return crlf([
    `From: ${encodedHeader(senderName)} <${senderEmail}>`,
    `To: <${recipient}>`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "X-Versorgungs-Kompass-Template: pre-gematik-guest-welcome-v1",
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text.trimEnd(),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html.trimEnd(),
    `--${boundary}--`,
    ""
  ].join("\n"));
}

export async function renderGuestWelcomeEmail({
  document,
  actionUrl,
  senderName,
  senderEmail,
  pilotEnd = EXPECTED_PILOT_END,
  textTemplate,
  htmlTemplate
}) {
  const safeSenderName = safeText(senderName, "--sender-name", 128);
  const safeSenderEmail = safeText(
    senderEmail,
    "--sender-email",
    256,
    EMAIL_PATTERN
  ).toLowerCase();
  if (safeSenderEmail !== senderEmail) {
    throw new IdentityPlatformOnboardingError(
      "--sender-email muss bereits kanonisch kleingeschrieben sein."
    );
  }
  const brandedActionUrl = validateBrandedSetPasswordLink(actionUrl, document);
  assertTemplateContract(textTemplate, "Text");
  assertTemplateContract(htmlTemplate, "HTML");
  const values = Object.freeze({
    ACTION_URL: brandedActionUrl,
    DISPLAY_NAME: document.display_name,
    PILOT_END: formatPilotEnd(pilotEnd),
    RECIPIENT_EMAIL: document.email,
    SENDER_EMAIL: safeSenderEmail,
    SENDER_NAME: safeSenderName
  });
  const text = renderTemplate(textTemplate, values);
  const html = renderTemplate(htmlTemplate, values, { html: true });
  assertRenderedMailContract(text, html, brandedActionUrl);
  const eml = renderEml({
    recipient: document.email,
    senderName: safeSenderName,
    senderEmail: safeSenderEmail,
    subject: WELCOME_EMAIL_SUBJECT,
    text,
    html
  });
  return Object.freeze({
    subject: `${WELCOME_EMAIL_SUBJECT}\n`,
    text,
    html,
    eml
  });
}

async function loadTemplates() {
  const [textTemplate, htmlTemplate] = await Promise.all([
    fs.readFile(TEXT_TEMPLATE, "utf8"),
    fs.readFile(HTML_TEMPLATE, "utf8")
  ]);
  return Object.freeze({ textTemplate, htmlTemplate });
}

async function protectedCreateOnlyOutputDirectory(outputDirectory, repository) {
  if (!path.isAbsolute(String(outputDirectory || ""))) {
    throw new IdentityPlatformOnboardingError(
      "--output-dir muss ein absoluter geschuetzter Verzeichnispfad sein."
    );
  }
  const requested = path.resolve(outputDirectory);
  const parent = path.dirname(requested);
  const resolvedRepository = await fs.realpath(repository);
  let parentMetadata;
  try {
    const parentLinkMetadata = await fs.lstat(parent);
    if (parentLinkMetadata.isSymbolicLink()) throw new Error("symlink");
    const resolvedParent = await fs.realpath(parent);
    parentMetadata = await fs.stat(resolvedParent);
    const currentUid =
      typeof process.getuid === "function" ? process.getuid() : parentMetadata.uid;
    if (
      !parentMetadata.isDirectory()
      || parentMetadata.uid !== currentUid
      || (process.platform !== "win32" && (parentMetadata.mode & 0o077) !== 0)
      || insideDirectory(resolvedParent, resolvedRepository)
    ) {
      throw new Error("unsafe");
    }
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Das Elternverzeichnis fuer --output-dir muss owner-only und ausserhalb "
      + "des Git-Worktrees liegen."
    );
  }
  try {
    await fs.lstat(requested);
    throw new IdentityPlatformOnboardingError(
      "--output-dir existiert bereits; nichts wurde ueberschrieben."
    );
  } catch (error) {
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    if (error?.code !== "ENOENT") {
      throw new IdentityPlatformOnboardingError(
        "--output-dir konnte nicht create-only geprueft werden."
      );
    }
  }
  await fs.mkdir(requested, { mode: 0o700 });
  await fs.chmod(requested, 0o700);
  return requested;
}

async function writeProtectedMailBundle(outputDirectory, rendered) {
  const files = Object.freeze({
    "subject.txt": rendered.subject,
    "body.txt": rendered.text,
    "body.html": rendered.html,
    "welcome.eml": rendered.eml
  });
  for (const [name, contents] of Object.entries(files)) {
    if (typeof contents !== "string" || contents.trim() === "") {
      throw new IdentityPlatformOnboardingError(
        "Eine Ausgabe der Willkommensmail waere leer."
      );
    }
    const handle = await fs.open(
      path.join(outputDirectory, name),
      "wx",
      0o600
    );
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new IdentityPlatformOnboardingError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseWelcomeEmailArguments(argv) {
  const options = {
    help: false,
    apply: false,
    input: "",
    linkFile: "",
    outputDirectory: "",
    senderName: "",
    senderEmail: "",
    pilotEnd: "",
    confirmOperation: "",
    confirmFingerprint: ""
  };
  const valueOptions = new Map([
    ["--input", "input"],
    ["--link-file", "linkFile"],
    ["--output-dir", "outputDirectory"],
    ["--sender-name", "senderName"],
    ["--sender-email", "senderEmail"],
    ["--pilot-end", "pilotEnd"],
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

function validateWelcomeEmailArguments(options, fingerprint) {
  for (const required of [
    "input",
    "linkFile",
    "senderName",
    "senderEmail",
    "pilotEnd"
  ]) {
    if (!options[required]) {
      throw new IdentityPlatformOnboardingError(
        "Eingabe-, Link-, Absender- oder Ablaufangaben fehlen."
      );
    }
  }
  if (!options.apply) {
    if (
      options.outputDirectory
      || options.confirmOperation
      || options.confirmFingerprint
    ) {
      throw new IdentityPlatformOnboardingError(
        "Output und Apply-Bestaetigungen sind nur zusammen mit --apply erlaubt."
      );
    }
    return;
  }
  if (
    !options.outputDirectory
    || options.confirmOperation !== WELCOME_EMAIL_OPERATION
    || options.confirmFingerprint !== fingerprint
    || !FINGERPRINT_PATTERN.test(options.confirmFingerprint)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Apply-Bestaetigungen fuer Mail-Operation, Fingerprint oder Output fehlen."
    );
  }
}

function safeSummary({ apply, fingerprint, outputCreated = false }) {
  return [
    "schema_version=1",
    `operation=${WELCOME_EMAIL_OPERATION}`,
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    `mail_bundle_created=${outputCreated}`,
    `input_fingerprint=${fingerprint}`
  ].join("\n");
}

export async function executeWelcomeEmailRendering({
  document,
  actionUrl,
  options,
  repository = repositoryRoot(),
  templates,
  log = console.log
}) {
  const fingerprint = identityPlatformAccountFingerprint(document);
  validateWelcomeEmailArguments(options, fingerprint);
  const rendered = await renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: options.senderName,
    senderEmail: options.senderEmail,
    pilotEnd: options.pilotEnd,
    ...templates
  });
  if (!options.apply) {
    log(safeSummary({ apply: false, fingerprint }));
    return Object.freeze({ applied: false, outputCreated: false, rendered });
  }

  let outputDirectory = "";
  try {
    outputDirectory = await protectedCreateOnlyOutputDirectory(
      options.outputDirectory,
      repository
    );
    await writeProtectedMailBundle(outputDirectory, rendered);
    log(safeSummary({ apply: true, fingerprint, outputCreated: true }));
    return Object.freeze({ applied: true, outputCreated: true });
  } catch (error) {
    if (outputDirectory) {
      await fs.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
    }
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Willkommensmail-Paket konnte nicht sicher erstellt werden."
    );
  }
}

export function usage() {
  return `Gebrandete Willkommensmail fuer einen pre-gematik Passwort-Gast

Preview:
  node scripts/render_pre_gematik_guest_welcome_email.mjs \\
    --input /absolut/owner-only/account.json \\
    --link-file /absolut/owner-only/set-password-link.txt \\
    --sender-name "Versorgungs-Kompass Team" \\
    --sender-email owner@example.invalid \\
    --pilot-end ${EXPECTED_PILOT_END}

Create-only Mailpaket:
  zusaetzlich --output-dir /absolut/owner-only/welcome-mail \\
    --apply \\
    --confirm-operation ${WELCOME_EMAIL_OPERATION} \\
    --confirm-fingerprint sha256:<preview-fingerprint>

Das Paket enthaelt subject.txt, body.txt, body.html und welcome.eml. Keine
Empfaengeradresse und kein Einmal-Link werden auf stdout ausgegeben.`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseWelcomeEmailArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const repository = repositoryRoot();
  const document = await loadProtectedIdentityPlatformAccountDocument(
    options.input,
    { repository }
  );
  const rawActionUrl = await loadProtectedBrandedSetPasswordLink(
    options.linkFile,
    { repository }
  );
  const actionUrl = validateBrandedSetPasswordLink(rawActionUrl, document);
  await executeWelcomeEmailRendering({
    document,
    actionUrl,
    options,
    repository,
    templates: await loadTemplates()
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof IdentityPlatformOnboardingError
      ? error.message
      : "Der Willkommensmail-Renderer ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode =
      error instanceof IdentityPlatformOnboardingError ? error.exitCode : 1;
  });
}
