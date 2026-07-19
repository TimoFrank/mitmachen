import assert from "node:assert/strict";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const migrationName = "20260716143001_add_format_participation_workflow.sql";
const schema = fs.readFileSync(new URL("supabase/schema.sql", projectRoot), "utf8");
const migration = fs.readFileSync(new URL(`supabase/migrations/${migrationName}`, projectRoot), "utf8");
const api = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
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

assert.match(dataService, /\/api\/formats\/\$\{encodeURIComponent\(formatId\)\}\/participants/, "Formatbeteiligungen müssen über das geschützte API geschrieben werden.");
assert.doesNotMatch(dataService, /recordLocalFormatParticipationEvent|\blocalStorage\b|(?:window\s*\.\s*)?supabase\b/, "Die Realanwendung darf Formatbeteiligungen nicht lokal oder direkt in der Datenbank führen.");
assert.match(app, /const contactFormatStatusOptions = \["Eingeladen", "Zugesagt", "Teilgenommen", "Abgesagt"\]/, "Alle vier fachlichen Beteiligungsstatus müssen im Profil verfügbar sein.");
assert.match(app, /data-format-profile-section/, "Der Kontaktüberblick benötigt einen Formate-Abschnitt.");
assert.match(app, /data-format-profile-link-form/, "Kontakte müssen im Profil mit vorhandenen Formaten verknüpft werden können.");
assert.match(app, /formatContactFilterId/, "Alle Formate muss einen vorausgewählten Kontaktfilter setzen.");

console.log("Format Participation Schema Test OK: Beziehung, Statuszeiten, Aktivitäten, RLS und Profilintegration sind abgesichert.");
