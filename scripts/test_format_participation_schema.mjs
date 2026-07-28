import assert from "node:assert/strict";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const migrationName = "20260716143001_add_format_participation_workflow.sql";
const consentMigrationName = "20260728040114_guard_format_invitation_consent.sql";
const preGematikMigrationName = "202607280001_add_format_participation_workflow.sql";
const schema = fs.readFileSync(new URL("supabase/schema.sql", projectRoot), "utf8");
const migration = fs.readFileSync(new URL(`supabase/migrations/${migrationName}`, projectRoot), "utf8");
const consentMigration = fs.readFileSync(
  new URL(`supabase/migrations/${consentMigrationName}`, projectRoot),
  "utf8"
);
const preGematikSchema = fs.readFileSync(
  new URL("deploy/postgres/pre-gematik/schema.sql", projectRoot),
  "utf8"
);
const preGematikMigration = fs.readFileSync(
  new URL(`deploy/postgres/pre-gematik/migrations/${preGematikMigrationName}`, projectRoot),
  "utf8"
);
const api = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const securityPolicy = fs.readFileSync(new URL("api/security-policy.mjs", projectRoot), "utf8");
const dataService = fs.readFileSync(new URL("frontend/data/data-service.js", projectRoot), "utf8");
const app = [
  fs.readFileSync(new URL("frontend/app/versorgungs-kompass.html", projectRoot), "utf8"),
  fs.readFileSync(new URL("frontend/app/versorgungs-kompass.js", projectRoot), "utf8")
].join("\n");

const compact = (value) => String(value || "")
  .replace(/\s+/g, " ")
  .replace(/\s*([(),])\s*/g, "$1")
  .trim()
  .toLowerCase();

for (const [label, sql] of [["Schema", schema], ["Migration", migration]]) {
  const normalized = compact(sql);
  for (const column of ["invited_at", "responded_at", "participated_at", "cancelled_at", "status_changed_at"]) {
    assert.ok(normalized.includes(column), `${label}: Statuszeitpunkt ${column} fehlt.`);
  }
  assert.ok(
    normalized.includes("create or replace function public.prepare_format_participation_write()")
      && normalized.includes("format_participants_prepare_workflow"),
    `${label}: Statuszeitpunkte müssen serverseitig vorbereitet werden.`
  );
  assert.ok(
    normalized.includes("create or replace function public.log_format_participation_status_change()")
      && normalized.includes("security definer")
      && normalized.includes("format_participants_log_status_change"),
    `${label}: Beteiligungsstatus müssen transaktional als Aktivitäten protokolliert werden.`
  );
  for (const eventKey of [
    "format.invitation.created",
    "format.invitation.accepted",
    "format.participation.recorded",
    "format.invitation.declined"
  ]) {
    assert.ok(normalized.includes(eventKey), `${label}: Aktivität ${eventKey} fehlt.`);
  }
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.log_format_participation_status_change\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    `${label}: Die privilegierte Triggerfunktion darf nicht direkt aufrufbar sein.`
  );
  assert.ok(
    normalized.includes("and updated_by =(select auth.uid())") || normalized.includes("and updated_by=(select auth.uid())"),
    `${label}: RLS muss die letzte Änderung an die authentifizierte Person binden.`
  );
}

assert.match(schema, /unique\s*\(\s*format_id\s*,\s*contact_id\s*\)/i, "Doppelte Kontakt-Format-Beziehungen müssen verhindert werden.");
assert.doesNotMatch(migration, /delete\s+from\s+public\.format_participants/i, "Die Migration darf bestehende Beziehungen nicht löschen.");
assert.match(migration, /update\s+public\.format_participants[\s\S]*status_changed_at/i, "Bestehende Teilnehmerdaten benötigen eine kompatible Zeitstempel-Ableitung.");

for (const field of ["invited_at", "responded_at", "participated_at", "cancelled_at", "status_changed_at"]) {
  assert.ok(api.includes(`"${field}"`), `Serververtrag enthält ${field} nicht.`);
}

for (const [label, sql] of [
  ["Supabase-Schema", schema],
  ["Supabase-Consent-Migration", consentMigration],
  ["Pre-gematik-Schema", preGematikSchema],
  ["Pre-gematik-Migration", preGematikMigration]
]) {
  assert.match(
    sql,
    /new\.invitation_status\s+in\s*\(\s*'Eingeladen'\s*,\s*'Zugesagt'\s*,\s*'Teilgenommen'\s*\)[\s\S]*mitmachen_consent_status\s*=\s*'granted'/i,
    `${label}: Eingeladen, Zugesagt und Teilgenommen müssen serverseitig eine gültige Mitmachen-Einwilligung voraussetzen.`
  );
  assert.match(
    sql,
    /format_participants_invitation_consent_check/i,
    `${label}: Der Consent-Guard braucht einen stabilen Constraint-/Fehlerbezeichner.`
  );
}

