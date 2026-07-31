#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  identityPlatformAccountFingerprint,
  validateIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  EXPECTED_PILOT_END,
  WELCOME_EMAIL_OPERATION,
  WELCOME_EMAIL_SUBJECT,
  executeWelcomeEmailRendering,
  loadProtectedBrandedSetPasswordLink,
  parseWelcomeEmailArguments,
  renderGuestWelcomeEmail,
  validateBrandedSetPasswordLink
} from "./render_pre_gematik_guest_welcome_email.mjs";

const projectRoot = new URL("../", import.meta.url);
const [textTemplate, htmlTemplate, rendererSource] = await Promise.all([
  fs.readFile(
    new URL("templates/email/pre-gematik-guest-welcome.txt", projectRoot),
    "utf8"
  ),
  fs.readFile(
    new URL("templates/email/pre-gematik-guest-welcome.html", projectRoot),
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
const apiKey = `AIza${"A".repeat(35)}`;
const oobCode = `one-time-${"x".repeat(32)}`;
const actionUrl =
  "https://versorgungs-kompass.de/konto/passwort-festlegen"
  + `?mode=resetPassword&oobCode=${oobCode}&apiKey=${apiKey}`
  + `&continueUrl=${encodeURIComponent(EXPECTED_CONTINUE_URL)}&lang=de`;

assert.equal(validateBrandedSetPasswordLink(actionUrl, document), actionUrl);
for (const unsafeLink of [
  actionUrl.replace("https://versorgungs-kompass.de", "https://example.invalid"),
  actionUrl.replace(
    "/konto/passwort-festlegen",
    "/__/auth/action"
  ),
  actionUrl.replace("mode=resetPassword", "mode=verifyEmail"),
  actionUrl.replace(`oobCode=${oobCode}`, "oobCode=short"),
  actionUrl.replace(`apiKey=${apiKey}`, "apiKey=invalid"),
  actionUrl.replace(
    encodeURIComponent(EXPECTED_CONTINUE_URL),
    encodeURIComponent("https://example.invalid/start")
  ),
  `${actionUrl}&unexpected=1`,
  `${actionUrl}&mode=resetPassword`,
  actionUrl.replace("&lang=de", "")
]) {
  safeFailure(
    () => validateBrandedSetPasswordLink(unsafeLink, document),
    /gebrandeten Passwort-Flow|Einladungslink/u
  );
}

const rendered = await renderGuestWelcomeEmail({
  document,
  actionUrl,
  senderName: "Versorgungs-Kompass Team",
  senderEmail: "owner@example.invalid",
  pilotEnd: EXPECTED_PILOT_END,
  textTemplate,
  htmlTemplate
});
for (const [name, value] of Object.entries(rendered)) {
  assert.ok(value.trim().length > 0, `${name} darf nicht leer sein.`);
}
assert.equal(rendered.subject.trim(), WELCOME_EMAIL_SUBJECT);
assert.match(rendered.text, /Du brauchst dafür kein Google-Konto/u);
assert.match(rendered.text, /versorgungs-kompass\.de\/start/u);
for (const body of [rendered.text, rendered.html, rendered.eml]) {
  assert.match(
    body,
    /Gib dort deine E-Mail-Adresse und dein Passwort ein und wähle „Sicher anmelden“\./u
  );
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
assert.match(rendered.eml, /Content-Type: text\/plain/u);
assert.match(rendered.eml, /Content-Type: text\/html/u);
assert.match(rendered.eml, /To: <guest@example\.invalid>/u);
for (const forbidden of [
  /firebase/iu,
  /steam-capsule/iu,
  /identity platform/iu,
  /google cloud/iu,
  /<script/iu,
  /<form/iu,
  /<img/iu,
  /https?:\/\/example\.invalid/iu
]) {
  assert.doesNotMatch(rendered.eml, forbidden);
}

await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: "Versorgungs-Kompass Team",
    senderEmail: "owner@example.invalid",
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
    senderName: "Versorgungs-Kompass Team",
    senderEmail: "owner@example.invalid",
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate,
    htmlTemplate: htmlTemplate.replace(
      "</body>",
      '<img src="https://tracker.example.invalid/pixel"></body>'
    )
  }),
  /aktive Inhalte/u
);
await safeRejection(
  () => renderGuestWelcomeEmail({
    document,
    actionUrl,
    senderName: "Versorgungs-Kompass Team\r\nBcc: attacker@example.invalid",
    senderEmail: "owner@example.invalid",
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
    senderName: "Versorgungs-Kompass Team",
    senderEmail: "Owner@Example.invalid",
    pilotEnd: EXPECTED_PILOT_END,
    textTemplate,
    htmlTemplate
  }),
  /kleingeschrieben/u
);

const previewOptions = parseWelcomeEmailArguments([
  "--input", "/protected/account.json",
  "--link-file", "/protected/link.txt",
  "--sender-name", "Versorgungs-Kompass Team",
  "--sender-email", "owner@example.invalid",
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
const fingerprint = identityPlatformAccountFingerprint(document);
const outputDirectory = path.join(temporaryRoot, "welcome-mail");
const applyOptions = parseWelcomeEmailArguments([
  "--input", path.join(temporaryRoot, "account.json"),
  "--link-file", linkFile,
  "--output-dir", outputDirectory,
  "--sender-name", "Versorgungs-Kompass Team",
  "--sender-email", "owner@example.invalid",
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
  oobCode,
  apiKey,
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
