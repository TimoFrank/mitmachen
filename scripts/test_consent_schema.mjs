import assert from "node:assert/strict";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const migrationName = "20260716131600_require_manual_transfer_consent_note.sql";
const migrationTimestamp = Number(migrationName.slice(0, 14));
assert.ok(
  migrationTimestamp > 20260716131500,
  "Die Einwilligungsregel muss nach der Activity-Hardening-Migration eingeordnet sein."
);

const schema = fs.readFileSync(new URL("supabase/schema.sql", projectRoot), "utf8");
const migration = fs.readFileSync(new URL(`supabase/migrations/${migrationName}`, projectRoot), "utf8");
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

for (const [label, sql] of [["Schema", schema], ["Migration", migration]]) {
  const normalized = compact(sql);
  assert.ok(
    normalized.includes("add constraint contacts_mitmachen_evidence_note_check"),
    `${label}: Die gemeinsame Nachweis-Constraint fehlt.`
  );
  assert.ok(
    normalized.includes(expectedEvidenceRule),
    `${label}: manual_transfer und verbal_confirmed müssen denselben Nachweis erzwingen.`
  );
  assert.ok(
    normalized.includes("create or replace function public.prepare_contact_consent_write()")
      && normalized.includes("new.mitmachen_consent_recorded_by := new.updated_by"),
    `${label}: Die erfassende Person muss bei jeder Einwilligungsänderung serverseitig aus updated_by übernommen werden.`
  );
  assert.ok(
    normalized.includes("contacts_prepare_mitmachen_consent_update")
      && normalized.includes("mitmachen_consent_effective_at > statement_timestamp()"),
    `${label}: Zukünftige Entscheidungszeitpunkte müssen durch den Datenbank-Trigger verhindert werden.`
  );
  assert.ok(
    normalized.includes("create or replace function public.log_contact_consent_changes()")
      && normalized.includes("security definer")
      && normalized.includes("contacts_log_mitmachen_consent_changes"),
    `${label}: Einwilligungsänderungen müssen transaktional und unabhängig vom Client protokolliert werden.`
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.log_contact_consent_changes\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    `${label}: Die Audit-Funktion darf nicht direkt aus Clientrollen aufgerufen werden.`
  );
}

const normalizedMigration = compact(migration);
assert.ok(
  normalizedMigration.includes("not valid"),
  "Die additive Migration muss vorhandene, noch nicht bereinigte manual_transfer-Zeilen tolerieren."
);
assert.doesNotMatch(
  schema.slice(schema.indexOf("add constraint contacts_mitmachen_evidence_note_check"), schema.indexOf(";", schema.indexOf("add constraint contacts_mitmachen_evidence_note_check")) + 1),
  /not\s+valid/i,
  "Neuinstallationen müssen den Nachweis-Constraint vollständig validieren."
);
assert.doesNotMatch(
  migration,
  /update\s+public\.contacts[\s\S]*mitmachen_consent_note/i,
  "Die Migration darf keinen Nachweisvermerk erfinden oder automatisch auffüllen."
);
assert.match(
  api,
  /changedFields\.filter\(\(field\)\s*=>\s*!field\.startsWith\("mitmachen_consent_"\)\)/,
  "Das API darf die bereits transaktional protokollierten Einwilligungsfelder nicht doppelt loggen."
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

console.log("Consent Schema Test OK: Nachweise, Zeitpunkte, Erfassende und transaktionale API-Aktivitäten sind abgesichert.");
