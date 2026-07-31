import assert from "node:assert/strict";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const schema = fs.readFileSync(new URL("deploy/postgres/pre-gematik/schema.sql", projectRoot), "utf8");
const migration = fs.readFileSync(
  new URL("deploy/postgres/pre-gematik/migrations/202607270002_add_contact_relationship_basis_and_ehc_consent.sql", projectRoot),
  "utf8"
);
const grants = fs.readFileSync(new URL("deploy/postgres/pre-gematik/grants.sql", projectRoot), "utf8");
const api = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const dataService = fs.readFileSync(new URL("frontend/data/data-service.js", projectRoot), "utf8");
const compact = (value) => String(value || "")
  .replace(/\s+/g, " ")
  .replace(/\s*([(),])\s*/g, "$1")
  .trim()
  .toLowerCase();
const expectedEvidenceRule = compact(`
  mitmachen_consent_source not in ('verbal_confirmed', 'manual_transfer')
  or length(btrim(coalesce(mitmachen_consent_note, ''))) > 0
`);

const normalizedSchema = compact(schema);
assert.ok(
  normalizedSchema.includes("constraint contacts_mitmachen_evidence_note_check"),
  "Cloud-SQL-Schema: Die gemeinsame Nachweis-Constraint fehlt."
);
assert.ok(
  normalizedSchema.includes(expectedEvidenceRule),
  "Cloud-SQL-Schema: manual_transfer und verbal_confirmed müssen denselben Nachweis erzwingen."
);

for (const [label, sql] of [["Cloud-SQL-Schema", schema], ["Cloud-SQL-Migration", migration]]) {
  const normalized = compact(sql);
  assert.ok(
    normalized.includes("create or replace function public.pre_gematik_prepare_contact_purpose_write()")
      && normalized.includes("new.mitmachen_consent_recorded_by := new.updated_by"),
    `${label}: Die erfassende Person muss bei jeder Einwilligungsänderung serverseitig aus updated_by übernommen werden.`
  );
  assert.ok(
    normalized.includes("contacts_pre_gematik_prepare_contact_purpose_update")
      && normalized.includes("mitmachen_consent_effective_at > statement_timestamp()"),
    `${label}: Zukünftige Entscheidungszeitpunkte müssen durch den Datenbank-Trigger verhindert werden.`
  );
  assert.ok(
    normalized.includes("create or replace function public.pre_gematik_log_contact_purpose_change()")
      && normalized.includes("security invoker")
      && normalized.includes("contacts_pre_gematik_log_contact_purpose_update"),
    `${label}: Einwilligungsänderungen müssen transaktional unter den Rechten der API-Laufzeitrolle protokolliert werden.`
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.pre_gematik_log_contact_purpose_change\(\)\s+from\s+public/i,
    `${label}: Die Audit-Funktion darf nicht über die PostgreSQL-PUBLIC-Rolle aufgerufen werden.`
  );
}

assert.doesNotMatch(
  schema.slice(schema.indexOf("constraint contacts_mitmachen_evidence_note_check"), schema.indexOf(";", schema.indexOf("constraint contacts_mitmachen_evidence_note_check")) + 1),
  /not\s+valid/i,
  "Neuinstallationen müssen den Nachweis-Constraint vollständig validieren."
);
assert.match(grants, /grant execute on function public\.pre_gematik_prepare_contact_purpose_write\(\) to :"runtime_role"/i);
assert.match(grants, /grant execute on function public\.pre_gematik_log_contact_purpose_change\(\) to :"runtime_role"/i);
assert.doesNotMatch(
  migration,
  /update\s+public\.contacts[\s\S]*mitmachen_consent_note/i,
  "Die Migration darf keinen Nachweisvermerk erfinden oder automatisch auffüllen."
);
assert.match(
  api,
  /changedFields\.filter\(\(field\)\s*=>\s*!CONTACT_PURPOSE_AUDIT_FIELDS\.has\(field\)\)/,
  "Das API darf die bereits transaktional protokollierten Einwilligungs- und Zweckfelder nicht doppelt loggen."
);
assert.match(
  dataService,
  /apiRequest\(`\/api\/contacts\/\$\{encodeURIComponent\(id\)\}`[\s\S]{0,180}?method:\s*"PATCH"/,
  "Einwilligungs- und Kontaktänderungen müssen über den geschützten API-Pfad geschrieben werden."
);
assert.doesNotMatch(
  dataService,
  /(?:window\s*\.\s*)?supabase\b|\.\s*from\s*\(|\blocalStorage\b|recordLocalConsentStatusEvent/,
  "Die Realanwendung darf weder Datenbankzugriffe noch lokale Einwilligungsprotokolle im Browser führen."
);

console.log("Consent Schema Test OK: Cloud-SQL-Nachweise, Zeitpunkte, Erfassende und transaktionale API-Aktivitäten sind abgesichert.");