for (const [label, sql] of [
  ["Pre-gematik-Schema", preGematikSchema],
  ["Pre-gematik-Migration", preGematikMigration]
]) {
  const normalized = compact(sql);
  assert.ok(
    normalized.includes("create or replace function public.prepare_format_participation_write()")
      && normalized.includes("format_participants_prepare_workflow"),
    `${label}: Der Beteiligungsworkflow fehlt.`
  );
  assert.ok(
    normalized.includes("create or replace function public.log_format_participation_status_change()")
      && normalized.includes("format_participants_log_status_change"),
    `${label}: Das transaktionale Beteiligungsprotokoll fehlt.`
  );
  for (const eventKey of [
    "format.invitation.created",
    "format.invitation.accepted",
    "format.participation.recorded",
    "format.invitation.declined"
  ]) {
    assert.ok(normalized.includes(eventKey), `${label}: Aktivität ${eventKey} fehlt.`);
  }
}

assert.match(preGematikMigration, /^\s*begin\s*;/i, "Die Pre-gematik-Migration muss atomar beginnen.");
assert.match(preGematikMigration, /commit\s*;\s*$/i, "Die Pre-gematik-Migration muss atomar abschließen.");
assert.doesNotMatch(
  preGematikMigration,
  /alter\s+table\s+public\.formats\s+add\s+column/i,
  "Der direkte API-Rollout darf keine neue Pflichtspalte voraussetzen."
);
assert.match(api, /format-create:\$\{idempotencyKey\}/, "Formatanlage muss über einen transaktionalen Idempotenz-Lock serialisiert werden.");
assert.match(api, /sameFormatCreationIntent/, "Idempotente Replays müssen ihre fachliche Anlageabsicht prüfen.");
assert.match(api, /async function addFormatParticipantBatch/, "Der atomare Teilnehmer-Batch fehlt.");
assert.ok(api.includes("participants\\/batch$"), "Der atomare Teilnehmer-Batch muss eine eigene API-Route besitzen.");
assert.match(api, /FORMAT_INVITATION_CONSENT_REQUIRED/, "Die API benötigt einen maschinenlesbaren Consent-Konflikt.");
assert.match(api, /FORMAT_VERSION_CONFLICT/, "Formatänderungen benötigen einen maschinenlesbaren Versionskonflikt.");
assert.match(api, /FORMAT_PARTICIPANT_VERSION_CONFLICT/, "Teilnehmeränderungen benötigen einen maschinenlesbaren Versionskonflikt.");
assert.match(
  api,
  /if\s*\(PUBLIC_FORMAT_ERROR_CODES\.has\(error\.code\)\)\s*\{[\s\S]*payload\.blockedContactIds\s*=\s*error\.blockedContactIds;[\s\S]*payload\.details\s*=\s*error\.details;/,
  "Öffentliche Formatkonflikte müssen blockedContactIds und strukturierte details auch produktiv ausgeben."
);
assert.match(api, /sameParticipantImportIntent/, "Identische Import-Dubletten müssen ohne Schreibvorgang erkannt werden.");
assert.match(api, /FORMAT_PARTICIPANT_IMPORT_PRECONDITION_REQUIRED/, "Geänderte Bestandsimporte müssen einen Versionsstand verlangen.");
assert.match(api, /FORMAT_PARTICIPANT_IMPORT_VERSION_CONFLICT/, "Bestandsimporte benötigen einen maschinenlesbaren Versionskonflikt.");
assert.match(
  api,
  /body:\s*\{\s*invitation_status:\s*imported\.invitation_status,[\s\S]*updated_by:\s*userId,[\s\S]*updated_at:\s*imported\.updated_at\s*\}/,
  "Bestandsimporte dürfen nur fachliche Änderungsfelder schreiben und müssen den ursprünglichen Anlage-Akteur erhalten."
);
assert.match(api, /created_by:\s*userId/, "Neue Importbeziehungen müssen die anlegende Person persistieren.");
assert.match(api, /transitionFormatArchiveState/, "Archivieren und Wiederherstellen müssen explizite Fachaktionen sein.");
assert.ok(
  securityPolicy.includes("(?:archive|restore)")
    && securityPolicy.includes('"admin", "format.lifecycle.write"'),
  "Archivieren und Wiederherstellen müssen serverseitig Admin-Aktionen sein."
);

assert.match(dataService, /\/api\/formats\/\$\{encodeURIComponent\(formatId\)\}\/participants/, "Formatbeteiligungen müssen über das geschützte API geschrieben werden.");
assert.doesNotMatch(dataService, /recordLocalFormatParticipationEvent|\blocalStorage\b|(?:window\s*\.\s*)?supabase\b/, "Die Realanwendung darf Formatbeteiligungen nicht lokal oder direkt in der Datenbank führen.");
assert.match(app, /const contactFormatStatusOptions = \["Eingeladen", "Zugesagt", "Teilgenommen", "Abgesagt"\]/, "Alle vier fachlichen Beteiligungsstatus müssen im Profil verfügbar sein.");
assert.match(app, /data-format-profile-section/, "Der Kontaktüberblick benötigt einen Formate-Abschnitt.");
assert.match(app, /data-format-profile-link-form/, "Kontakte müssen im Profil mit vorhandenen Formaten verknüpft werden können.");
assert.match(app, /formatContactFilterId/, "Alle Formate muss einen vorausgewählten Kontaktfilter setzen.");

console.log("Format Participation Schema Test OK: Beziehung, Statuszeiten, Aktivitäten, RLS und Profilintegration sind abgesichert.");
