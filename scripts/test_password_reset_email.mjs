import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  PASSWORD_RESET_EMAIL_ACCEPTED_RESPONSE,
  PASSWORD_RESET_EMAIL_BRAND_ASSETS,
  PASSWORD_RESET_EMAIL_SENDER_EMAIL,
  PASSWORD_RESET_EMAIL_SENDER_NAME,
  PASSWORD_RESET_EMAIL_SMTP_HOST,
  PASSWORD_RESET_EMAIL_SMTP_PORT,
  PASSWORD_RESET_EMAIL_SUBJECT,
  PASSWORD_RESET_EMAIL_TEMPLATE_ID,
  PasswordResetEmailDeliveryError,
  createPasswordResetEmailSender,
  renderPasswordResetEmail,
  validatePasswordResetActionUrl,
  validatePasswordResetSmtpPassword
} from "../api/password-reset-email.mjs";

const projectRoot = new URL("../", import.meta.url);
const htmlTemplateUrl = new URL(
  "config/pre-gematik/email/pre-gematik-password-reset.html",
  projectRoot
);
const textTemplateUrl = new URL(
  "config/pre-gematik/email/pre-gematik-password-reset.txt",
  projectRoot
);
const recipient = "person@example.org";
const smtpPassword = " SMTP passphrase 2026 ";
const actionCode = "syntheticPasswordActionCode1234567890";
const apiKey = `AIza${"a".repeat(35)}`;
const actionUrl =
  "https://versorgungs-kompass.de/konto/passwort-festlegen"
  + `?mode=resetPassword&oobCode=${actionCode}&apiKey=${apiKey}`
  + "&continueUrl=https%3A%2F%2Fversorgungs-kompass.de%2Fstart&lang=de";
const escapedActionUrl = actionUrl.replaceAll("&", "&amp;");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

assert.equal(validatePasswordResetActionUrl(actionUrl), actionUrl);
for (const invalidActionUrl of [
  actionUrl.replace("https://", "http://"),
  actionUrl.replace("versorgungs-kompass.de", "www.versorgungs-kompass.de"),
  actionUrl.replace("/konto/passwort-festlegen?", "/konto/passwort-festlegen/?"),
  `${actionUrl}#fragment`,
  `${actionUrl}&probe=1`,
  actionUrl.replace("mode=resetPassword&", ""),
  actionUrl.replace("mode=resetPassword", "mode=verifyEmail"),
  actionUrl.replace("lang=de", "lang=en"),
  actionUrl.replace(
    "continueUrl=https%3A%2F%2Fversorgungs-kompass.de%2Fstart",
    "continueUrl=https%3A%2F%2Fevil.example%2Fstart"
  ),
  actionUrl.replace(
    `mode=resetPassword&oobCode=${actionCode}`,
    `oobCode=${actionCode}&mode=resetPassword`
  ),
  actionUrl.replace(
    `oobCode=${actionCode}`,
    `oobCode=${actionCode}&oobCode=${actionCode}`
  ),
  actionUrl.replace(actionCode, "short"),
  `${actionUrl}\nBcc: attacker@example.invalid`,
  `https://user@versorgungs-kompass.de${new URL(actionUrl).pathname}${new URL(actionUrl).search}`
]) {
  assert.throws(
    () => validatePasswordResetActionUrl(invalidActionUrl),
    /Passwort-Reset-Link/u,
    `Nicht-kanonischer Link akzeptiert: ${invalidActionUrl.slice(0, 80)}`
  );
}

assert.equal(validatePasswordResetSmtpPassword(smtpPassword), smtpPassword);
for (const invalidPassword of [
  "short",
  `valid-looking\nsecret`,
  "x".repeat(129),
  ""
]) {
  assert.throws(
    () => validatePasswordResetSmtpPassword(invalidPassword),
    /SMTP-Passwort/u
  );
}
assert.throws(
  () => validatePasswordResetSmtpPassword(Buffer.from("not-a-string")),
  /SMTP-Passwort/u
);

