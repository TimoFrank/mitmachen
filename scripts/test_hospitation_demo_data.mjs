import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {}, console, URL, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync("frontend/data/demo-data.js", "utf8"), context);
vm.runInContext(fs.readFileSync("frontend/data/hospitation-model.js", "utf8"), context);

const data = context.window.VERSORGUNGS_COMPASS_DEMO_DATA;
const model = context.window.VersorgungsCompassHospitationModel;
const hospitations = data.hospitations || [];
const normalized = hospitations.map((item) => model.normalizeHospitationRecord(item));
const observations = normalized.flatMap((item) => item.observations);

const everyRecordId = [];
const externalUrls = new Set();
const visited = new WeakSet();
function inspectDemoValue(value, path = "demoData") {
  if (value && typeof value === "object") {
    if (visited.has(value)) return;
    visited.add(value);
    if (!Array.isArray(value) && Object.hasOwn(value, "id")) {
      everyRecordId.push({ path: `${path}.id`, value: String(value.id) });
    }
    Object.entries(value).forEach(([key, entry]) => inspectDemoValue(entry, `${path}.${key}`));
    return;
  }
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/https?:\/\/[^\s·"]+/g)) {
    externalUrls.add(match[0]);
  }
}
inspectDemoValue(data);

assert.ok(everyRecordId.length > 0, "Der Demo-Datensatz soll prüfbare Datensatz-IDs enthalten.");
everyRecordId.forEach(({ path, value }) => {
  assert.match(value, /^demo-/, `${path}: IDs im öffentlichen Datensatz müssen mit demo- beginnen.`);
});
assert.deepEqual(
  Array.from(data.profiles, (profile) => profile.id),
  ["demo-profile-admin", "demo-profile-editor", "demo-profile-viewer"],
  "Demo-Profile verwenden ausschließlich reservierte IDs."
);
data.profiles.forEach((profile) => {
  assert.match(profile.display_name, /^Demo /, `${profile.id}: Profilname muss eindeutig synthetisch sein.`);
  assert.match(profile.email, /@versorgungs-kompass\.example\.invalid$/, `${profile.id}: Profiladresse muss eine reservierte Testdomain verwenden.`);
  assert.match(profile.avatar_url, /\/public\/demo-profile-(admin|editor|viewer)\.svg$/, `${profile.id}: Profilbild muss ein lokales generisches Demo-Asset sein.`);
  assert.doesNotMatch(profile.avatar_url, /^https?:\/\//, `${profile.id}: externe Profilbilder sind nicht erlaubt.`);
});
assert.equal(new Set(data.contacts.map((contact) => contact.name)).size, data.contacts.length, "Demo-Kontaktnamen müssen eindeutig sein.");
data.contacts.forEach((contact) => {
  assert.match(contact.name, /^Demo-Kontakt \d{2}$/, `${contact.id}: Kontaktname muss eindeutig synthetisch sein.`);
  if (contact.email) assert.match(contact.email, /@example\.invalid$/, `${contact.id}: Kontaktadresse muss eine reservierte Testdomain verwenden.`);
  if (contact.image) {
    assert.match(contact.image, /\/public\/demo-profile-(admin|editor|viewer)\.svg$/, `${contact.id}: Kontaktbild muss ein lokales generisches Demo-Asset sein.`);
    assert.doesNotMatch(contact.image, /^https?:\/\//, `${contact.id}: externe Kontaktbilder sind nicht erlaubt.`);
  }
});
data.organizations.forEach((organization) => {
  assert.match(organization.name, /^Demo-/, `${organization.id}: Organisationsname muss eindeutig synthetisch sein.`);
  assert.match(organization.website, /^https:\/\/demo-org-[a-z0-9-]+\.example\.invalid$/, `${organization.id}: Website muss eine reservierte Testdomain verwenden.`);
  assert.match(organization.email, /@example\.invalid$/, `${organization.id}: Organisationsadresse muss eine reservierte Testdomain verwenden.`);
});
[...externalUrls].forEach((url) => {
  const hostname = new URL(url).hostname;
  assert.ok(
    hostname.endsWith(".example.invalid") || hostname === "example.invalid",
    `Nicht reservierte externe URL im öffentlichen Demo-Datensatz: ${url}`
  );
});
assert.doesNotMatch(JSON.stringify(data), /supabase\.co|profile-images|hospitation-avatars/i, "Öffentliche Demo darf keine externen Backend- oder Profilbildbezüge enthalten.");

assert.equal(hospitations.length, 13, "Der kuratierte Demo-Datensatz soll 13 unterschiedliche Hospitationen enthalten.");
assert.equal(observations.length, 39, "Jede Demo-Hospitation soll drei explizite Beobachtungen enthalten.");
assert.equal(data.hospitationSlots.length, 0, "Demo-Terminangebote bleiben leer.");
assert.equal(data.hospitationRoadmapAssessments.length, 0, "Roadmap-Bewertungen dürfen nicht Teil der Demo-Daten sein.");
assert.equal(data.hospitationUnmetNeeds.length, 0, "Abgeleitete Unmet Needs dürfen nicht Teil der Demo-Daten sein.");

const ids = new Set();
const observationTexts = new Set();
const startTimes = new Set();
const sectors = new Set();
const federalStates = new Set();

normalized.forEach((hospitation) => {
  assert.ok(!ids.has(hospitation.id), `Doppelte Hospitations-ID: ${hospitation.id}`);
  ids.add(hospitation.id);
  startTimes.add(String(hospitation.startsAt || ""));
  sectors.add(hospitation.sector);
  federalStates.add(hospitation.federalState);
  assert.equal(hospitation.documentation.quotes.length, 0, `${hospitation.id}: künstliche Zitate sind nicht vorgesehen.`);
  assert.equal(hospitation.documentation.mediaArtifacts.length, 0, `${hospitation.id}: künstliche Medienbelege sind nicht vorgesehen.`);
  assert.equal(hospitation.documentation.impulses.length, 0, `${hospitation.id}: Impulse gehören nicht in die Rohdokumentation.`);
  assert.equal(hospitation.documentation.affectedProducts.length, 0, `${hospitation.id}: Produktzuordnungen gehören nicht in die Rohdokumentation.`);
  assert.equal(Object.keys(hospitation.documentation.scores).length, 0, `${hospitation.id}: Scores dürfen nicht enthalten sein.`);
  assert.equal(hospitation.observations.length, 3, `${hospitation.id}: erwartet werden drei Beobachtungen.`);

  hospitation.observations.forEach((observation, index) => {
    assert.equal(observation.sequence, index + 1, `${observation.id}: Ablaufschritte müssen 1 bis 3 folgen.`);
    assert.ok(observation.observedAt, `${observation.id}: Zeitpunkt fehlt.`);
    assert.ok(observation.situation, `${observation.id}: Situation fehlt.`);
    assert.ok(observation.trigger, `${observation.id}: Auslöser fehlt.`);
    assert.ok(observation.description, `${observation.id}: konkrete Beobachtung fehlt.`);
    assert.ok(observation.actions.length >= 2, `${observation.id}: Handlungsschritte fehlen.`);
    assert.ok(observation.toolsAndDocuments.length >= 1, `${observation.id}: Systeme oder Dokumente fehlen.`);
    assert.ok(observation.immediateConsequence, `${observation.id}: unmittelbare Folge fehlt.`);
    assert.ok(observation.involvedRoles.length >= 1, `${observation.id}: beobachtete Rollen fehlen.`);
    assert.ok(observation.processPhase, `${observation.id}: Prozessphase fehlt oder ist ungültig.`);
    assert.ok(observation.problemType, `${observation.id}: Problemtyp fehlt oder ist ungültig.`);
    assert.ok(observation.impact, `${observation.id}: Auswirkung fehlt oder ist ungültig.`);
    assert.equal(observation.evidenceType, "synthetic_source_based", `${observation.id}: Quellenart muss transparent sein.`);
    assert.equal(observation.sourceType, "synthetic_demo_scenario", `${observation.id}: Quellenart muss als reines Demo-Szenario markiert sein.`);
    assert.match(observation.sourceReference, /^Synthetischer Demo-Quellenhinweis \d{2} · https:\/\/demo-source-\d{2}\.example\.invalid\//, `${observation.id}: reservierter Demo-Quellenbezug fehlt.`);
    assert.ok(observation.uncertainty, `${observation.id}: Unsicherheitsangabe fehlt.`);
    assert.equal(observation.relevanceScore, null, `${observation.id}: Relevanzscore darf nicht gesetzt sein.`);
    assert.equal(observation.usageRecommendation, "", `${observation.id}: Nutzungsempfehlung darf nicht gesetzt sein.`);
    assert.ok(!observationTexts.has(observation.description), `${observation.id}: Beobachtungstext ist nicht eindeutig.`);
    observationTexts.add(observation.description);
  });
});

assert.ok(startTimes.size >= 10, "Termine sollen unterschiedliche Uhrzeiten und Dauern abbilden.");
assert.ok(sectors.size >= 6, "Der Datensatz soll mehrere Versorgungssettings abdecken.");
assert.ok(federalStates.size >= 8, "Der Datensatz soll regional vielfältig sein, ohne Fälle zu duplizieren.");
assert.ok(observations.some((item) => item.problemType === "positives Muster / Best Practice"), "Auch funktionierende Abläufe müssen enthalten sein.");
assert.ok(observations.some((item) => item.problemType !== "positives Muster / Best Practice"), "Konkrete Reibungspunkte müssen enthalten sein.");

const aggregates = model.getDashboardAggregates(hospitations);
assert.equal(aggregates.total, 13);
assert.equal(aggregates.observationsTotal, 39);
assert.equal(aggregates.quotesTotal, 0);
assert.equal(aggregates.mediaArtifactsTotal, 0);
assert.equal(aggregates.impulsesTotal, 0);
assert.equal(aggregates.relevanceScoreAverage, null);
assert.equal(aggregates.documentationCompletenessAverage, 100);

console.log("Hospitations-Demo-Daten: 13 Fälle und 39 Observation-first-Beobachtungen geprüft.");
