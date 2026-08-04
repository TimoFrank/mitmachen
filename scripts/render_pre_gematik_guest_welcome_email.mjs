#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  identityPlatformAccountFingerprint,
  loadProtectedIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  PASSWORD_INVITATION_ORIGIN,
  PASSWORD_INVITATION_PATH,
  validatePasswordInvitationLink
} from "./provision_pre_gematik_password_invitation.mjs";

export const WELCOME_EMAIL_OPERATION = "RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL";
export const WELCOME_EMAIL_SUBJECT =
  "#Mitmachen: Dein Testzugang zum Versorgungs-Kompass";
export const WELCOME_EMAIL_SENDER_NAME = "#Mitmachen";
export const WELCOME_EMAIL_SENDER_EMAIL = "zugang@versorgungs-kompass.de";
export const EXPECTED_PILOT_END = "2026-09-30T16:00:00Z";
export const PASSWORD_ACTION_ORIGIN = PASSWORD_INVITATION_ORIGIN;
export const PASSWORD_ACTION_PATH = PASSWORD_INVITATION_PATH;

const MAX_LINK_BYTES = 16 * 1024;
const MAX_TEMPLATE_BYTES = 256 * 1024;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const TEMPLATE_DIRECTORY = new URL("../config/pre-gematik/email/", import.meta.url);
const TEXT_TEMPLATE = new URL(
  "pre-gematik-guest-welcome.txt",
  TEMPLATE_DIRECTORY
);
const HTML_TEMPLATE = new URL(
  "pre-gematik-guest-welcome.html",
  TEMPLATE_DIRECTORY
);
const COMMON_REQUIRED_PLACEHOLDERS = Object.freeze([
  "ACTION_URL",
  "DISPLAY_NAME",
  "PILOT_END",
  "RECIPIENT_EMAIL",
  "SENDER_EMAIL",
  "SENDER_NAME"
]);
const HTML_ONLY_PLACEHOLDERS = Object.freeze([
  "FORMATE_MARK_CID",
  "HOSPITATION_MARK_CID",
  "STAKEHOLDER_MARK_CID",
  "VERSORGUNG_MARK_CID"
]);
const ALL_PLACEHOLDERS = Object.freeze([
  ...COMMON_REQUIRED_PLACEHOLDERS,
  ...HTML_ONLY_PLACEHOLDERS
]);
const MAX_BRAND_ASSET_BYTES = 32 * 1024;
const MAX_TOTAL_BRAND_ASSET_BYTES = 128 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const WELCOME_EMAIL_RELATED_BOUNDARY =
  "vk-pre-gematik-welcome-related-v4";
export const WELCOME_EMAIL_ALTERNATIVE_BOUNDARY =
  "vk-pre-gematik-welcome-alternative-v4";
