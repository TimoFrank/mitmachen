#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  validateIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  EXPECTED_PILOT_END,
  WELCOME_EMAIL_BRAND_ASSET_SPECS,
  WELCOME_EMAIL_OPERATION,
  WELCOME_EMAIL_SENDER_EMAIL,
  WELCOME_EMAIL_SENDER_NAME,
  WELCOME_EMAIL_SUBJECT,
  WELCOME_EMAIL_TEMPLATE_ID,
  containsHiddenEmailContent,
  executeWelcomeEmailRendering,
  loadProtectedBrandedSetPasswordLink,
  parseWelcomeEmailArguments,
  renderGuestWelcomeEmail,
  validateBrandedSetPasswordLink,
  welcomeEmailRenderingFingerprint
} from "./render_pre_gematik_guest_welcome_email.mjs";

const projectRoot = new URL("../", import.meta.url);
const [textTemplate, htmlTemplate, rendererSource] = await Promise.all([
  fs.readFile(
    new URL("config/pre-gematik/email/pre-gematik-guest-welcome.txt", projectRoot),
    "utf8"
  ),
  fs.readFile(
    new URL("config/pre-gematik/email/pre-gematik-guest-welcome.html", projectRoot),
    "utf8"
  ),
  fs.readFile(
    new URL("scripts/render_pre_gematik_guest_welcome_email.mjs", projectRoot),
    "utf8"
  )
]);

function safeFailure(action, pattern) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityPlatformOnboardingError
      && pattern.test(error.message)
  );
}

async function safeRejection(action, pattern) {
  await assert.rejects(
    action,
    (error) =>
      error instanceof IdentityPlatformOnboardingError
      && pattern.test(error.message)
  );
}

const document = validateIdentityPlatformAccountDocument({
  version: 1,
  project_id: "steam-capsule-341212",
  uid: "guest_test_001",
  email: "guest@example.invalid",
  display_name: "Timo <Test> & Co.",
  email_ownership_verified: true,
  continue_url: EXPECTED_CONTINUE_URL
});
const invitationToken = Buffer.alloc(32, 9).toString("base64url");
const actionUrl =
  "https://versorgungs-kompass.de/konto/passwort-festlegen"
  + `#einladung=${invitationToken}`;

assert.equal(validateBrandedSetPasswordLink(actionUrl, document), actionUrl);
for (const unsafeLink of [
  actionUrl.replace("https://versorgungs-kompass.de", "https://example.invalid"),
  actionUrl.replace(
    "/konto/passwort-festlegen",
    "/__/auth/action"
  ),
  actionUrl.replace("#einladung=", "?einladung="),
  actionUrl.replace("#einladung=", "#token="),
  actionUrl.replace(invitationToken, "short"),
  `${actionUrl}&unexpected=1`
]) {
  safeFailure(
    () => validateBrandedSetPasswordLink(unsafeLink, document),
    /48-Stunden|Wrapperlink|Einladungslink/u
  );
}

const rendered = await renderGuestWelcomeEmail({
  document,
  actionUrl,
  senderName: WELCOME_EMAIL_SENDER_NAME,
  senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
  pilotEnd: EXPECTED_PILOT_END,
  textTemplate,
  htmlTemplate
});
for (const [name, value] of Object.entries(rendered)) {
  assert.ok(value.trim().length > 0, `${name} darf nicht leer sein.`);
}
assert.equal(rendered.subject.trim(), WELCOME_EMAIL_SUBJECT);
assert.equal(containsHiddenEmailContent(htmlTemplate), false);
assert.equal(containsHiddenEmailContent(rendered.html), false);
assert.match(rendered.text, /Ein zusätzliches Google-Konto ist nicht erforderlich/u);
assert.match(rendered.text, /innerhalb von 48 Stunden vollständig ein/u);
assert.match(rendered.text, /versorgungs-kompass\.de\/start/u);
assert.match(rendered.html, /Persönlichen Zugang einrichten/u);
assert.match(rendered.html, /mso-padding-alt:16px 28px/u);
assert.match(rendered.html, /Der persönliche Link kann nur einmal verwendet werden/u);
assert.match(rendered.html, /innerhalb von 48 Stunden vollständig einrichten/u);
assert.match(rendered.html, /<h1[^>]*>Willkommen<\/h1>/u);
assert.doesNotMatch(rendered.html, /Willkommen im(?:<br>)?Versorgungs-Kompass/u);
for (const label of ["Versorgung", "Stakeholder", "Hospitation", "Formate"]) {
  assert.match(rendered.text, new RegExp(label, "u"));
  assert.match(rendered.html, new RegExp(`>${label}<`, "u"));
}
const renderedBrandCids = [...rendered.html.matchAll(/<img src="cid:([^"]+)"/gu)]
  .map((match) => match[1]);
