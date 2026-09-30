import fs from "node:fs/promises";
import crypto from "node:crypto";
import { adminError, adminFingerprint } from "./user-administration.mjs";

// Loaded only in explicitly enabled Google hosting. The OIDC target has no Google dependency.
export async function createAdminInvitationDelivery({ bucket, project, accessEnd, smtpFile, smtpPassword, transportFactory }) {
  const [invitation, guest, welcome, sender] = await Promise.all([
    import("../scripts/provision_pre_gematik_password_invitation.mjs"),
    import("../scripts/provision_pre_gematik_identity_platform_guest_access.mjs"),
    import("../scripts/render_pre_gematik_guest_welcome_email.mjs"),
    import("../scripts/send_pre_gematik_guest_welcome_email.mjs")
  ]);
  const smtp = sender.validateWelcomeEmailSmtpConfig(smtpFile ? JSON.parse(await fs.readFile(smtpFile, "utf8")) : { version: 1, host: sender.WELCOME_EMAIL_SMTP_HOST, port: sender.WELCOME_EMAIL_SMTP_PORT, security: sender.WELCOME_EMAIL_SMTP_SECURITY, username: welcome.WELCOME_EMAIL_SENDER_EMAIL, sender_email: welcome.WELCOME_EMAIL_SENDER_EMAIL, password: smtpPassword });
  const factory = transportFactory || (await import("nodemailer")).default.createTransport;
  const transport = factory({ host: smtp.host, port: smtp.port, secure: true,
    auth: { user: smtp.username, pass: smtp.password }, connectionTimeout: 15000, socketTimeout: 30000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
  const templates = await welcome.loadWelcomeEmailTemplates();
  async function check() {
    if (!Number.isFinite(Date.parse(accessEnd)) || Date.parse(accessEnd) - Date.now() < 5 * 60 * 1000) throw adminError(503, "Die aktuelle Zugangsfreigabe ist abgelaufen.");
    const [meta] = await bucket.getMetadata();
    if (!meta.iamConfiguration?.uniformBucketLevelAccess?.enabled || meta.iamConfiguration?.publicAccessPrevention !== "enforced") {
      throw adminError(503, "Der private Einladungsspeicher ist nicht sicher konfiguriert.");
    }
  }
  async function createOrVerify(name, record) {
    const file = bucket.file(name);
    try { await file.save(JSON.stringify(record), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: "application/json", cacheControl: "no-store" } }); }
    catch (error) {
      if (Number(error.code) !== 412) throw error;
      const [meta] = await file.getMetadata();
      const [raw] = await bucket.file(name, { generation: meta.generation }).download();
      if (adminFingerprint(JSON.parse(raw.toString())) !== adminFingerprint(record)) throw adminError(409, "Die vorhandene Einladung stimmt nicht mit diesem Vorgang überein.");
    }
  }
  return Object.freeze({ accessEnd, check,
    async prepare(row) {
      const account = { version: 1, project_id: project, uid: row.uid, email: row.input.email,
        display_name: row.input.name, email_ownership_verified: true, continue_url: "https://versorgungs-kompass.de/start" };
      const guestAccess = { version: 1, project_id: project, uid: row.uid, email: row.input.email, profile_id: row.profile_id,
        display_name: row.input.name, role: row.input.role, scope_ref: `external-pilot:managed-${row.id}` };
      const plan = guest.buildIdentityPlatformGuestProfileCreationPlan(guestAccess, [], [], []);
      const record = invitation.invitationRecord({ account, guestAccess, bindingStateFingerprint: plan.expectedStateFingerprint, preparedAt: new Date().toISOString() });
      const token = crypto.randomBytes(32).toString("base64url");
      const link = invitation.passwordInvitationLink(token);
      const rendered = await welcome.renderGuestWelcomeEmail({ document: account, actionUrl: link,
        senderName: welcome.WELCOME_EMAIL_SENDER_NAME, senderEmail: welcome.WELCOME_EMAIL_SENDER_EMAIL,
        pilotEnd: accessEnd, approvedPilotEnd: accessEnd, ...templates });
      sender.validateWelcomeEmailEml(rendered.eml);
      return { record, digest: invitation.passwordInvitationTokenDigest(token), eml: rendered.eml,
        subject: rendered.subject.trim(), recipient: account.email, accessEnd,
        fingerprint: adminFingerprint({ eml: rendered.eml, accessEnd }), previewText: rendered.text.replaceAll(link, "[Passwort festlegen]") };
    },
    async storePrepared(value) { await check(); await createOrVerify(`prepared/${value.digest}.json`, value.record); },
    async send(value) {
      await check();
      if (value.accessEnd !== accessEnd || value.fingerprint !== adminFingerprint({ eml: value.eml, accessEnd })) throw adminError(409, "Die Einladung passt nicht mehr zur Zugangsfrist.");
      const result = await transport.sendMail({ envelope: { from: welcome.WELCOME_EMAIL_SENDER_EMAIL, to: [value.recipient] }, raw: value.eml });
      if (result.accepted?.length !== 1 || String(result.accepted[0]).toLowerCase() !== value.recipient || result.rejected?.length) throw adminError(502, "SMTP-Annahme nicht bestätigt.");
      return new Date().toISOString();
    },
    async activate(value, acceptedAt) {
      const active = invitation.activatePasswordInvitationRecord(value.record, acceptedAt);
      await createOrVerify(`active/${value.digest}.json`, active);
    }
  });
}