export const WELCOME_EMAIL_BRAND_ASSET_SPECS = Object.freeze([
  Object.freeze({
    key: "versorgung",
    label: "Versorgung",
    placeholder: "VERSORGUNG_MARK_CID",
    filename: "versorgungs-kompass-mark-on-dark.png",
    cidPrefix: "vk-compass-versorgung",
    pngUrl: new URL(
      "../config/pre-gematik/email/assets/versorgungs-kompass-mark-on-dark.png",
      import.meta.url
    ),
    sourceUrl: new URL(
      "../public/brand/versorgungs-kompass/mark-on-dark.svg",
      import.meta.url
    ),
    pngSha256: "1146b89160f29abc13080e11975dcccd4b4e1183c4268d097d1eeb987106e84e",
    sourceSha256: "0d44d04fae06efc224b58c6be5cc7abb7218abfedd5c6a7f729babd7848628dc"
  }),
  Object.freeze({
    key: "stakeholder",
    label: "Stakeholder",
    placeholder: "STAKEHOLDER_MARK_CID",
    filename: "stakeholder-mark-on-dark.png",
    cidPrefix: "vk-compass-stakeholder",
    pngUrl: new URL(
      "../config/pre-gematik/email/assets/stakeholder-mark-on-dark.png",
      import.meta.url
    ),
    sourceUrl: new URL(
      "../public/brand/modules/stakeholder/mark-on-dark.svg",
      import.meta.url
    ),
    pngSha256: "5f5d3b0080b6c0da644f2317d221d3c359f0ae1d54bbf89073dc1dfc865ef863",
    sourceSha256: "6ad4b0dc67af74a6be1d1d5c412e1b2039dd014e2fef8dcc0f16f44adadb4001"
  }),
  Object.freeze({
    key: "hospitation",
    label: "Hospitation",
    placeholder: "HOSPITATION_MARK_CID",
    filename: "hospitation-mark-on-dark.png",
    cidPrefix: "vk-compass-hospitation",
    pngUrl: new URL(
      "../config/pre-gematik/email/assets/hospitation-mark-on-dark.png",
      import.meta.url
    ),
    sourceUrl: new URL(
      "../public/brand/modules/hospitation/mark-on-dark.svg",
      import.meta.url
    ),
    pngSha256: "9159b312cf94fdb0dc510ca79c32afb98ee3e4664a467693a31d6fea67527b42",
    sourceSha256: "ac1ec9da833f3f40a6e8cdc7a5a820b267279ff121fa04a204f6419becd6817d"
  }),
  Object.freeze({
    key: "formate",
    label: "Formate",
    placeholder: "FORMATE_MARK_CID",
    filename: "formate-mark-on-dark.png",
    cidPrefix: "vk-compass-formate",
    pngUrl: new URL(
      "../config/pre-gematik/email/assets/formate-mark-on-dark.png",
      import.meta.url
    ),
    sourceUrl: new URL(
      "../public/brand/modules/formate/mark-on-dark.svg",
      import.meta.url
    ),
    pngSha256: "47971e1f7804a23be8763d4e1ed179a819ed094d1083f35f690a8a53ea857138",
    sourceSha256: "bf8c72c1a11dca3aea91fb21d2abefc0b2ffec8bfa5f9c8dc6c88e558118e2a1"
  })
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
  if (Buffer.byteLength(String(value || ""), "utf8") > MAX_LINK_BYTES) {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte Linkdatei enthaelt keinen gueltigen Einladungslink."
    );
  }
  const invitation = validatePasswordInvitationLink(value);
  if (document.continue_url !== EXPECTED_CONTINUE_URL) {
    throw new IdentityPlatformOnboardingError(
      "Der Einladungslink ist nicht exakt auf den gebrandeten 48-Stunden-Flow gepinnt."
    );
  }
  return invitation.href;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readPinnedVersionedFile(fileUrl, expectedSha256, label) {
  const filePath = fileURLToPath(fileUrl);
  let metadata;
  try {
    metadata = await fs.lstat(filePath);
  } catch {
    throw new IdentityPlatformOnboardingError(
      `Das versionierte ${label} fehlt.`
    );
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isFile()
    || metadata.size === 0
    || metadata.size > MAX_BRAND_ASSET_BYTES
  ) {
    throw new IdentityPlatformOnboardingError(
      `Das versionierte ${label} ist ungueltig.`
    );
  }
  const contents = await fs.readFile(filePath);
  if (sha256(contents) !== expectedSha256) {
    throw new IdentityPlatformOnboardingError(
      `Das versionierte ${label} stimmt nicht mit dem Markenvertrag ueberein.`
    );
  }
  return contents;
}

function assertCanonicalBrandPng(contents, label) {
  if (
    !Buffer.isBuffer(contents)
    || contents.length < 33
    || !contents.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || contents.subarray(12, 16).toString("ascii") !== "IHDR"
    || contents.readUInt32BE(16) !== 72
    || contents.readUInt32BE(20) !== 72
    || contents[24] !== 8
    || contents[25] !== 6
  ) {
    throw new IdentityPlatformOnboardingError(
      `Das versionierte ${label} ist kein freigegebenes transparentes 72x72-PNG.`
    );
  }
}

function deriveWelcomeEmailCidToken(document, actionUrl) {
  const digest = createHash("sha256");
  digest.update("versorgungs-kompass-pre-gematik-welcome-cid-v4\0", "utf8");
  digest.update(identityPlatformAccountFingerprint(document), "utf8");
  digest.update("\0", "utf8");
  digest.update(actionUrl, "utf8");
  return digest.digest("hex").slice(0, 24);
}

export function welcomeEmailRootContentId(cidToken) {
  if (!/^[a-f0-9]{24}$/u.test(String(cidToken || ""))) {
    throw new IdentityPlatformOnboardingError(
      "Die Content-ID der Willkommensmail ist ungueltig."
    );
  }
  return `vk-welcome.${cidToken}@versorgungs-kompass.de`;
}

export async function loadWelcomeEmailBrandAssets(cidToken) {
  welcomeEmailRootContentId(cidToken);
  const assets = await Promise.all(
    WELCOME_EMAIL_BRAND_ASSET_SPECS.map(async (spec) => {
      const [png, source] = await Promise.all([
        readPinnedVersionedFile(
          spec.pngUrl,
          spec.pngSha256,
          `${spec.label}-Mail-Signet`
        ),
        readPinnedVersionedFile(
          spec.sourceUrl,
          spec.sourceSha256,
          `${spec.label}-Quellsignet`
        )
      ]);
      assertCanonicalBrandPng(png, `${spec.label}-Mail-Signet`);
      if (!source.includes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"', "utf8"))) {
        throw new IdentityPlatformOnboardingError(
          `Das versionierte ${spec.label}-Quellsignet ist ungueltig.`
        );
      }
      return Object.freeze({
        ...spec,
        contentId: `${spec.cidPrefix}.${cidToken}@versorgungs-kompass.de`,
        bytes: Buffer.from(png)
      });
    })
  );
  if (
    assets.reduce((total, asset) => total + asset.bytes.length, 0)
    > MAX_TOTAL_BRAND_ASSET_BYTES
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die eingebetteten Mail-Signets sind insgesamt zu gross."
    );
  }
  return Object.freeze(assets);
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
  const requiredPlaceholders = kind === "HTML"
    ? ALL_PLACEHOLDERS
    : COMMON_REQUIRED_PLACEHOLDERS;
  if (
    unique.length !== requiredPlaceholders.length
    || unique.some(
      (name, index) => name !== [...requiredPlaceholders].sort()[index]
    )
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
  for (const name of ALL_PLACEHOLDERS) {
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

export function validateWelcomeEmailBrandMarkup(html, brandAssets) {
  if (
    typeof html !== "string"
    || !Array.isArray(brandAssets)
    || brandAssets.length !== WELCOME_EMAIL_BRAND_ASSET_SPECS.length
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die Willkommensmail besitzt keinen eindeutigen Signetvertrag."
    );
  }
  const imageTags = [...html.matchAll(/<img\b[^>]*>/giu)]
    .map((match) => match[0]);
  const expectedTags = brandAssets.map((asset) =>
    `<img src="cid:${asset.contentId}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;">`
  );
  const cidReferences = [...html.matchAll(/cid:([^"'<>\s]+)/giu)]
    .map((match) => match[1]);
  if (
    imageTags.length !== expectedTags.length
    || imageTags.some((tag, index) => tag !== expectedTags[index])
    || cidReferences.length !== brandAssets.length
    || cidReferences.some(
      (contentId, index) => contentId !== brandAssets[index].contentId
    )
    || new Set(cidReferences).size !== brandAssets.length
    || /<\/img\s*>|\bsrcset\s*=/iu.test(html)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die Willkommensmail besitzt nicht exakt die vier freigegebenen eingebetteten Signets."
    );
  }
}

function assertRenderedMailContract(text, html, actionUrl, brandAssets) {
  const combined = `${text}\n${html}`.toLowerCase();
  if (/cid:/iu.test(text)) {
    throw new IdentityPlatformOnboardingError(
      "Die Text-Mail darf keine eingebetteten Content-IDs enthalten."
    );
  }
  for (const forbidden of [
    "firebase",
    "steam-capsule",
    "identity platform",
    "google cloud",
    "tracking",
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
    if (combined.includes(forbidden)) {
      throw new IdentityPlatformOnboardingError(
        "Die gerenderte Willkommensmail enthaelt nicht freigegebene Technik oder aktive Inhalte."
      );
    }
  }
  validateWelcomeEmailBrandMarkup(html, brandAssets);
  if (/\son[a-z]+\s*=|url\s*\(/iu.test(combined)) {
    throw new IdentityPlatformOnboardingError(
      "Die gerenderte Willkommensmail enthaelt nicht freigegebene Technik oder aktive Inhalte."
    );
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

function mimeBase64(value) {
  return (Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"))
    .toString("base64")
    .match(/.{1,76}/gu)
    .join("\n");
}

function renderEml({
  recipient,
  senderName,
  senderEmail,
  subject,
  text,
  html,
  rootContentId,
  brandAssets
}) {
  const lines = [
    `From: ${encodedHeader(senderName)} <${senderEmail}>`,
    `Reply-To: <${senderEmail}>`,
    `To: <${recipient}>`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${WELCOME_EMAIL_RELATED_BOUNDARY}"; type="multipart/alternative"; start="<${rootContentId}>"`,
    "X-Versorgungs-Kompass-Template: pre-gematik-guest-welcome-v4",
    "",
    `--${WELCOME_EMAIL_RELATED_BOUNDARY}`,
    `Content-Type: multipart/alternative; boundary="${WELCOME_EMAIL_ALTERNATIVE_BOUNDARY}"`,
    `Content-ID: <${rootContentId}>`,
    "",
    `--${WELCOME_EMAIL_ALTERNATIVE_BOUNDARY}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    mimeBase64(text),
    `--${WELCOME_EMAIL_ALTERNATIVE_BOUNDARY}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    mimeBase64(html),
    `--${WELCOME_EMAIL_ALTERNATIVE_BOUNDARY}--`
  ];
  for (const asset of brandAssets) {
    lines.push(
      `--${WELCOME_EMAIL_RELATED_BOUNDARY}`,
      `Content-Type: image/png; name="${asset.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${asset.contentId}>`,
      `Content-Disposition: inline; filename="${asset.filename}"`,
      "",
      mimeBase64(asset.bytes)
    );
  }
  lines.push(`--${WELCOME_EMAIL_RELATED_BOUNDARY}--`, "");
  return crlf(lines.join("\n"));
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
  if (
    safeSenderName !== WELCOME_EMAIL_SENDER_NAME
    || safeSenderEmail !== WELCOME_EMAIL_SENDER_EMAIL
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die Willkommensmail muss den freigegebenen #Mitmachen-Absender verwenden."
    );
  }
  const brandedActionUrl = validateBrandedSetPasswordLink(actionUrl, document);
  const cidToken = deriveWelcomeEmailCidToken(document, brandedActionUrl);
  const brandAssets = await loadWelcomeEmailBrandAssets(cidToken);
  const rootContentId = welcomeEmailRootContentId(cidToken);
  assertTemplateContract(textTemplate, "Text");
  assertTemplateContract(htmlTemplate, "HTML");
  const values = {
    ACTION_URL: brandedActionUrl,
    DISPLAY_NAME: document.display_name,
    PILOT_END: formatPilotEnd(pilotEnd),
    RECIPIENT_EMAIL: document.email,
    SENDER_EMAIL: safeSenderEmail,
    SENDER_NAME: safeSenderName
  };
  for (const asset of brandAssets) {
    values[asset.placeholder] = asset.contentId;
  }
  Object.freeze(values);
  const text = renderTemplate(textTemplate, values);
  const html = renderTemplate(htmlTemplate, values, { html: true });
  assertRenderedMailContract(text, html, brandedActionUrl, brandAssets);
  const eml = renderEml({
    recipient: document.email,
    senderName: safeSenderName,
    senderEmail: safeSenderEmail,
    subject: WELCOME_EMAIL_SUBJECT,
    text,
    html,
    rootContentId,
    brandAssets
  });
  return Object.freeze({
    subject: `${WELCOME_EMAIL_SUBJECT}\n`,
    text,
    html,
    eml
  });
}

export async function loadWelcomeEmailTemplates() {
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

export function welcomeEmailRenderingFingerprint(rendered) {
  if (
    !rendered
    || typeof rendered !== "object"
    || typeof rendered.eml !== "string"
    || rendered.eml.length === 0
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der Mail-Renderer-Fingerprint kann nicht sicher gebildet werden."
    );
  }
  const digest = createHash("sha256");
  digest.update("versorgungs-kompass-pre-gematik-welcome-rendering-v1\0", "utf8");
  digest.update(rendered.eml, "utf8");
  return `sha256:${digest.digest("hex")}`;
}

export async function executeWelcomeEmailRendering({
  document,
  actionUrl,
  options,
  repository = repositoryRoot(),
  templates,
  log = console.log
}) {
  const rendered = await renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: options.senderName,
    senderEmail: options.senderEmail,
    pilotEnd: options.pilotEnd,
    ...templates
  });
  const fingerprint = welcomeEmailRenderingFingerprint(rendered);
  validateWelcomeEmailArguments(options, fingerprint);
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
    --sender-name "${WELCOME_EMAIL_SENDER_NAME}" \\
    --sender-email ${WELCOME_EMAIL_SENDER_EMAIL} \\
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
    templates: await loadWelcomeEmailTemplates()
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