assert.equal(renderedBrandCids.length, 4);
assert.equal(new Set(renderedBrandCids).size, 4);
for (const [index, spec] of WELCOME_EMAIL_BRAND_ASSET_SPECS.entries()) {
  assert.match(
    renderedBrandCids[index],
    new RegExp(`^${spec.cidPrefix}\\.[a-f0-9]{24}@versorgungs-kompass\\.de$`, "u")
  );
}
for (const body of [rendered.text, rendered.html]) {
  assert.match(
    body,
    /Auf der #Mitmachen-Anmeldeseite gibst du deine E-Mail-Adresse und dein Passwort ein und wählst „Sicher anmelden“\./u
  );
  assert.match(body, /#Mitmachen/u);
  assert.doesNotMatch(body, /Mit E-Mail und Passwort anmelden/u);
}
assert.equal(rendered.text.split(actionUrl).length - 1, 1);
assert.equal(
  rendered.html.split(actionUrl.replaceAll("&", "&amp;")).length - 1,
  2
);
assert.equal((rendered.html.match(/<a\s+href=/gu) || []).length, 1);
assert.match(rendered.html, /Timo &lt;Test&gt; &amp; Co\./u);
assert.doesNotMatch(rendered.html, /Timo <Test>/u);
assert.match(rendered.eml, /Content-Type: multipart\/alternative/u);
assert.match(rendered.eml, /Content-Type: multipart\/related/u);
assert.match(rendered.eml, /Content-Type: text\/plain/u);
assert.match(rendered.eml, /Content-Type: text\/html/u);
assert.equal(
  (rendered.eml.match(/Content-Transfer-Encoding: base64/gu) || []).length,
  6
);
assert.equal((rendered.eml.match(/Content-Type: image\/png/gu) || []).length, 4);
assert.equal(
  (rendered.eml.match(/Content-Disposition: inline/gu) || []).length,
  4
);
assert.match(
  rendered.eml,
  /Reply-To: <zugang@versorgungs-kompass\.de>/u
);
assert.match(rendered.eml, /^From: #Mitmachen <zugang@versorgungs-kompass\.de>$/mu);
assert.match(
  rendered.eml,
  /^Subject: #Mitmachen: Dein Testzugang zum Versorgungs-Kompass$/mu
);
assert.doesNotMatch(rendered.eml, /=\?UTF-8\?[BQ]\?/iu);
assert.match(rendered.eml, /To: <guest@example\.invalid>/u);
assert.match(rendered.eml, new RegExp(WELCOME_EMAIL_TEMPLATE_ID, "u"));
assert.ok(
  rendered.eml.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 998),
  "EML-Zeilen muessen das SMTP-Limit einhalten."
);
const fingerprint = welcomeEmailRenderingFingerprint(rendered);
assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.notEqual(
  welcomeEmailRenderingFingerprint({
    ...rendered,
    eml: rendered.eml.replace(
      WELCOME_EMAIL_TEMPLATE_ID,
      `${WELCOME_EMAIL_TEMPLATE_ID}-test`
    )
  }),
  fingerprint,
  "Der Renderer-Fingerprint muss jede Änderung des vollständigen Mailpakets binden."
);
for (const forbidden of [
  /firebase/iu,
  /steam-capsule/iu,
  /identity platform/iu,
  /google cloud/iu,
  /<script/iu,
  /<form/iu,
  /<svg/iu,
  /data:/iu,
  /https?:\/\/example\.invalid/iu
]) {
  assert.doesNotMatch(`${rendered.text}\n${rendered.html}`, forbidden);
}

await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: WELCOME_EMAIL_SENDER_NAME,
    senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate: "",
    htmlTemplate
  }),
  /Mailvorlage ist leer/u
);
await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: WELCOME_EMAIL_SENDER_NAME,
    senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate,
    htmlTemplate: htmlTemplate.replace(
      "</body>",
      '<img src="https://tracker.example.invalid/pixel"></body>'
    )
  }),
  /Signets|aktive Inhalte/u
);
for (const hiddenMarkup of [
  '<div style="display:none;opacity:0">Verborgener Inhalt</div>',
  "<div hidden>Verborgener Inhalt</div>",
  '<div style="position:absolute;left:-9999px">Verborgener Inhalt</div>',
  "<div>Verborgener Inhalt\u200d</div>"
]) {
  await safeRejection(
    () => renderGuestWelcomeEmail({
      document,
      actionUrl,
      senderName: WELCOME_EMAIL_SENDER_NAME,
      senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
      pilotEnd: EXPECTED_PILOT_END,
      textTemplate,
      htmlTemplate: htmlTemplate.replace("</body>", `${hiddenMarkup}</body>`)
    }),
    /verborgene Inhalte/u
  );
}
for (const activeMarkup of [
  '<svg onload="alert(1)"></svg>',
  '<div style="background-image:url(data:text/plain,unsafe)">Unsicher</div>',
  '<object data="cid:brand"></object>'
]) {
  await safeRejection(
    () => renderGuestWelcomeEmail({
      document,
      actionUrl,
      senderName: WELCOME_EMAIL_SENDER_NAME,
      senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
      pilotEnd: EXPECTED_PILOT_END,
      textTemplate,
      htmlTemplate: htmlTemplate.replace("</body>", `${activeMarkup}</body>`)
    }),
    /aktive Inhalte/u
  );
}
await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: "Versorgungs-Kompass\r\nBcc: attacker@example.invalid",
    senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate,
    htmlTemplate
  }),
  /sender-name.*ungueltig/u
);
await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: WELCOME_EMAIL_SENDER_NAME,
    senderEmail: "Zugang@Versorgungs-Kompass.de",
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate,
    htmlTemplate
  }),
  /kleingeschrieben/u
);
await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: WELCOME_EMAIL_SENDER_NAME,
    senderEmail: "personal@example.invalid",
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate,
    htmlTemplate
  }),
  /freigegebenen #Mitmachen-Absender/u
);