const [htmlTemplate, textTemplate] = await Promise.all([
  readFile(htmlTemplateUrl, "utf8"),
  readFile(textTemplateUrl, "utf8")
]);
assert.match(htmlTemplate, /background:#062f75/u);
assert.match(htmlTemplate, /border-left:5px solid #00d95a/u);
assert.match(htmlTemplate, /@media only screen and \(max-width:480px\)/u);
assert.match(htmlTemplate, />Neues Passwort festlegen<\/a>/u);
assert.match(htmlTemplate, /Du hast das nicht angefordert\?/u);
assert.match(textTemplate, /Dein bisheriges Passwort bleibt unverändert\./u);
assert.equal((htmlTemplate.match(/\{\{ACTION_URL\}\}/gu) || []).length, 3);
assert.equal((textTemplate.match(/\{\{ACTION_URL\}\}/gu) || []).length, 1);
assert.doesNotMatch(htmlTemplate, /https?:\/\/|javascript:|data:|url\s*\(/iu);
assert.doesNotMatch(textTemplate, /https?:\/\/|javascript:|data:/iu);

assert.deepEqual(
  PASSWORD_RESET_EMAIL_BRAND_ASSETS.map((asset) => ({
    filename: asset.filename,
    cid: asset.cid,
    placeholder: asset.placeholder,
    sha256: asset.sha256
  })),
  [
    {
      filename: "versorgungs-kompass-mark-on-dark.png",
      cid: "vk-password-reset-versorgung@versorgungs-kompass.de",
      placeholder: "VERSORGUNG_MARK_CID",
      sha256: "1146b89160f29abc13080e11975dcccd4b4e1183c4268d097d1eeb987106e84e"
    },
    {
      filename: "stakeholder-mark-on-dark.png",
      cid: "vk-password-reset-stakeholder@versorgungs-kompass.de",
      placeholder: "STAKEHOLDER_MARK_CID",
      sha256: "5f5d3b0080b6c0da644f2317d221d3c359f0ae1d54bbf89073dc1dfc865ef863"
    },
    {
      filename: "hospitation-mark-on-dark.png",
      cid: "vk-password-reset-hospitation@versorgungs-kompass.de",
      placeholder: "HOSPITATION_MARK_CID",
      sha256: "9159b312cf94fdb0dc510ca79c32afb98ee3e4664a467693a31d6fea67527b42"
    },
    {
      filename: "formate-mark-on-dark.png",
      cid: "vk-password-reset-formate@versorgungs-kompass.de",
      placeholder: "FORMATE_MARK_CID",
      sha256: "47971e1f7804a23be8763d4e1ed179a819ed094d1083f35f690a8a53ea857138"
    }
  ]
);

for (const asset of PASSWORD_RESET_EMAIL_BRAND_ASSETS) {
  const source = await readFile(asset.url);
  assert.equal(sha256(source), asset.sha256);
  assert.deepEqual([...source.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal((htmlTemplate.match(new RegExp(`cid:\\{\\{${asset.placeholder}\\}\\}`, "gu")) || []).length, 1);
}

const rendered = await renderPasswordResetEmail({ actionUrl });
const renderedAgain = await renderPasswordResetEmail({ actionUrl });
assert.equal(rendered.subject, PASSWORD_RESET_EMAIL_SUBJECT);
assert.equal(rendered.html, renderedAgain.html);
assert.equal(rendered.text, renderedAgain.text);
assert.equal(rendered.attachments.length, 4);
assert.equal(rendered.text.includes(actionUrl), true);
assert.equal(rendered.html.includes(actionUrl), false, "HTML muss Query-Trenner escapen.");
assert.equal(rendered.html.split(escapedActionUrl).length - 1, 3);
assert.match(rendered.html, />Neues Passwort festlegen<\/a>/u);
assert.match(rendered.html, /#Mitmachen/u);
assert.match(rendered.text, /^#Mitmachen$/mu);
assert.doesNotMatch(rendered.html, /\{\{|\}\}/u);
assert.doesNotMatch(rendered.text, /\{\{|\}\}/u);
const htmlWithoutActionUrl = rendered.html.split(escapedActionUrl).join("");
assert.doesNotMatch(
  htmlWithoutActionUrl,
  /https?:\/\/|\/\/|javascript:|data:|url\s*\(/iu,
  "Die E-Mail darf keine externen Inhalte oder Tracker laden."
);
const imageSources = [...rendered.html.matchAll(/<img\s[^>]*src="([^"]+)"/giu)]
  .map((match) => match[1]);
assert.deepEqual(
  imageSources,
  PASSWORD_RESET_EMAIL_BRAND_ASSETS.map((asset) => `cid:${asset.cid}`)
);
assert.doesNotMatch(rendered.html, /\b(?:width|height)="1"/iu);
for (const [index, attachment] of rendered.attachments.entries()) {
  const asset = PASSWORD_RESET_EMAIL_BRAND_ASSETS[index];
  assert.deepEqual(Object.keys(attachment).sort(), [
    "cid",
    "content",
    "contentDisposition",
    "contentType",
    "filename"
  ]);
  assert.equal(attachment.filename, asset.filename);
  assert.equal(attachment.cid, asset.cid);
  assert.equal(attachment.contentType, "image/png");
  assert.equal(attachment.contentDisposition, "inline");
  assert.equal(Buffer.isBuffer(attachment.content), true);
  assert.equal(sha256(attachment.content), asset.sha256);
}

await assert.rejects(
  () => renderPasswordResetEmail({
    actionUrl,
    readFile: async (url, encoding) => {
      if (String(url) === String(htmlTemplateUrl)) {
        return htmlTemplate.replace(
          "</body>",
          '<img src="https://tracker.example/pixel.png" width="1" height="1" alt=""></body>'
        );
      }
      return readFile(url, encoding);
    }
  }),
  /nicht freigegebene Inhalte/u
);
await assert.rejects(
  () => renderPasswordResetEmail({
    actionUrl,
    readFile: async (url, encoding) => {
      if (String(url) === String(PASSWORD_RESET_EMAIL_BRAND_ASSETS[0].url)) {
        const changed = Buffer.from(await readFile(url));
        changed[changed.length - 1] ^= 1;
        return changed;
      }
      return readFile(url, encoding);
    }
  }),
  /Mailsignet/u
);

let transportOptions;
let sentMessage;
let sendCalls = 0;
const sendPasswordResetEmail = createPasswordResetEmailSender({
  smtpPassword,
  transportFactory(options) {
    transportOptions = options;
    return {
      async sendMail(message) {
        sendCalls += 1;
        sentMessage = message;
        return { accepted: [recipient], rejected: [], pending: [] };
      }
    };
  }
});
assert.deepEqual(transportOptions, {
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
});
const deliveryResult = await sendPasswordResetEmail({ recipient, actionUrl });
assert.equal(deliveryResult, PASSWORD_RESET_EMAIL_ACCEPTED_RESPONSE);
assert.deepEqual(deliveryResult, { accepted: true });
assert.equal(sendCalls, 1);
assert.deepEqual(sentMessage.from, {
  name: PASSWORD_RESET_EMAIL_SENDER_NAME,
  address: PASSWORD_RESET_EMAIL_SENDER_EMAIL
});
assert.deepEqual(sentMessage.replyTo, sentMessage.from);
assert.equal(sentMessage.to, recipient);
assert.deepEqual(sentMessage.envelope, {
  from: PASSWORD_RESET_EMAIL_SENDER_EMAIL,
  to: [recipient]
});
assert.equal(sentMessage.subject, PASSWORD_RESET_EMAIL_SUBJECT);
assert.equal(sentMessage.html, rendered.html);
assert.equal(sentMessage.text, rendered.text);
assert.equal(sentMessage.attachments.length, 4);
assert.deepEqual(sentMessage.headers, {
  "X-Versorgungs-Kompass-Template": PASSWORD_RESET_EMAIL_TEMPLATE_ID
});
assert.equal(sentMessage.disableFileAccess, true);
assert.equal(sentMessage.disableUrlAccess, true);
assert.equal(JSON.stringify(deliveryResult).includes(recipient), false);
assert.equal(JSON.stringify(deliveryResult).includes(actionCode), false);
assert.equal(JSON.stringify(deliveryResult).includes(smtpPassword), false);
assert.equal(JSON.stringify(sentMessage).includes(smtpPassword), false);

let rejectedCalls = 0;
const rejectDelivery = createPasswordResetEmailSender({
  smtpPassword,
  transportFactory: () => ({
    async sendMail() {
      rejectedCalls += 1;
      return { accepted: [], rejected: [recipient] };
    }
  })
});
await assert.rejects(
  () => rejectDelivery({ recipient, actionUrl }),
  (error) => {
    assert.equal(error instanceof PasswordResetEmailDeliveryError, true);
    assert.equal(error.message.includes(recipient), false);
    assert.equal(error.message.includes(actionCode), false);
    assert.equal(error.message.includes(smtpPassword), false);
    return true;
  }
);
assert.equal(rejectedCalls, 1);

const failedDelivery = createPasswordResetEmailSender({
  smtpPassword,
  transportFactory: () => ({
    async sendMail() {
      throw new Error(`private failure ${recipient} ${actionUrl} ${smtpPassword}`);
    }
  })
});
await assert.rejects(
  () => failedDelivery({ recipient, actionUrl }),
  (error) => {
    assert.equal(error instanceof PasswordResetEmailDeliveryError, true);
    assert.equal(error.cause, undefined);
    assert.equal(error.message.includes(recipient), false);
    assert.equal(error.message.includes(actionCode), false);
    assert.equal(error.message.includes(smtpPassword), false);
    return true;
  }
);

let invalidRecipientTransportCalls = 0;
const recipientGuard = createPasswordResetEmailSender({
  smtpPassword,
  transportFactory: () => ({
    async sendMail() {
      invalidRecipientTransportCalls += 1;
      return { accepted: [recipient] };
    }
  })
});
for (const invalidRecipient of [
  "Person@example.org",
  "person@example.org\nBcc: attacker@example.org",
  "person@localhost",
  "person..name@example.org"
]) {
  await assert.rejects(
    () => recipientGuard({ recipient: invalidRecipient, actionUrl }),
    /Empfängeradresse/u
  );
}
assert.equal(invalidRecipientTransportCalls, 0);

assert.throws(
  () => createPasswordResetEmailSender({
    smtpPassword,
    transportFactory: () => {
      throw new Error(`private ${smtpPassword}`);
    }
  }),
  (error) => {
    assert.equal(error.message.includes(smtpPassword), false);
    return /nicht erstellt/u.test(error.message);
  }
);

console.log("Passwort-Reset-E-Mail-Vertrag: OK");
