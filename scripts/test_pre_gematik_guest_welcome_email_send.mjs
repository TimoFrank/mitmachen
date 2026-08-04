#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  identityPlatformAccountFingerprint,
  validateIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  PASSWORD_INVITATION_TTL_MS,
  passwordInvitationTokenDigest
} from "./provision_pre_gematik_password_invitation.mjs";
import {
  EXPECTED_PILOT_END,
  WELCOME_EMAIL_BRAND_ASSET_SPECS,
  WELCOME_EMAIL_SENDER_EMAIL,
  WELCOME_EMAIL_SENDER_NAME,
  renderGuestWelcomeEmail
} from "./render_pre_gematik_guest_welcome_email.mjs";
import {
  WELCOME_EMAIL_SEND_OPERATION,
  WELCOME_EMAIL_SMTP_HOST,
  WELCOME_EMAIL_SMTP_PORT,
  WELCOME_EMAIL_SMTP_SECURITY,
  buildSmtpCurlConfig,
  curlSmtpTransport,
  defaultWelcomeEmailReceiptDirectory,
  executeWelcomeEmailSend,
  parseWelcomeEmailSendArguments,
  validateWelcomeEmailEml,
  validateWelcomeEmailSmtpConfig,
  welcomeEmailReceiptPath
} from "./send_pre_gematik_guest_welcome_email.mjs";

