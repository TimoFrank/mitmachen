import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 5;
const EMAIL_LIMIT = 3;
const MAX_BODY_BYTES = 24_000;
const FORM_VERSION = "mitmachen-network-registration-v2";
const PROCESSING_CONSENT_VERSION = "network-registration-processing-v2-2026-07-11";
const CONTACT_CONSENT_VERSION = "network-registration-contact-v2-2026-07-11";
const PRIVACY_NOTICE_VERSION = "versorgungs-netzwerk-hinweis-v2-2026-07-11";

const PRIMARY_SYSTEM_TYPES = new Set(["", "PVS", "KIS", "AVS", "ZPVS", "LIS", "HVS", "PFLEGE", "SONSTIGES"]);
const ONBOARDING_STAGES = new Set(["registered", "profile_complete"]);
const ALLOWED_FIELDS = new Set([
  "submission_id", "submitted_at", "onboarding_stage", "title", "first_name", "last_name", "email",
  "professional_group", "role", "employment_status", "years_in_profession_band", "age_group",
  "organization", "sector", "postal_code", "city", "federal_state", "employee_count_band",
  "primary_system_type", "primary_system_vendor", "primary_system_product", "ti_applications",
  "participation_formats", "interest_topics", "message", "eligibility_confirmed_at",
  "consent_processing_version", "consent_processing_accepted_at", "consent_contact_version",
  "consent_contact_accepted_at", "privacy_notice_version", "form_version", "language", "source_url", "company"
]);

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maxLength) throw new RequestError("Eine Angabe ist länger als erlaubt.");
  return normalized;
}

function list(value: unknown, maxItems = 20, maxItemLength = 100) {
  if (value === undefined || value === null || value === "") return [];
  const items = Array.isArray(value) ? value : String(value).split(/\s*[,;|]\s*/);
  const normalized = [...new Set(items.map((item) => text(item, maxItemLength)).filter(Boolean))];
  if (normalized.length > maxItems) throw new RequestError("Es wurden zu viele Auswahlwerte übermittelt.");
  return normalized;
}

function requireEmail(value: unknown) {
  const email = text(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("Bitte geben Sie eine gültige E-Mail-Adresse an.");
  return email;
}

function optionalHttpsUrl(value: unknown) {
  const normalized = text(value, 500);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:") throw new Error("unsupported protocol");
    return url.href;
  } catch (_error) {
    throw new RequestError("Die Quellseite ist ungültig.");
  }
}