const previewOptions = parseWelcomeEmailArguments([
  "--input", "/protected/account.json",
  "--link-file", "/protected/link.txt",
  "--sender-name", WELCOME_EMAIL_SENDER_NAME,
  "--sender-email", WELCOME_EMAIL_SENDER_EMAIL,
  "--pilot-end", EXPECTED_PILOT_END
]);
assert.equal(previewOptions.apply, false);

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "vk-welcome-mail-test-")
);
await fs.chmod(temporaryRoot, 0o700);
const repository = path.join(temporaryRoot, "repository");
await fs.mkdir(repository, { mode: 0o700 });
const linkFile = path.join(temporaryRoot, "set-password-link.txt");
await fs.writeFile(linkFile, `${actionUrl}\n`, { mode: 0o600 });
await fs.chmod(linkFile, 0o600);
assert.equal(
  await loadProtectedBrandedSetPasswordLink(linkFile, { repository }),
  actionUrl
);
const outputDirectory = path.join(temporaryRoot, "welcome-mail");
const applyOptions = parseWelcomeEmailArguments([
  "--input", path.join(temporaryRoot, "account.json"),
  "--link-file", linkFile,
  "--output-dir", outputDirectory,
  "--sender-name", WELCOME_EMAIL_SENDER_NAME,
  "--sender-email", WELCOME_EMAIL_SENDER_EMAIL,
  "--pilot-end", EXPECTED_PILOT_END,
  "--apply",
  "--confirm-operation", WELCOME_EMAIL_OPERATION,
  "--confirm-fingerprint", fingerprint
]);
const logs = [];
const applied = await executeWelcomeEmailRendering({
  document,
  actionUrl,
  options: applyOptions,
  repository,
  templates: { textTemplate, htmlTemplate },
  log: (value) => logs.push(value)
});
assert.equal(applied.applied, true);
assert.equal(applied.outputCreated, true);
const outputNames = (await fs.readdir(outputDirectory)).sort();
assert.deepEqual(outputNames, [
  "body.html",
  "body.txt",
  "subject.txt",
  "welcome.eml"
]);
for (const outputName of outputNames) {
  const outputPath = path.join(outputDirectory, outputName);
  const metadata = await fs.stat(outputPath);
  assert.ok(metadata.size > 0, `${outputName} darf nicht leer sein.`);
  if (process.platform !== "win32") {
    assert.equal(metadata.mode & 0o077, 0, `${outputName} muss owner-only sein.`);
  }
}
assert.equal(logs.length, 1);
for (const secret of [
  document.email,
  document.display_name,
  actionUrl,
  invitationToken,
  outputDirectory
]) {
  assert.ok(!logs[0].includes(secret), "stdout enthaelt geschuetzte Maildaten.");
}
assert.match(logs[0], /mail_bundle_created=true/u);
assert.match(logs[0], new RegExp(fingerprint, "u"));

await safeRejection(
  () => executeWelcomeEmailRendering({
    document,
    actionUrl,
    options: {
      ...applyOptions,
      outputDirectory: path.join(temporaryRoot, "wrong-fingerprint"),
      confirmFingerprint: `sha256:${"0".repeat(64)}`
    },
    repository,
    templates: { textTemplate, htmlTemplate },
    log: () => {}
  }),
  /Apply-Bestaetigungen/u
);
await safeRejection(
  () => executeWelcomeEmailRendering({
    document,
    actionUrl,
    options: applyOptions,
    repository,
    templates: { textTemplate, htmlTemplate },
    log: () => {}
  }),
  /existiert bereits/u
);

const weakLinkFile = path.join(temporaryRoot, "weak-link.txt");
await fs.writeFile(weakLinkFile, `${actionUrl}\n`, { mode: 0o644 });
if (process.platform !== "win32") {
  await fs.chmod(weakLinkFile, 0o644);
  await safeRejection(
    () => loadProtectedBrandedSetPasswordLink(weakLinkFile, { repository }),
    /owner-only/u
  );
}

assert.doesNotMatch(
  rendererSource,
  /console\.(?:log|error)\([^)]*(?:actionUrl|oobCode|document\.email)/u
);
await fs.rm(temporaryRoot, { recursive: true, force: true });

console.log(
  "Gast-Willkommensmail OK: gebrandete Text-/HTML-/EML-Ausgaben sind "
  + "nicht leer, trackerfrei, owner-only und zeigen keinen Firebase-Ursprung."
);