const projectRoot = new URL("../", import.meta.url);
const [textTemplate, htmlTemplate] = await Promise.all([
  fs.readFile(
    new URL("config/pre-gematik/email/pre-gematik-guest-welcome.txt", projectRoot),
    "utf8"
  ),
  fs.readFile(
    new URL("config/pre-gematik/email/pre-gematik-guest-welcome.html", projectRoot),
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

function mimeBase64ForTest(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .match(/.{1,76}/gu)
    .join("\r\n");
}

const document = validateIdentityPlatformAccountDocument({
  version: 1,
  project_id: "steam-capsule-341212",
  uid: "guest_smtp_test_001",
  email: "guest@example.invalid",
  display_name: "SMTP Test",
  email_ownership_verified: true,
  continue_url: EXPECTED_CONTINUE_URL
});
const invitationToken = Buffer.alloc(32, 11).toString("base64url");
const actionUrl =
  "https://versorgungs-kompass.de/konto/passwort-festlegen"
  + `#einladung=${invitationToken}`;
const rendered = await renderGuestWelcomeEmail({
  document,
  actionUrl,
  senderName: WELCOME_EMAIL_SENDER_NAME,
  senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
  pilotEnd: EXPECTED_PILOT_END,
  textTemplate,
  htmlTemplate
});
assert.equal(validateWelcomeEmailEml(rendered.eml).recipient, document.email);
for (const mutation of [
  rendered.eml.replace(
    `Reply-To: <${WELCOME_EMAIL_SENDER_EMAIL}>`,
    "Reply-To: <attacker@example.invalid>"
  ),
  rendered.eml.replace(
    `To: <${document.email}>`,
    `To: <${document.email}>\r\nBcc: <attacker@example.invalid>`
  ),
  rendered.eml.replace(
    "Content-Transfer-Encoding: base64",
    "Content-Transfer-Encoding: quoted-printable"
  ),
  rendered.eml.replace(
    "Subject: ",
    "Subject: =?UTF-8?B?UGhpc2hpbmctQmV0cmVmZg==?=\r\nX-Original-"
  ),
  rendered.eml.replace(
    "Content-Type: image/png; name=\"versorgungs-kompass-mark-on-dark.png\"",
    "Content-Type: image/svg+xml; name=\"versorgungs-kompass-mark-on-dark.svg\""
  ),
  rendered.eml.replace(
    "Content-ID: <vk-compass-versorgung.",
    "Content-ID: <vk-compass-unknown."
  )
]) {
  safeFailure(
    () => validateWelcomeEmailEml(mutation),
    /Mailvertrag|Header|MIME/u
  );
}

const canonicalFirstBrandAsset = await fs.readFile(
  WELCOME_EMAIL_BRAND_ASSET_SPECS[0].pngUrl
);
const changedFirstBrandAsset = Buffer.from(canonicalFirstBrandAsset);
changedFirstBrandAsset[changedFirstBrandAsset.length - 16] ^= 1;
const changedBrandEml = rendered.eml.replace(
  mimeBase64ForTest(canonicalFirstBrandAsset),
  mimeBase64ForTest(changedFirstBrandAsset)
);
assert.notEqual(changedBrandEml, rendered.eml);
safeFailure(
  () => validateWelcomeEmailEml(changedBrandEml),
  /Mail-Signet/u
);
for (const activeMarkup of [
  '<svg onload="alert(1)"></svg>',
  '<div style="background-image:url(data:text/plain,unsafe)">Unsicher</div>',
  '<object data="cid:brand"></object>'
]) {
  const unsafeHtml = rendered.html.replace(
    "</body>",
    `${activeMarkup}</body>`
  );
  const unsafeEml = rendered.eml.replace(
    mimeBase64ForTest(rendered.html),
    mimeBase64ForTest(unsafeHtml)
  );
  safeFailure(
    () => validateWelcomeEmailEml(unsafeEml),
    /aktive Inhalte|eingebetteten Signets/u
  );
}

const password = "preview-only-smtp-password";
const smtp = validateWelcomeEmailSmtpConfig({
  version: 1,
  host: WELCOME_EMAIL_SMTP_HOST,
  port: WELCOME_EMAIL_SMTP_PORT,
  security: WELCOME_EMAIL_SMTP_SECURITY,
  username: WELCOME_EMAIL_SENDER_EMAIL,
  password,
  sender_email: WELCOME_EMAIL_SENDER_EMAIL
});
safeFailure(
  () => validateWelcomeEmailSmtpConfig({
    ...smtp,
    sender_email: "personal@example.invalid"
  }),
  /Domain-Postfach/u
);
safeFailure(
  () => validateWelcomeEmailSmtpConfig({
    ...smtp,
    password: "short"
  }),
  /zu kurz/u
);

const curlConfig = buildSmtpCurlConfig({
  smtp,
  recipient: document.email
});
assert.match(curlConfig, /smtps:\/\/w01abca0\.kasserver\.com:465/u);
assert.match(curlConfig, /mail-from = "zugang@versorgungs-kompass\.de"/u);
assert.match(curlConfig, /mail-rcpt = "guest@example\.invalid"/u);
assert.match(curlConfig, /upload-file = "-"/u);
assert.match(curlConfig, new RegExp(password, "u"));

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "vk-welcome-smtp-test-")
);
await fs.chmod(temporaryRoot, 0o700);
const originalHome = process.env.HOME;
process.env.HOME = path.join(temporaryRoot, "hostile-home");
try {
  assert.equal(
    defaultWelcomeEmailReceiptDirectory(),
    path.join(
      os.userInfo().homedir,
      ".local",
      "state",
      "versorgungs-kompass",
      "pre-gematik-welcome-email"
    )
  );
} finally {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
}
const repository = path.join(temporaryRoot, "repository");
await fs.mkdir(repository, { mode: 0o700 });
const mailPath = path.join(temporaryRoot, "welcome.eml");
const smtpPath = path.join(temporaryRoot, "smtp.json");
const accountPath = path.join(temporaryRoot, "account.json");
const linkPath = path.join(temporaryRoot, "set-password-link.txt");
const receiptDirectory = path.join(temporaryRoot, "receipts");
await fs.writeFile(mailPath, rendered.eml, { mode: 0o600 });
await fs.writeFile(
  smtpPath,
  `${JSON.stringify(smtp)}\n`,
  { mode: 0o600 }
);
await fs.writeFile(
  accountPath,
  `${JSON.stringify(document, null, 2)}\n`,
  { mode: 0o600 }
);
await fs.writeFile(linkPath, `${actionUrl}\n`, { mode: 0o600 });
await fs.chmod(mailPath, 0o600);
await fs.chmod(smtpPath, 0o600);
await fs.chmod(accountPath, 0o600);
await fs.chmod(linkPath, 0o600);

const invitationBucket = "vk-private-password-invitations-test";
const preparedActionUrls = [];
const invitationStore = Object.freeze({ test: true });
const readSyntheticPreparedInvitation = async ({
  actionUrl: candidateActionUrl,
  account,
  store
}) => {
  assert.equal(account.email, document.email);
  assert.equal(store, invitationStore);
  const tokenValue = candidateActionUrl.split("#einladung=")[1];
  const digest = passwordInvitationTokenDigest(tokenValue);
  preparedActionUrls.push(candidateActionUrl);
  return {
    digest,
    generation: "123",
    record: {
      version: "v1",
      purpose: "password_invitation",
      status: "prepared",
      project_id: document.project_id,
      tenant_id: "",
      uid: document.uid,
      email: document.email,
      continue_url: document.continue_url,
      prepared_at: "2026-07-31T09:55:00.000Z",
      accepted_at: null,
      expires_at: null,
      account_fingerprint: identityPlatformAccountFingerprint(document),
      guest_access_fingerprint: `sha256:${"a".repeat(64)}`,
      binding_state_fingerprint: `sha256:${"b".repeat(64)}`,
      profile_id: "12345678-1234-4123-8123-123456789abc",
      role: "viewer",
      access_scope: "test_only",
      scope_ref: "external-pilot:gematik"
    }
  };
};
const activationCalls = [];
const activateSyntheticInvitation = async ({ prepared, acceptedAt, store }) => {
  assert.equal(store, invitationStore);
  activationCalls.push({ prepared, acceptedAt });
  return {
    digest: prepared.digest,
    generation: "456",
    record: {
      ...prepared.record,
      status: "active",
      accepted_at: acceptedAt,
      expires_at: new Date(
        new Date(acceptedAt).valueOf() + PASSWORD_INVITATION_TTL_MS
      ).toISOString()
    }
  };
};
const executionContext = {
  repository,
  receiptDirectory,
  invitationStoreFactory: ({ bucket, projectId }) => {
    assert.equal(bucket, invitationBucket);
    assert.equal(projectId, document.project_id);
    return invitationStore;
  },
  readPreparedInvitation: readSyntheticPreparedInvitation,
  activateInvitation: activateSyntheticInvitation
};

const previewOptions = parseWelcomeEmailSendArguments([
  "--input", accountPath,
  "--link-file", linkPath,
  "--mail-file", mailPath,
  "--smtp-config", smtpPath,
  "--invitation-bucket", invitationBucket
]);
const previewLogs = [];
let transportCalls = 0;
const preview = await executeWelcomeEmailSend({
  options: previewOptions,
  ...executionContext,
  transport: async () => {
    transportCalls += 1;
  },
  log: (value) => previewLogs.push(value)
});
assert.equal(preview.applied, false);
assert.equal(preview.accepted, false);
assert.equal(transportCalls, 0);
assert.equal(previewLogs.length, 1);
assert.equal(preparedActionUrls.length, 1);
for (const secret of [
  password,
  document.email,
  actionUrl,
  invitationToken,
  mailPath,
  smtpPath
]) {
  assert.ok(!previewLogs[0].includes(secret), "Preview enthaelt geschuetzte Daten.");
}

const applyOptions = parseWelcomeEmailSendArguments([
  "--input", accountPath,
  "--link-file", linkPath,
  "--mail-file", mailPath,
  "--smtp-config", smtpPath,
  "--invitation-bucket", invitationBucket,
  "--apply",
  "--confirm-operation", WELCOME_EMAIL_SEND_OPERATION,
  "--confirm-fingerprint", preview.fingerprint
]);
const applyLogs = [];
let transportedConfig = "";
let transportedMail = "";
const accepted = await executeWelcomeEmailSend({
  options: applyOptions,
  ...executionContext,
  transport: async ({ curlConfig: receivedConfig, rawMail }) => {
    transportCalls += 1;
    transportedConfig = receivedConfig;
    transportedMail = rawMail;
  },
  log: (value) => applyLogs.push(value),
  now: () => new Date("2026-07-31T10:00:00.000Z"),
  messageIdFactory: () => "11111111-1111-4111-8111-111111111111"
});
assert.equal(accepted.applied, true);
assert.equal(accepted.accepted, true);
assert.equal(accepted.activated, true);
assert.equal(transportCalls, 1);
assert.equal(preparedActionUrls.length, 2);
assert.equal(activationCalls.length, 1);
assert.equal(
  transportedConfig,
  buildSmtpCurlConfig({
    smtp,
    recipient: document.email
  })
);
assert.match(
  transportedMail,
  /Date: Fri, 31 Jul 2026 10:00:00 \+0000\r\n/u
);
assert.match(
  transportedMail,
  /Message-ID: <11111111-1111-4111-8111-111111111111@versorgungs-kompass\.de>\r\n/u
);
assert.equal(
  transportedMail
    .replace(/Date: [^\r]+\r\nMessage-ID: <[^>]+>\r\n/u, ""),
  rendered.eml
);
assert.equal(applyLogs.length, 1);
assert.match(applyLogs[0], /smtp_accepted=true/u);
assert.match(applyLogs[0], /invitation_activated=true/u);
const receiptPath = welcomeEmailReceiptPath(
  receiptDirectory,
  preview.fingerprint
);
const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
assert.equal(receipt.status, "accepted");
assert.equal(receipt.accepted_at, "2026-07-31T10:00:00.000Z");
assert.equal(receipt.invitation_status, "active");
assert.equal(receipt.active_generation, "456");
assert.equal(
  receipt.invitation_expires_at,
  "2026-08-02T10:00:00.000Z"
);
assert.equal(receipt.send_started_at, "2026-07-31T10:00:00.000Z");
assert.equal(
  receipt.message_id,
  "<11111111-1111-4111-8111-111111111111@versorgungs-kompass.de>"
);
assert.equal(receipt.mail_fingerprint, preview.fingerprint);
assert.ok(!(await fs.readFile(receiptPath, "utf8")).includes(password));
if (process.platform !== "win32") {
  assert.equal((await fs.stat(receiptPath)).mode & 0o077, 0);
  assert.equal((await fs.stat(receiptDirectory)).mode & 0o077, 0);
}
await safeRejection(
  () => executeWelcomeEmailSend({
    options: applyOptions,
    ...executionContext,
    transport: async () => {},
    log: () => {}
  }),
  /existiert bereits/u
);

safeFailure(
  () => parseWelcomeEmailSendArguments([
    ...[
      "--input", accountPath,
      "--link-file", linkPath,
      "--mail-file", mailPath,
      "--smtp-config", smtpPath
    ],
    "--receipt", path.join(temporaryRoot, "alternate.json")
  ]),
  /Unbekannte/u
);

const copiedSmtpPath = path.join(temporaryRoot, "smtp-copy.json");
await fs.writeFile(
  copiedSmtpPath,
  `${JSON.stringify(smtp)}\n`,
  { mode: 0o600 }
);
await fs.chmod(copiedSmtpPath, 0o600);
const copiedPreviewOptions = {
  ...previewOptions,
  smtpConfig: copiedSmtpPath
};
const copiedPreview = await executeWelcomeEmailSend({
  options: copiedPreviewOptions,
  ...executionContext,
  transport: async () => {},
  log: () => {}
});
assert.equal(copiedPreview.fingerprint, preview.fingerprint);
await safeRejection(
  () => executeWelcomeEmailSend({
    options: {
      ...applyOptions,
      smtpConfig: copiedSmtpPath
    },
    ...executionContext,
    transport: async () => {},
    log: () => {}
  }),
  /existiert bereits/u
);

const rotatedSmtpPath = path.join(temporaryRoot, "smtp-rotated.json");
await fs.writeFile(
  rotatedSmtpPath,
  `${JSON.stringify({
    ...smtp,
    password: "rotated-preview-only-smtp-password"
  })}\n`,
  { mode: 0o600 }
);
await fs.chmod(rotatedSmtpPath, 0o600);
const rotatedPreview = await executeWelcomeEmailSend({
  options: {
    ...previewOptions,
    smtpConfig: rotatedSmtpPath
  },
  ...executionContext,
  transport: async () => {},
  log: () => {}
});
assert.equal(rotatedPreview.fingerprint, preview.fingerprint);
await safeRejection(
  () => executeWelcomeEmailSend({
    options: {
      ...applyOptions,
      smtpConfig: rotatedSmtpPath
    },
    ...executionContext,
    transport: async () => {},
    log: () => {}
  }),
  /existiert bereits/u
);

const failedInvitationToken = Buffer.alloc(32, 12).toString("base64url");
const failedActionUrl = actionUrl.replace(
  invitationToken,
  failedInvitationToken
);
const failedRendered = await renderGuestWelcomeEmail({
  document,
  actionUrl: failedActionUrl,
  senderName: WELCOME_EMAIL_SENDER_NAME,
  senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
  pilotEnd: EXPECTED_PILOT_END,
  textTemplate,
  htmlTemplate
});
const failedMailPath = path.join(temporaryRoot, "failed-welcome.eml");
const failedLinkPath = path.join(temporaryRoot, "failed-set-password-link.txt");
await fs.writeFile(failedMailPath, failedRendered.eml, { mode: 0o600 });
await fs.writeFile(
  failedLinkPath,
  `${failedActionUrl}\n`,
  { mode: 0o600 }
);
await fs.chmod(failedMailPath, 0o600);
await fs.chmod(failedLinkPath, 0o600);
const failedPreviewOptions = {
  ...previewOptions,
  linkFile: failedLinkPath,
  mailFile: failedMailPath
};
const failedPreview = await executeWelcomeEmailSend({
  options: failedPreviewOptions,
  ...executionContext,
  transport: async () => {},
  log: () => {}
});
assert.notEqual(failedPreview.fingerprint, preview.fingerprint);
const failedApplyOptions = {
  ...failedPreviewOptions,
  apply: true,
  confirmOperation: WELCOME_EMAIL_SEND_OPERATION,
  confirmFingerprint: failedPreview.fingerprint
};
await safeRejection(
  () => executeWelcomeEmailSend({
    options: failedApplyOptions,
    ...executionContext,
    transport: async () => {
      throw new Error("synthetic transport failure");
    },
    log: () => {},
    now: () => new Date("2026-07-31T10:01:00.000Z"),
    messageIdFactory: () => "22222222-2222-4222-8222-222222222222"
  }),
  /Nicht erneut senden/u
);
const failedReceiptPath = welcomeEmailReceiptPath(
  receiptDirectory,
  failedPreview.fingerprint
);
const failedReceipt = JSON.parse(
  await fs.readFile(failedReceiptPath, "utf8")
);
assert.equal(failedReceipt.status, "unknown");
assert.equal(failedReceipt.send_started_at, "2026-07-31T10:01:00.000Z");
assert.equal(
  failedReceipt.message_id,
  "<22222222-2222-4222-8222-222222222222@versorgungs-kompass.de>"
);

const activationPendingToken = Buffer.alloc(32, 13).toString("base64url");
const activationPendingUrl = actionUrl.replace(
  invitationToken,
  activationPendingToken
);
const activationPendingRendered = await renderGuestWelcomeEmail({
  document,
  actionUrl: activationPendingUrl,
  senderName: WELCOME_EMAIL_SENDER_NAME,
  senderEmail: WELCOME_EMAIL_SENDER_EMAIL,
  pilotEnd: EXPECTED_PILOT_END,
  textTemplate,
  htmlTemplate
});
const activationPendingMailPath = path.join(
  temporaryRoot,
  "activation-pending-welcome.eml"
);
const activationPendingLinkPath = path.join(
  temporaryRoot,
  "activation-pending-link.txt"
);
await fs.writeFile(
  activationPendingMailPath,
  activationPendingRendered.eml,
  { mode: 0o600 }
);
await fs.writeFile(
  activationPendingLinkPath,
  `${activationPendingUrl}\n`,
  { mode: 0o600 }
);
const activationPendingPreviewOptions = {
  ...previewOptions,
  linkFile: activationPendingLinkPath,
  mailFile: activationPendingMailPath
};
const activationPendingPreview = await executeWelcomeEmailSend({
  options: activationPendingPreviewOptions,
  ...executionContext,
  transport: async () => {},
  log: () => {}
});
const activationPendingApplyOptions = {
  ...activationPendingPreviewOptions,
  apply: true,
  confirmOperation: WELCOME_EMAIL_SEND_OPERATION,
  confirmFingerprint: activationPendingPreview.fingerprint
};
await safeRejection(
  () => executeWelcomeEmailSend({
    options: activationPendingApplyOptions,
    ...executionContext,
    transport: async () => {},
    activateInvitation: async () => {
      throw new Error("synthetic activation failure");
    },
    log: () => {},
    now: () => new Date("2026-07-31T10:02:00.000Z"),
    messageIdFactory: () => "33333333-3333-4333-8333-333333333333"
  }),
  /SMTP hat die Mail angenommen.*Nicht erneut senden/u
);
const activationPendingReceipt = JSON.parse(await fs.readFile(
  welcomeEmailReceiptPath(
    receiptDirectory,
    activationPendingPreview.fingerprint
  ),
  "utf8"
));
assert.equal(
  activationPendingReceipt.status,
  "smtp_accepted_activation_pending"
);
assert.equal(
  activationPendingReceipt.activation_status,
  "reconciliation_required"
);

let receivedTransportBody = "";
let receivedTransportRequests = 0;
const transportServer = createServer((request, response) => {
  receivedTransportRequests += 1;
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    receivedTransportBody += chunk;
  });
  request.on("end", () => {
    response.writeHead(204);
    response.end();
  });
});
await new Promise((resolve, reject) => {
  transportServer.once("error", reject);
  transportServer.listen(0, "127.0.0.1", resolve);
});
const transportAddress = transportServer.address();
assert.ok(transportAddress && typeof transportAddress === "object");
const syntheticTransportBody = "synthetic multipart body\r\n";
const hostileCurlHome = path.join(temporaryRoot, "hostile-curl-home");
await fs.mkdir(hostileCurlHome, { mode: 0o700 });
await fs.writeFile(
  path.join(hostileCurlHome, ".curlrc"),
  'fail-early\nurl = "http://127.0.0.1:1/unwanted"\n',
  { mode: 0o600 }
);
try {
  await curlSmtpTransport({
    curlConfig: [
      "silent",
      "show-error",
      "fail-with-body",
      'request = "POST"',
      `url = "http://127.0.0.1:${transportAddress.port}/mail"`,
      'upload-file = "-"',
      ""
    ].join("\n"),
    rawMail: syntheticTransportBody,
    environment: {
      ...process.env,
      CURL_HOME: hostileCurlHome
    }
  });
} finally {
  await new Promise((resolve) => transportServer.close(resolve));
}
assert.equal(receivedTransportBody, syntheticTransportBody);
assert.equal(receivedTransportRequests, 1);

