import { createHash } from "node:crypto";
import fs from "node:fs/promises";

import nodemailer from "nodemailer";

export const PASSWORD_RESET_EMAIL_SMTP_HOST = "w01abca0.kasserver.com";
export const PASSWORD_RESET_EMAIL_SMTP_PORT = 465;
export const PASSWORD_RESET_EMAIL_SENDER_EMAIL = "zugang@versorgungs-kompass.de";
export const PASSWORD_RESET_EMAIL_SENDER_NAME = "#Mitmachen";
export const PASSWORD_RESET_EMAIL_SUBJECT = "#Mitmachen: Passwort zurücksetzen";
export const PASSWORD_RESET_EMAIL_TEMPLATE_ID = "pre-gematik-password-reset-v2";

const PASSWORD_RESET_ACTION_ORIGIN = "https://versorgungs-kompass.de";
const PASSWORD_RESET_ACTION_PATH = "/konto/passwort-festlegen";
const PASSWORD_RESET_CONTINUE_URL = "https://versorgungs-kompass.de/start";
const PASSWORD_RESET_ACTION_PARAMETERS = Object.freeze([
  "mode",
  "oobCode",
  "apiKey",
  "continueUrl",
  "lang"
]);
const MAX_ACTION_URL_BYTES = 4 * 1024;
const MAX_TEMPLATE_BYTES = 64 * 1024;
const MAX_RENDERED_PART_BYTES = 128 * 1024;
const MAX_ASSET_BYTES = 32 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const HIDDEN_EMAIL_CONTENT_PATTERN =
  /(?:display\s*:\s*none|visibility\s*:\s*hidden|max-height\s*:\s*0|color\s*:\s*transparent|mso-hide\s*:\s*all|opacity\s*:\s*0(?:\.0+)?(?=\s*(?:[;'"!]|$))|<[^>]*\shidden(?=[\s=>/])|(?:left|right|top|bottom|text-indent)\s*:\s*-\s*(?:999|[1-9]\d{3,})(?:px|em|rem)|&(?:zwnj|zwj|lrm|rlm|zerowidthspace|nobreak|applyfunction|invisibletimes|invisiblecomma);|&#0*(?:847|1564|6158|820[3-7]|823[4-8]|828[89]|829\d|830[0-3]|65279);|&#x0*(?:34f|61c|180e|200[b-f]|202[a-e]|206[0-9a-f]|feff);|[\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff])/iu;
const TEMPLATE_DIRECTORY = new URL(
  "../config/pre-gematik/email/",
  import.meta.url
);
const HTML_TEMPLATE_URL = new URL(
  "pre-gematik-password-reset.html",
  TEMPLATE_DIRECTORY
);
const TEXT_TEMPLATE_URL = new URL(
  "pre-gematik-password-reset.txt",
  TEMPLATE_DIRECTORY
);

export const PASSWORD_RESET_EMAIL_BRAND_ASSETS = Object.freeze([
  Object.freeze({
    key: "versorgung",
    filename: "versorgungs-kompass-mark-on-dark.png",
    cid: "vk-password-reset-versorgung@versorgungs-kompass.de",
    placeholder: "VERSORGUNG_MARK_CID",
    sha256: "1146b89160f29abc13080e11975dcccd4b4e1183c4268d097d1eeb987106e84e",
    url: new URL("assets/versorgungs-kompass-mark-on-dark.png", TEMPLATE_DIRECTORY)
  }),
  Object.freeze({
    key: "stakeholder",
    filename: "stakeholder-mark-on-dark.png",
    cid: "vk-password-reset-stakeholder@versorgungs-kompass.de",
    placeholder: "STAKEHOLDER_MARK_CID",
    sha256: "5f5d3b0080b6c0da644f2317d221d3c359f0ae1d54bbf89073dc1dfc865ef863",
    url: new URL("assets/stakeholder-mark-on-dark.png", TEMPLATE_DIRECTORY)
  }),
  Object.freeze({
    key: "hospitation",
    filename: "hospitation-mark-on-dark.png",
    cid: "vk-password-reset-hospitation@versorgungs-kompass.de",
    placeholder: "HOSPITATION_MARK_CID",
    sha256: "9159b312cf94fdb0dc510ca79c32afb98ee3e4664a467693a31d6fea67527b42",
    url: new URL("assets/hospitation-mark-on-dark.png", TEMPLATE_DIRECTORY)
  }),
  Object.freeze({
    key: "formate",
    filename: "formate-mark-on-dark.png",
    cid: "vk-password-reset-formate@versorgungs-kompass.de",
    placeholder: "FORMATE_MARK_CID",
    sha256: "47971e1f7804a23be8763d4e1ed179a819ed094d1083f35f690a8a53ea857138",
    url: new URL("assets/formate-mark-on-dark.png", TEMPLATE_DIRECTORY)
  })
]);

export const PASSWORD_RESET_EMAIL_ACCEPTED_RESPONSE = Object.freeze({
  accepted: true
});

export class PasswordResetEmailDeliveryError extends Error {
  constructor() {
    super("Die Passwort-Reset-E-Mail konnte nicht zugestellt werden.");
    this.name = "PasswordResetEmailDeliveryError";
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function countOccurrences(value, fragment) {
  return value.split(fragment).length - 1;
}

function assertExactPlaceholders(template, expectedCounts, label) {
  const placeholders = [...template.matchAll(/\{\{([^{}]+)\}\}/gu)]
    .map((match) => match[1]);
  const expectedNames = Object.keys(expectedCounts).sort();
  const actualNames = [...new Set(placeholders)].sort();
  if (
    actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
    || expectedNames.some(
      (name) => countOccurrences(template, `{{${name}}}`) !== expectedCounts[name]
    )
  ) {
    throw new Error(`Das ${label} besitzt nicht den freigegebenen Platzhaltervertrag.`);
  }
}

function assertTemplateText(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || Buffer.byteLength(value, "utf8") > MAX_TEMPLATE_BYTES
    || !value.endsWith("\n")
    || value.includes("\r")
    || /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Das ${label} ist nicht kanonisch.`);
  }
  return value;
}

function validateHtmlTemplate(value) {
  const template = assertTemplateText(value, "Passwort-Reset-HTML-Template");
  assertExactPlaceholders(template, {
    ACTION_URL: 3,
    FORMATE_MARK_CID: 1,
    HOSPITATION_MARK_CID: 1,
    STAKEHOLDER_MARK_CID: 1,
    VERSORGUNG_MARK_CID: 1
  }, "Passwort-Reset-HTML-Template");
  const hrefs = [...template.matchAll(/\bhref="([^"]*)"/giu)]
    .map((match) => match[1]);
  const sources = [...template.matchAll(/\bsrc="([^"]*)"/giu)]
    .map((match) => match[1]);
  const expectedSources = PASSWORD_RESET_EMAIL_BRAND_ASSETS
    .map((asset) => `cid:{{${asset.placeholder}}}`);
  if (
    !template.startsWith("<!doctype html>\n<html lang=\"de\">")
    || !template.includes("@media only screen and (max-width:480px)")
    || !template.includes("background:#062f75")
    || !template.includes("border-left:5px solid #00d95a")
    || !template.includes(">Neues Passwort festlegen</a>")
    || hrefs.length !== 2
    || hrefs.some((href) => href !== "{{ACTION_URL}}")
    || sources.length !== expectedSources.length
    || sources.some((source, index) => source !== expectedSources[index])
    || HIDDEN_EMAIL_CONTENT_PATTERN.test(template)
    || /<(?:script|iframe|object|embed|form|input|button|video|audio|svg|link|base)\b/iu.test(template)
    || /(?:https?:|\/\/|javascript:|data:|url\s*\()/iu.test(template)
    || /\b(?:width|height)="1"/iu.test(template)
  ) {
    throw new Error("Das Passwort-Reset-HTML-Template enthält nicht freigegebene Inhalte.");
  }
  return template;
}

function validateTextTemplate(value) {
  const template = assertTemplateText(value, "Passwort-Reset-Text-Template");
  assertExactPlaceholders(template, { ACTION_URL: 1 }, "Passwort-Reset-Text-Template");
  if (
    !template.startsWith("#Mitmachen\n")
    || !template.includes("Passwort zurücksetzen")
    || /(?:https?:|\/\/|javascript:|data:)/iu.test(template)
  ) {
    throw new Error("Das Passwort-Reset-Text-Template enthält nicht freigegebene Inhalte.");
  }
  return template;
}

async function loadBrandAsset(asset, readFile) {
  let value;
  try {
    value = await readFile(asset.url);
  } catch {
    throw new Error("Ein freigegebenes Passwort-Reset-Mailsignet fehlt.");
  }
  const content = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value || []);
  if (
    content.length === 0
    || content.length > MAX_ASSET_BYTES
    || !content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || sha256(content) !== asset.sha256
  ) {
    throw new Error("Ein Passwort-Reset-Mailsignet entspricht nicht dem freigegebenen Stand.");
  }
  return Object.freeze({
    filename: asset.filename,
    content,
    contentType: "image/png",
    contentDisposition: "inline",
    cid: asset.cid
  });
}

function validateCanonicalRecipient(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 254
    || value !== value.toLowerCase()
    || /[\s\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    throw new TypeError("Die Empfängeradresse ist ungültig.");
  }
  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) {
    throw new TypeError("Die Empfängeradresse ist ungültig.");
  }
  const localPart = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const labels = domain.split(".");
  if (
    localPart.length > 64
    || localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(localPart)
    || labels.length < 2
    || labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)
    )
    || !/^[a-z]{2,63}$/u.test(labels.at(-1))
  ) {
    throw new TypeError("Die Empfängeradresse ist ungültig.");
  }
  return value;
}

export function validatePasswordResetActionUrl(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || Buffer.byteLength(value, "utf8") > MAX_ACTION_URL_BYTES
    || /[\u0000-\u0020\u007f-\u009f]/u.test(value)
  ) {
    throw new TypeError("Der Passwort-Reset-Link ist ungültig.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Der Passwort-Reset-Link ist ungültig.");
  }
  const parameterNames = [...parsed.searchParams.keys()];
  const mode = parsed.searchParams.get("mode");
  const oobCode = parsed.searchParams.get("oobCode");
  const apiKey = parsed.searchParams.get("apiKey");
  const continueUrl = parsed.searchParams.get("continueUrl");
  const language = parsed.searchParams.get("lang");
  if (
    parsed.origin !== PASSWORD_RESET_ACTION_ORIGIN
    || parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname !== PASSWORD_RESET_ACTION_PATH
    || parsed.hash
    || parameterNames.length !== PASSWORD_RESET_ACTION_PARAMETERS.length
    || parameterNames.some(
      (name, index) => name !== PASSWORD_RESET_ACTION_PARAMETERS[index]
    )
    || mode !== "resetPassword"
    || !/^[A-Za-z0-9_-]{20,1024}$/u.test(String(oobCode || ""))
    || !/^AIza[A-Za-z0-9_-]{35}$/u.test(String(apiKey || ""))
    || continueUrl !== PASSWORD_RESET_CONTINUE_URL
    || language !== "de"
  ) {
    throw new TypeError("Der Passwort-Reset-Link ist ungültig.");
  }
  const canonical = new URL(PASSWORD_RESET_ACTION_PATH, PASSWORD_RESET_ACTION_ORIGIN);
  canonical.searchParams.set("mode", mode);
  canonical.searchParams.set("oobCode", oobCode);
  canonical.searchParams.set("apiKey", apiKey);
  canonical.searchParams.set("continueUrl", continueUrl);
  canonical.searchParams.set("lang", language);
  if (canonical.href !== value || parsed.href !== value) {
    throw new TypeError("Der Passwort-Reset-Link ist nicht kanonisch.");
  }
  return value;
}

export function validatePasswordResetSmtpPassword(value) {
  if (
    typeof value !== "string"
    || value.length < 10
    || value.length > 128
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    throw new TypeError("Das Passwort-Reset-SMTP-Passwort ist ungültig.");
  }
  return value;
}

function validateRenderedHtml(html, escapedActionUrl, cids) {
  const hrefs = [...html.matchAll(/\bhref="([^"]*)"/giu)]
    .map((match) => match[1]);
  const sources = [...html.matchAll(/\bsrc="([^"]*)"/giu)]
    .map((match) => match[1]);
  const withoutActionUrl = html.split(escapedActionUrl).join("");
  if (
    Buffer.byteLength(html, "utf8") > MAX_RENDERED_PART_BYTES
    || hrefs.length !== 2
    || hrefs.some((href) => href !== escapedActionUrl)
    || sources.length !== cids.length
    || sources.some((source, index) => source !== `cid:${cids[index]}`)
    || HIDDEN_EMAIL_CONTENT_PATTERN.test(html)
    || /\{\{|\}\}/u.test(html)
    || /<(?:script|iframe|object|embed|form|input|button|video|audio|svg|link|base)\b/iu.test(html)
    || /(?:https?:|\/\/|javascript:|data:|url\s*\()/iu.test(withoutActionUrl)
    || /\b(?:width|height)="1"/iu.test(html)
  ) {
    throw new Error("Die gerenderte Passwort-Reset-E-Mail enthält nicht freigegebene Inhalte.");
  }
}

export async function renderPasswordResetEmail({
  actionUrl,
  readFile = fs.readFile
} = {}) {
  const canonicalActionUrl = validatePasswordResetActionUrl(actionUrl);
  if (typeof readFile !== "function") {
    throw new TypeError("Der Passwort-Reset-Templatezugriff fehlt.");
  }
  let htmlTemplate;
  let textTemplate;
  try {
    [htmlTemplate, textTemplate] = await Promise.all([
      readFile(HTML_TEMPLATE_URL, "utf8"),
      readFile(TEXT_TEMPLATE_URL, "utf8")
    ]);
  } catch {
    throw new Error("Die Passwort-Reset-Mailtemplates fehlen.");
  }
  const validatedHtmlTemplate = validateHtmlTemplate(htmlTemplate);
  const validatedTextTemplate = validateTextTemplate(textTemplate);
  const attachments = await Promise.all(
    PASSWORD_RESET_EMAIL_BRAND_ASSETS.map((asset) => loadBrandAsset(asset, readFile))
  );
  const replacements = new Map([
    ["ACTION_URL", htmlEscape(canonicalActionUrl)],
    ...PASSWORD_RESET_EMAIL_BRAND_ASSETS.map(
      (asset) => [asset.placeholder, asset.cid]
    )
  ]);
  let html = validatedHtmlTemplate;
  for (const [placeholder, replacement] of replacements) {
    html = html.replaceAll(`{{${placeholder}}}`, replacement);
  }
  const text = validatedTextTemplate.replaceAll(
    "{{ACTION_URL}}",
    canonicalActionUrl
  );
  validateRenderedHtml(
    html,
    htmlEscape(canonicalActionUrl),
    PASSWORD_RESET_EMAIL_BRAND_ASSETS.map((asset) => asset.cid)
  );
  if (
    Buffer.byteLength(text, "utf8") > MAX_RENDERED_PART_BYTES
    || /\{\{|\}\}/u.test(text)
    || countOccurrences(text, canonicalActionUrl) !== 1
  ) {
    throw new Error("Die gerenderte Passwort-Reset-Text-E-Mail ist ungültig.");
  }
  return Object.freeze({
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    html,
    text,
    attachments: Object.freeze(attachments)
  });
}

function validateRenderedEmailForDelivery(value, actionUrl) {
  if (
    !value
    || typeof value !== "object"
    || value.subject !== PASSWORD_RESET_EMAIL_SUBJECT
    || typeof value.html !== "string"
    || typeof value.text !== "string"
    || !Array.isArray(value.attachments)
    || value.attachments.length !== PASSWORD_RESET_EMAIL_BRAND_ASSETS.length
  ) {
    throw new Error("Die gerenderte Passwort-Reset-E-Mail ist unvollständig.");
  }
  validateRenderedHtml(
    value.html,
    htmlEscape(actionUrl),
    PASSWORD_RESET_EMAIL_BRAND_ASSETS.map((asset) => asset.cid)
  );
  const textWithoutActionUrl = value.text.split(actionUrl).join("");
  if (
    Buffer.byteLength(value.text, "utf8") > MAX_RENDERED_PART_BYTES
    || countOccurrences(value.text, actionUrl) !== 1
    || /\{\{|\}\}/u.test(value.text)
    || /(?:https?:|\/\/|javascript:|data:)/iu.test(textWithoutActionUrl)
  ) {
    throw new Error("Die gerenderte Passwort-Reset-Text-E-Mail ist ungültig.");
  }
  for (const [index, attachment] of value.attachments.entries()) {
    const asset = PASSWORD_RESET_EMAIL_BRAND_ASSETS[index];
    if (
      !attachment
      || typeof attachment !== "object"
      || Object.keys(attachment).sort().join(",")
        !== "cid,content,contentDisposition,contentType,filename"
      || attachment.filename !== asset.filename
      || attachment.cid !== asset.cid
      || attachment.contentType !== "image/png"
      || attachment.contentDisposition !== "inline"
      || !Buffer.isBuffer(attachment.content)
      || attachment.content.length === 0
      || attachment.content.length > MAX_ASSET_BYTES
      || sha256(attachment.content) !== asset.sha256
    ) {
      throw new Error("Ein Passwort-Reset-Mailsignet ist für den Versand ungültig.");
    }
  }
  return value;
}

function transportConfiguration(smtpPassword) {
  return {
    host: PASSWORD_RESET_EMAIL_SMTP_HOST,
    port: PASSWORD_RESET_EMAIL_SMTP_PORT,
    secure: true,
    auth: {
      user: PASSWORD_RESET_EMAIL_SENDER_EMAIL,
      pass: smtpPassword
    },
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      servername: PASSWORD_RESET_EMAIL_SMTP_HOST
    },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    dnsTimeout: 5_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false
  };
}

function genericDeliveryError() {
  return new PasswordResetEmailDeliveryError();
}

export function createPasswordResetEmailSender({
  smtpPassword,
  transportFactory = nodemailer.createTransport,
  renderEmail = renderPasswordResetEmail,
  readFile = fs.readFile
} = {}) {
  validatePasswordResetSmtpPassword(smtpPassword);
  if (typeof transportFactory !== "function" || typeof renderEmail !== "function") {
    throw new TypeError("Der Passwort-Reset-Mailtransport ist unvollständig.");
  }
  let transport;
  try {
    transport = transportFactory(transportConfiguration(smtpPassword));
  } catch {
    throw new TypeError("Der Passwort-Reset-Mailtransport konnte nicht erstellt werden.");
  }
  if (!transport || typeof transport.sendMail !== "function") {
    throw new TypeError("Der Passwort-Reset-Mailtransport ist unvollständig.");
  }

  return async function sendPasswordResetEmail({ recipient, actionUrl } = {}) {
    const canonicalRecipient = validateCanonicalRecipient(recipient);
    const canonicalActionUrl = validatePasswordResetActionUrl(actionUrl);
    let rendered;
    try {
      rendered = validateRenderedEmailForDelivery(
        await renderEmail({
          actionUrl: canonicalActionUrl,
          readFile
        }),
        canonicalActionUrl
      );
    } catch {
      throw genericDeliveryError();
    }
    const sender = Object.freeze({
      name: PASSWORD_RESET_EMAIL_SENDER_NAME,
      address: PASSWORD_RESET_EMAIL_SENDER_EMAIL
    });
    const message = {
      from: sender,
      replyTo: sender,
      to: canonicalRecipient,
      envelope: {
        from: PASSWORD_RESET_EMAIL_SENDER_EMAIL,
        to: [canonicalRecipient]
      },
      subject: PASSWORD_RESET_EMAIL_SUBJECT,
      text: rendered.text,
      html: rendered.html,
      attachments: rendered.attachments,
      headers: {
        "X-Versorgungs-Kompass-Template": PASSWORD_RESET_EMAIL_TEMPLATE_ID
      },
      disableFileAccess: true,
      disableUrlAccess: true
    };
    let delivery;
    try {
      delivery = await transport.sendMail(message);
    } catch {
      throw genericDeliveryError();
    }
    const accepted = Array.isArray(delivery?.accepted)
      && delivery.accepted.some(
        (address) => String(address).toLowerCase() === canonicalRecipient
      );
    const rejected = [...(Array.isArray(delivery?.rejected) ? delivery.rejected : []),
      ...(Array.isArray(delivery?.pending) ? delivery.pending : [])]
      .some((address) => String(address).toLowerCase() === canonicalRecipient);
    if (!accepted || rejected) throw genericDeliveryError();
    return PASSWORD_RESET_EMAIL_ACCEPTED_RESPONSE;
  };
}