function clientAddress(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function hmacSha256(value: string) {
  const pepper = Deno.env.get("NETWORK_REGISTRATION_RATE_LIMIT_PEPPER") || "";
  if (!pepper) throw new RequestError("Die Registrierung ist vorübergehend nicht erreichbar.", 503);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeLimit(
  admin: any,
  fingerprint: string,
  limit: number,
  now: Date
) {
  const { data, error } = await admin.rpc("consume_network_registration_rate_limit", {
    p_fingerprint: fingerprint,
    p_window_cutoff: new Date(now.getTime() - WINDOW_MS).toISOString(),
    p_now: now.toISOString()
  });
  if (error) throw new RequestError("Die Registrierung ist vorübergehend nicht erreichbar.", 503);
  if (Number(data || 0) > limit) {
    throw new RequestError("Zu viele Versuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.", 429);
  }
}

function registrationPayload(body: Record<string, unknown>, now: Date) {
  const submissionId = text(body.submission_id, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(submissionId)) {
    throw new RequestError("Die Formular-ID ist ungültig. Bitte laden Sie die Seite neu.");
  }
  const firstName = text(body.first_name, 120);
  const lastName = text(body.last_name, 120);
  if (!firstName || !lastName) throw new RequestError("Vorname und Nachname sind erforderlich.");
  const email = requireEmail(body.email);

  if (!body.eligibility_confirmed_at) {
    throw new RequestError("Bitte bestätigen Sie die Teilnahmevoraussetzungen.");
  }
  const processingVersion = text(body.consent_processing_version, 120);
  const privacyVersion = text(body.privacy_notice_version, 120);
  const formVersion = text(body.form_version, 120);
  if (!body.consent_processing_accepted_at || !processingVersion || !privacyVersion || !formVersion) {
    throw new RequestError("Die notwendige Verarbeitung wurde nicht bestätigt.");
  }
  if (
    processingVersion !== PROCESSING_CONSENT_VERSION
    || privacyVersion !== PRIVACY_NOTICE_VERSION
    || formVersion !== FORM_VERSION
  ) {
    throw new RequestError("Das Formular wurde aktualisiert. Bitte laden Sie die Seite neu und bestätigen Sie die aktuellen Hinweise.");
  }

  const contactConsentVersion = text(body.consent_contact_version, 120);
  const contactConsentAccepted = Boolean(body.consent_contact_accepted_at);
  if (contactConsentAccepted && contactConsentVersion !== CONTACT_CONSENT_VERSION) {
    throw new RequestError("Das Formular wurde aktualisiert. Bitte laden Sie die Seite neu und bestätigen Sie die aktuellen Hinweise.");
  }
  const onboardingStage = text(body.onboarding_stage, 40) || "registered";
  if (!ONBOARDING_STAGES.has(onboardingStage)) throw new RequestError("Unbekannter Profilstatus.");

  const primarySystemType = text(body.primary_system_type, 24).toUpperCase();
  if (!PRIMARY_SYSTEM_TYPES.has(primarySystemType)) throw new RequestError("Unbekannter Primärsystem-Typ.");

  const postalCode = text(body.postal_code, 5);
  if (postalCode && !/^\d{5}$/.test(postalCode)) throw new RequestError("Bitte geben Sie eine gültige fünfstellige PLZ an.");

  return {
    submission_id: submissionId,
    submitted_at: now.toISOString(),
    status: "neu",
    onboarding_stage: onboardingStage,
    title: text(body.title, 80) || null,
    first_name: firstName,
    last_name: lastName,
    email,
    professional_group: text(body.professional_group, 180) || null,
    role: text(body.role, 180) || null,
    employment_status: text(body.employment_status, 80) || null,
    years_in_profession_band: text(body.years_in_profession_band, 80) || null,
    age_group: text(body.age_group, 40) || null,
    organization: text(body.organization, 240) || null,
    sector: text(body.sector, 120) || null,
    postal_code: postalCode || null,
    city: text(body.city, 160) || null,
    federal_state: text(body.federal_state, 80) || null,
    employee_count_band: text(body.employee_count_band, 40) || null,
    primary_system_type: primarySystemType || null,
    primary_system_vendor: text(body.primary_system_vendor, 180) || null,
    primary_system_product: text(body.primary_system_product, 180) || null,
    ti_applications: list(body.ti_applications),
    participation_formats: list(body.participation_formats),
    interest_topics: list(body.interest_topics),
    preferred_contact: "E-Mail",
    message: text(body.message, 3000) || null,
    eligibility_confirmed_at: now.toISOString(),
    consent_processing_version: PROCESSING_CONSENT_VERSION,
    consent_processing_accepted_at: now.toISOString(),
    consent_contact_version: contactConsentAccepted ? CONTACT_CONSENT_VERSION : null,
    consent_contact_accepted_at: contactConsentAccepted ? now.toISOString() : null,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    form_version: FORM_VERSION,
    email_confirmation_status: "pending",
    language: text(body.language, 12) || "de",
    source_url: optionalHttpsUrl(body.source_url),
    privacy_check_status: "bereit_zur_pruefung"
  };
}

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return response({ error: "Methode nicht unterstützt." }, 405);

    try {
      const contentLength = Number(req.headers.get("content-length") || 0);
      if (contentLength > MAX_BODY_BYTES) throw new RequestError("Die Anfrage ist zu groß.", 413);
      const body = await req.json().catch(() => {
        throw new RequestError("Die Anfrage konnte nicht gelesen werden.");
      });
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("Ungültige Anfrage.");
      if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_BODY_BYTES) {
        throw new RequestError("Die Anfrage ist zu groß.", 413);
      }
      const unknownFields = Object.keys(body).filter((field) => !ALLOWED_FIELDS.has(field));
      if (unknownFields.length) throw new RequestError("Die Anfrage enthält unbekannte Felder.");

      // Honeypot: answer neutrally so automated submissions gain no signal.
      if (text((body as Record<string, unknown>).company, 200)) return response({ ok: true }, 202);

      const now = new Date();
      const payload = registrationPayload(body as Record<string, unknown>, now);
      const admin: any = ctx.supabaseAdmin;
      const ipFingerprint = await hmacSha256(`network-registration:ip:${clientAddress(req)}`);
      const emailFingerprint = await hmacSha256(`network-registration:email:${payload.email}`);
      await consumeLimit(admin, ipFingerprint, IP_LIMIT, now);
      await consumeLimit(admin, emailFingerprint, EMAIL_LIMIT, now);

      const { error } = await admin.from("network_registrations").insert(payload);
      if (error) {
        if (error.code === "23505") return response({ ok: true, duplicate: true }, 200);
        console.error("network registration insert failed", { code: error.code, message: error.message });
        throw new RequestError("Die Registrierung konnte nicht gespeichert werden.", 503);
      }

      // Keep only recent, pseudonymized throttle data.
      await admin
        .from("network_registration_rate_limits")
        .delete()
        .lt("last_seen_at", new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString());

      return response({ ok: true }, 201);
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      const message = error instanceof RequestError
        ? error.message
        : "Die Registrierung ist vorübergehend nicht erreichbar.";
      if (!(error instanceof RequestError)) console.error("network registration failed", error);
      return response({ error: message }, status);
    }
  })
};