const tamperedMailPath = path.join(temporaryRoot, "tampered-welcome.eml");
await fs.writeFile(
  tamperedMailPath,
  rendered.eml.replace(
    "Subject: ",
    "Subject: =?UTF-8?B?RmFsc2NoZXIgQmV0cmVmZg==?=\r\nX-Original-"
  ),
  { mode: 0o600 }
);
await fs.chmod(tamperedMailPath, 0o600);
await safeRejection(
  () => executeWelcomeEmailSend({
    options: {
      ...previewOptions,
      mailFile: tamperedMailPath
    },
    ...executionContext,
    transport: async () => {},
    log: () => {}
  }),
  /bytegenau/u
);

const weakConfigPath = path.join(temporaryRoot, "weak-smtp.json");
await fs.writeFile(weakConfigPath, `${JSON.stringify(smtp)}\n`, { mode: 0o644 });
if (process.platform !== "win32") {
  await fs.chmod(weakConfigPath, 0o644);
  await safeRejection(
    () => executeWelcomeEmailSend({
      options: {
        ...previewOptions,
        smtpConfig: weakConfigPath
      },
      ...executionContext,
      transport: async () => {},
      log: () => {}
    }),
    /owner-only/u
  );
}

await fs.rm(temporaryRoot, { recursive: true, force: true });
console.log(
  "Gast-Willkommensmail-SMTP OK: Domain-Absender, TLS-Relay, prepared-Readback, "
  + "SMTP-gebundene 48h-Aktivierung und Reconciliation-Beleg sind gepinnt."
);
