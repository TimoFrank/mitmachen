import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {}, console, URL, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync("frontend/data/demo-data.js", "utf8"), context);
vm.runInContext(fs.readFileSync("frontend/data/hospitation-model.js", "utf8"), context);

const data = context.window.VERSORGUNGS_COMPASS_DEMO_DATA;
const model = context.window.VersorgungsCompassHospitationModel;

assert.ok(data && typeof data === "object", "Der öffentliche Demo-Datensatz wurde nicht initialisiert.");
assert.ok(model, "Das Hospitationsmodell wurde nicht initialisiert.");

const expectedCounts = {
  profiles: 5,
  organizations: 55,
  contacts: 130,
  formats: 8,
  hospitationSlots: 6,
  hospitations: 28,
  hospitationObservations: 69,
  roadmapItems: 6,
  hospitationRoadmapAssessments: 12,
  hospitationUnmetNeeds: 8,
  expertGroups: 6,
  expertOrganizations: 18,
  expertContacts: 36,
  expertEntityLinks: 8,
  stakeholderTypes: 6,
  stakeholderOrganizations: 42,
  stakeholderPeople: 71,
  activityEvents: 72,
  changes: 40,
  notifications: 12,
  registrations: 10,
  contactNotes: 16,
  contactNoteAttachments: 4,
  savedViews: 4
};

for (const [collectionName, expectedCount] of Object.entries(expectedCounts)) {
  assert.ok(Array.isArray(data[collectionName]), `${collectionName} muss eine Liste sein.`);
  assert.equal(
    data[collectionName].length,
    expectedCount,
    `${collectionName}: erwartet werden ${expectedCount} kuratierte Demo-Datensätze.`
  );
}

const expectedStates = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen"
].sort((left, right) => left.localeCompare(right, "de"));

const expectedSectors = [
  "Apotheke",
  "Hebammen",
  "Hilfsmittel",
  "Krankenhaus",
  "Krankenkasse",
  "Labor",
  "Pflege",
  "Praxis",
  "Reha",
  "Rettungsdienst",
  "Sozialdienst",
  "Therapie",
  "ÖGD"
].sort((left, right) => left.localeCompare(right, "de"));

const stakeholderTypeIds = new Set([
  "kv",
  "health-insurance",
  "patient-associations",
  "hospital-associations",
  "physician-associations",
  "press"
]);

function unique(values) {
  return [...new Set(values)];
}

function sorted(values) {
  return unique(values).sort((left, right) => String(left).localeCompare(String(right), "de"));
}

function ids(rows) {
  return new Set(rows.map((row) => row.id));
}

function assertUniqueIds(collectionName, rows, { allowControlVocabulary = false } = {}) {
  const values = rows.map((row) => String(row?.id || ""));
  assert.equal(values.filter(Boolean).length, rows.length, `${collectionName}: jede Entität benötigt eine ID.`);
  assert.equal(new Set(values).size, values.length, `${collectionName}: IDs müssen eindeutig sein.`);
  for (const value of values) {
    if (allowControlVocabulary && stakeholderTypeIds.has(value)) continue;
    assert.match(value, /^demo-/, `${collectionName}: ${value} ist keine reservierte Demo-ID.`);
  }
}

for (const collectionName of Object.keys(expectedCounts)) {
  assertUniqueIds(collectionName, data[collectionName], {
    allowControlVocabulary: collectionName === "stakeholderTypes"
  });
}

const everyEntityId = [];
const externalUrls = new Set();
const visited = new WeakSet();
function inspectDemoValue(value, path = "demoData") {
  if (value && typeof value === "object") {
    if (visited.has(value)) return;
    visited.add(value);
    if (!Array.isArray(value) && Object.hasOwn(value, "id")) {
      everyEntityId.push({ path: `${path}.id`, value: String(value.id) });
    }
    Object.entries(value).forEach(([key, entry]) => inspectDemoValue(entry, `${path}.${key}`));
    return;
  }
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/https?:\/\/[^\s·"'<>),]+/g)) externalUrls.add(match[0]);
}
inspectDemoValue(data);

for (const { path, value } of everyEntityId) {
  if (/^demoData\.stakeholderTypes\.\d+\.id$/.test(path)) {
    assert.ok(stakeholderTypeIds.has(value), `${path}: unbekannte kontrollierte Stakeholder-ID ${value}.`);
  } else {
    assert.match(value, /^demo-/, `${path}: Entitäts-IDs müssen mit demo- beginnen.`);
  }
}

const approvedResearchHosts = new Set([
  "www.bundesaerztekammer.de",
  "www.bundesgesundheitsministerium.de",
  "www.destatis.de",
  "www.divi.de",
  "www.g-ba.de",
  "www.gematik.de",
  "www.gkv-spitzenverband.de",
  "www.kbv.de",
  "www.rki.de"
]);
for (const url of externalUrls) {
  const hostname = new URL(url).hostname.toLowerCase();
  assert.ok(
    hostname === "example.invalid"
      || hostname.endsWith(".example.invalid")
      || hostname === "example.test"
      || hostname.endsWith(".example.test")
      || approvedResearchHosts.has(hostname),
    `Nicht reservierte oder fachlich freigegebene externe URL im öffentlichen Datensatz: ${url}`
  );
}

const serializedData = JSON.stringify(data);
assert.match(serializedData, /synthetisch|fiktiv/i, "Der Demo-Datensatz muss seine synthetische Herkunft ausweisen.");
assert.doesNotMatch(
  serializedData,
  /supabase(?:\.co|-js|Url|AnonKey)|service[_-]?role|storage\/v1|profile-images|hospitation-avatars/i,
  "Der öffentliche Demo-Datensatz darf keine Backend-, Schlüssel- oder geschützten Assetbezüge enthalten."
);

for (const email of serializedData.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
  assert.match(email, /@(?:[a-z0-9-]+\.)*example\.(?:invalid|test)$/i, `Nicht reservierte Demo-E-Mail: ${email}`);
}

const visibleDemoLabel = /(?:^|[\s-])demo(?:$|[\s-])/i;
for (const profile of data.profiles) {
  assert.doesNotMatch(profile.display_name, visibleDemoLabel, `${profile.id}: Profilname darf keine Demo-Kennzeichnung tragen.`);
  assert.doesNotMatch(profile.team, visibleDemoLabel, `${profile.id}: Teamname darf keine Demo-Kennzeichnung tragen.`);
  assert.match(profile.email, /@versorgungs-kompass\.example\.invalid$/, `${profile.id}: Profiladresse muss reserviert sein.`);
  assert.match(profile.avatar_url, /\/public\/demo-profile-(?:admin|editor|viewer)\.svg$/, `${profile.id}: Profilbild muss ein lokales generisches Demo-Asset sein.`);
}
for (const collectionName of [
  "organizations",
  "contacts",
  "expertGroups",
  "expertOrganizations",
  "expertContacts",
  "stakeholderOrganizations",
  "stakeholderPeople"
]) {
  for (const row of data[collectionName]) {
    const label = row.name || row.display_name || row.label || "";
    assert.doesNotMatch(label, visibleDemoLabel, `${collectionName}/${row.id}: sichtbarer Name darf keine Demo-Kennzeichnung tragen.`);
  }
}
for (const registration of data.registrations) {
  assert.equal(registration.privacyCheckStatus || registration.privacy_check_status, "synthetic_demo", `${registration.id}: Registrierung ist nicht als synthetisch markiert.`);
  assert.doesNotMatch(registration.firstName || registration.first_name || "", visibleDemoLabel, `${registration.id}: Vorname darf keine Demo-Kennzeichnung tragen.`);
  assert.doesNotMatch(registration.lastName || registration.last_name || "", visibleDemoLabel, `${registration.id}: Nachname darf keine Demo-Kennzeichnung tragen.`);
  assert.doesNotMatch(registration.organization || "", visibleDemoLabel, `${registration.id}: Organisationsname darf keine Demo-Kennzeichnung tragen.`);
  assert.ok(registration.consentProcessingAcceptedAt, `${registration.id}: verpflichtende Datenschutz-Einwilligung fehlt.`);
}
assert.ok(data.registrations.some((registration) => registration.consentContactAcceptedAt), "Registrierungen mit optionaler Kontakt-Einwilligung fehlen.");
assert.ok(data.registrations.some((registration) => !registration.consentContactAcceptedAt), "Registrierungen ohne optionale Kontakt-Einwilligung fehlen.");
for (const event of data.activityEvents) {
  assert.equal(event.metadata?.synthetic, true, `${event.id}: Aktivitätsmetadaten müssen synthetic=true setzen.`);
}

assert.deepEqual(sorted(data.organizations.map((row) => row.state)), expectedStates, "Organisationen müssen alle 16 Bundesländer abdecken.");
assert.deepEqual(sorted(data.contacts.map((row) => row.state)), expectedStates, "Kontakte müssen alle 16 Bundesländer abdecken.");
assert.deepEqual(sorted(data.organizations.map((row) => row.sector)), expectedSectors, "Organisationen müssen die 13 freigegebenen Sektoren abdecken.");
assert.deepEqual(sorted(data.contacts.map((row) => row.category)), expectedSectors, "Kontakte müssen die 13 freigegebenen Sektoren abdecken.");

const profileIds = ids(data.profiles);
const organizationIds = ids(data.organizations);
const contactIds = ids(data.contacts);
const formatIds = ids(data.formats);
const hospitationIds = ids(data.hospitations);
const roadmapItemIds = ids(data.roadmapItems);
const expertGroupIds = ids(data.expertGroups);
const expertOrganizationIds = ids(data.expertOrganizations);
const expertContactIds = ids(data.expertContacts);
const stakeholderOrganizationIds = ids(data.stakeholderOrganizations);
const noteIds = ids(data.contactNotes);
const savedViewIds = ids(data.savedViews);
const organizationById = new Map(data.organizations.map((organization) => [organization.id, organization]));
const formatById = new Map(data.formats.map((format) => [format.id, format]));
const hospitationById = new Map(data.hospitations.map((hospitation) => [hospitation.id, hospitation]));
const expertOrganizationById = new Map(data.expertOrganizations.map((organization) => [organization.id, organization]));

for (const organization of data.organizations) {
  for (const system of organization.primarySystems || []) {
    assert.match(system.id, /^demo-primary-system-/, `${organization.id}: Primärsystem benötigt eine Demo-ID.`);
    assert.equal(system.organizationId, organization.id, `${system.id}: Primärsystem verweist auf eine andere Organisation.`);
    assert.ok(system.systemType && system.vendorName && system.productName, `${system.id}: Primärsystem ist fachlich unvollständig.`);
  }
}
assert.equal(organizationById.get("demo-org-pleisse-zahn")?.primarySystems?.[0]?.systemType, "ZPVS", "Zahn-MVZ benötigt ein Zahn-PVS.");
assert.equal(organizationById.get("demo-org-radiologie-elbufer")?.primarySystems?.[0]?.systemType, "SONSTIGES", "Radiologie benötigt ein als RIS/PACS bezeichnetes Fachsystem.");
assert.match(organizationById.get("demo-org-radiologie-elbufer")?.primarySystems?.[0]?.productName || "", /RIS\/PACS/, "Radiologisches Fachsystem muss RIS/PACS sichtbar benennen.");
assert.equal(organizationById.get("demo-org-saar-asv")?.primarySystems?.[0]?.systemType, "SONSTIGES", "ASV-Team benötigt eine Koordinationsplattform statt eines gemeinsamen PVS.");
assert.match(organizationById.get("demo-org-saar-asv")?.primarySystems?.[0]?.productName || "", /Koordinationsplattform/, "ASV-Fachsystem muss den Koordinationszweck sichtbar benennen.");
assert.ok(data.organizations.filter((organization) => organization.sector === "Hebammen").every((organization) => organization.primarySystems?.[0]?.systemType === "HVS"), "Hebammenorganisationen benötigen HVS statt PVS.");

const consentStatuses = new Set(["granted", "not_requested", "declined", "withdrawn", "clarification_needed"]);
const consentSources = new Set(["online_form", "email", "written", "verbal_confirmed", "manual_transfer"]);
const relationshipBases = new Set([
  "review_required",
  "public_task",
  "self_submitted",
  "active_collaboration",
  "verbal_contact",
  "public_professional_source"
]);
const ehcConsentSources = new Set([...consentSources, "survalyzer_ehc"]);
for (const contact of data.contacts) {
  assert.ok(organizationIds.has(contact.organizationId), `${contact.id}: unbekannte Organisation ${contact.organizationId}.`);
  const organization = organizationById.get(contact.organizationId);
  assert.equal(contact.organization, organization?.name, `${contact.id}: Organisationsbezeichnung stimmt nicht mit der Referenz überein.`);
  assert.equal(contact.category, organization?.sector, `${contact.id}: Sektor stimmt nicht mit der Organisation überein.`);
  assert.equal(contact.postalCode, organization?.postalCode, `${contact.id}: Postleitzahl stimmt nicht mit der Organisation überein.`);
  assert.equal(contact.city, organization?.city, `${contact.id}: Ort stimmt nicht mit der Organisation überein.`);
  assert.equal(contact.state, organization?.state, `${contact.id}: Bundesland stimmt nicht mit der Organisation überein.`);
  if (Number.isFinite(contact.lat) && Number.isFinite(contact.lon)) {
    assert.ok(Math.abs(contact.lat - organization.lat) < 0.2, `${contact.id}: Breitengrad liegt nicht bei der verknüpften Organisation.`);
    assert.ok(Math.abs(contact.lon - organization.lon) < 0.2, `${contact.id}: Längengrad liegt nicht bei der verknüpften Organisation.`);
  }
  for (const ownerId of contact.ownerIds || []) assert.ok(profileIds.has(ownerId), `${contact.id}: unbekannter Owner ${ownerId}.`);
  if (contact.ownerId) assert.ok((contact.ownerIds || []).includes(contact.ownerId), `${contact.id}: Haupt-Owner fehlt in ownerIds.`);
  assert.ok(Array.isArray(contact.themes) && contact.themes.length >= 2, `${contact.id}: realitätsnahe Versorgungsthemen fehlen.`);
  assert.ok(relationshipBases.has(contact.relationshipBasis), `${contact.id}: ungültige Beziehungsgrundlage.`);
  if (contact.relationshipBasis !== "review_required") {
    assert.ok(contact.relationshipBasisEffectiveAt, `${contact.id}: Zeitpunkt der Beziehungsgrundlage fehlt.`);
    assert.ok(profileIds.has(contact.relationshipBasisRecordedBy), `${contact.id}: erfassende Person der Beziehungsgrundlage fehlt.`);
    assert.ok(contact.relationshipBasisNote, `${contact.id}: Nachweis zur Beziehungsgrundlage fehlt.`);
  }
  assert.ok(consentStatuses.has(contact.mitmachenConsentStatus), `${contact.id}: ungültiger Einwilligungsstatus.`);
  if (contact.mitmachenConsentStatus === "granted") {
    assert.ok(new Date(contact.mitmachenConsentEffectiveAt).getTime() <= new Date("2026-07-25T23:59:59.999Z").getTime(), `${contact.id}: Einwilligungszeitpunkt fehlt oder liegt in der Zukunft.`);
    assert.ok(consentSources.has(contact.mitmachenConsentSource), `${contact.id}: Einwilligungsquelle fehlt.`);
    assert.ok(profileIds.has(contact.mitmachenConsentRecordedBy), `${contact.id}: erfassende Person der Einwilligung fehlt.`);
    assert.ok(contact.mitmachenConsentTextVersion, `${contact.id}: Einwilligungstextversion fehlt.`);
    if (["verbal_confirmed", "manual_transfer"].includes(contact.mitmachenConsentSource)) {
      assert.ok(contact.mitmachenConsentNote, `${contact.id}: manueller oder mündlicher Nachweis benötigt einen Vermerk.`);
    }
  }
  if (["declined", "withdrawn"].includes(contact.mitmachenConsentStatus)) {
    assert.ok(contact.mitmachenConsentEffectiveAt, `${contact.id}: Entscheidungszeitpunkt fehlt.`);
  }
  assert.ok(consentStatuses.has(contact.ehcConsentStatus), `${contact.id}: ungültiger EHC-Einwilligungsstatus.`);
  if (contact.ehcConsentStatus === "granted") {
    assert.ok(new Date(contact.ehcConsentEffectiveAt).getTime() <= new Date("2026-07-25T23:59:59.999Z").getTime(), `${contact.id}: EHC-Einwilligungszeitpunkt fehlt oder liegt in der Zukunft.`);
    assert.ok(ehcConsentSources.has(contact.ehcConsentSource), `${contact.id}: EHC-Einwilligungsquelle fehlt.`);
    assert.ok(profileIds.has(contact.ehcConsentRecordedBy), `${contact.id}: erfassende Person der EHC-Einwilligung fehlt.`);
    assert.ok(contact.ehcConsentTextVersion, `${contact.id}: EHC-Einwilligungstextversion fehlt.`);
    if (["verbal_confirmed", "manual_transfer"].includes(contact.ehcConsentSource)) {
      assert.ok(contact.ehcConsentNote, `${contact.id}: manueller oder mündlicher EHC-Nachweis benötigt einen Vermerk.`);
    }
  }
  if (["declined", "withdrawn"].includes(contact.ehcConsentStatus)) {
    assert.ok(contact.ehcConsentEffectiveAt, `${contact.id}: EHC-Entscheidungszeitpunkt fehlt.`);
  }
}
const consentStatusCounts = data.contacts.reduce((counts, contact) => {
  counts[contact.mitmachenConsentStatus] = (counts[contact.mitmachenConsentStatus] || 0) + 1;
  return counts;
}, {});
for (const status of consentStatuses) assert.ok(consentStatusCounts[status] > 0, `Einwilligungsstatus ${status} fehlt im Datensatz.`);
assert.equal(consentStatusCounts.granted, 9, "Die neun Einwilligungsaktivitäten müssen neun erteilten Kontakt-Snapshots entsprechen.");
const consentEvents = data.activityEvents.filter((event) => event.eventKey === "contact.consent.granted");
assert.equal(consentEvents.length, 9, "Es werden neun Einwilligungsaktivitäten erwartet.");
for (const event of consentEvents) {
  const contact = data.contacts.find((entry) => entry.id === event.contactId);
  assert.equal(contact?.mitmachenConsentStatus, "granted", `${event.id}: Aktivität widerspricht dem Kontakt-Snapshot.`);
  assert.equal(event.occurredAt, contact.mitmachenConsentEffectiveAt, `${event.id}: Aktivitäts- und Einwilligungszeitpunkt müssen übereinstimmen.`);
  assert.equal(event.changes?.[0]?.fieldName, "mitmachen_consent_status", `${event.id}: falsches Änderungsfeld.`);
}
const onlineMitmachenContact = data.contacts.find((contact) => contact.id === "demo-contact-08");
assert.equal(onlineMitmachenContact?.relationshipBasis, "self_submitted", "Der Onlinefall muss als Selbstregistrierung dokumentiert sein.");
assert.equal(onlineMitmachenContact?.mitmachenConsentStatus, "granted", "Der Onlinefall benötigt eine grüne #Mitmachen-Einwilligung.");
assert.equal(onlineMitmachenContact?.mitmachenConsentSource, "online_form", "Der Onlinefall benötigt das Formular als Quelle.");
assert.ok(onlineMitmachenContact?.mitmachenConsentTextVersion, "Der Onlinefall benötigt eine Textversion.");

const verbalMitmachenContact = data.contacts.find((contact) => contact.id === "demo-contact-32");
assert.equal(verbalMitmachenContact?.relationshipBasis, "verbal_contact", "Der mündliche Fall muss als persönlicher Kontakt dokumentiert sein.");
assert.equal(verbalMitmachenContact?.mitmachenConsentStatus, "granted", "Der mündliche Fall benötigt eine erteilte #Mitmachen-Einwilligung.");
assert.equal(verbalMitmachenContact?.mitmachenConsentSource, "verbal_confirmed", "Der mündliche Fall benötigt die mündliche Quelle.");
assert.match(verbalMitmachenContact?.mitmachenConsentNote || "", /schriftlich|nachfass/i, "Der mündliche Fall muss auf das schriftliche Nachfassen hinweisen.");

const clarificationContact = data.contacts.find((contact) => contact.id === "demo-contact-05");
assert.equal(clarificationContact?.relationshipBasis, "review_required", "Der Klärfall benötigt eine zu prüfende Beziehungsgrundlage.");
assert.equal(clarificationContact?.mitmachenConsentStatus, "clarification_needed", "Der Klärfall benötigt den gelben Einwilligungsstatus.");
assert.ok(clarificationContact?.mitmachenConsentNote, "Der Klärfall benötigt einen kurzen Prüfvermerk.");

const undocumentedLegacyContact = data.contacts.find((contact) => contact.id === "demo-contact-04");
assert.equal(undocumentedLegacyContact?.relationshipBasis, "review_required", "Der undokumentierte Altbestand muss standardmäßig geprüft werden.");
for (const field of [
  "relationshipBasisEffectiveAt",
  "relationshipBasisRecordedBy",
  "relationshipBasisNote",
  "mitmachenConsentEffectiveAt",
  "mitmachenConsentSource",
  "mitmachenConsentTextVersion",
  "mitmachenConsentRecordedBy",
  "mitmachenConsentNote",
  "ehcConsentEffectiveAt",
  "ehcConsentSource",
  "ehcConsentTextVersion",
  "ehcConsentRecordedBy",
  "ehcConsentNote"
]) {
  assert.equal(undocumentedLegacyContact?.[field], "", `Der undokumentierte Altbestand darf ${field} nicht vortäuschen.`);
}
assert.equal(undocumentedLegacyContact?.mitmachenConsentStatus, "not_requested");
assert.equal(undocumentedLegacyContact?.ehcConsentStatus, "not_requested");

const ehcOnlyContact = data.contacts.find((contact) => contact.id === "demo-contact-76");
assert.equal(ehcOnlyContact?.ehcConsentStatus, "granted", "Der EHC-only-Fall benötigt eine erteilte EHC-Einwilligung.");
assert.equal(ehcOnlyContact?.ehcConsentSource, "survalyzer_ehc", "Der EHC-only-Fall benötigt Survalyzer EHC als Quelle.");
assert.ok(ehcOnlyContact?.ehcConsentEffectiveAt, "Der EHC-only-Fall benötigt einen Wirksamkeitszeitpunkt.");
assert.ok(ehcOnlyContact?.ehcConsentTextVersion, "Der EHC-only-Fall benötigt eine Textversion.");
assert.ok(profileIds.has(ehcOnlyContact?.ehcConsentRecordedBy), "Der EHC-only-Fall benötigt eine erfassende Person.");
assert.ok(ehcOnlyContact?.ehcConsentNote, "Der EHC-only-Fall benötigt einen Nachweisvermerk.");
assert.notEqual(ehcOnlyContact?.mitmachenConsentStatus, "granted", "EHC-only darf keine #Mitmachen-Einwilligung vortäuschen.");
assert.deepEqual(
  sorted(data.contacts.flatMap((contact) => contact.ownerIds || [])),
  sorted(data.profiles.map((profile) => profile.id)),
  "Alle fünf Demo-Profile müssen als Owner im Kontaktdatensatz vorkommen."
);
assert.ok(data.contacts.some((contact) => (contact.ownerIds || []).length > 1), "Mindestens ein Kontakt benötigt mehrere Owner.");
assert.ok(data.contacts.some((contact) => !(contact.ownerIds || []).length), "Ein unzugeordneter Kontakt wird für die Pflege-Queue benötigt.");
const contactCountsByOrganization = new Map(data.organizations.map((organization) => [organization.id, 0]));
data.contacts.forEach((contact) => contactCountsByOrganization.set(contact.organizationId, (contactCountsByOrganization.get(contact.organizationId) || 0) + 1));
const organizationContactCounts = [...contactCountsByOrganization.values()];
assert.ok(organizationContactCounts.every((count) => count >= 1), "Jede Versorgungsorganisation benötigt mindestens eine fachlich passende Ansprechperson.");
assert.ok(organizationContactCounts.some((count) => count >= 4), "Größere Organisationen benötigen mehrere Ansprechpersonen.");
assert.ok(new Set(organizationContactCounts).size >= 4, "Kontaktzahlen je Organisation dürfen nicht schematisch gleich verteilt sein.");

const contactRolesForOrganization = (organizationId) => data.contacts
  .filter((contact) => contact.organizationId === organizationId)
  .map((contact) => contact.contactRole);
const specialtiesForOrganization = (organizationId) => data.contacts
  .filter((contact) => contact.organizationId === organizationId)
  .map((contact) => contact.specialty)
  .filter(Boolean);
assert.ok(contactRolesForOrganization("demo-org-pleisse-zahn").some((role) => /Zahn/i.test(role)), "Zahn-MVZ benötigt zahnmedizinische Rollen.");
assert.ok(contactRolesForOrganization("demo-org-havel-psych").some((role) => /Psychotherapeut/i.test(role)), "Psychotherapiepraxis benötigt psychotherapeutische Rollen.");
assert.ok(contactRolesForOrganization("demo-org-elbe-sapv").some((role) => /Palliativ|SAPV/i.test(role)), "SAPV-Team benötigt palliativmedizinische Rollen.");
assert.ok(contactRolesForOrganization("demo-org-harzpraxis").some((role) => /Nephrolog|Dialyse/i.test(role)), "Dialysezentrum benötigt nephrologische Rollen.");
assert.ok(contactRolesForOrganization("demo-org-radiologie-elbufer").some((role) => /Radiolog|MTR|Befund/i.test(role)), "Radiologiezentrum benötigt radiologische Rollen.");
assert.ok(contactRolesForOrganization("demo-org-elbe-sapv").some((role) => /Koordination/i.test(role)), "SAPV-Team benötigt eine operative Koordination.");
assert.ok(contactRolesForOrganization("demo-org-harzpraxis").some((role) => /Dialysefachpflege/i.test(role)), "Dialysezentrum benötigt Dialysefachpflege.");
assert.ok(contactRolesForOrganization("demo-org-saar-asv").some((role) => /ASV-Koordination/i.test(role)), "ASV-Team benötigt eine operative Koordination.");
assert.ok(contactRolesForOrganization("demo-org-allgaeu-pflege").some((role) => /Pflegefachperson/i.test(role)), "Kurzzeitpflege benötigt eine Pflegefachperson.");
assert.ok(contactRolesForOrganization("demo-org-nordseepflege").some((role) => /Pflegefachperson/i.test(role)), "Tagespflege benötigt eine Pflegefachperson.");
assert.ok(specialtiesForOrganization("demo-org-havel-psych").includes("Psychologische Psychotherapie"), "Psychotherapiepraxis benötigt eine passende Fachrichtung.");
assert.ok(specialtiesForOrganization("demo-org-elbe-sapv").includes("Palliativmedizin"), "SAPV-Team benötigt Palliativmedizin als Fachrichtung.");
assert.ok(specialtiesForOrganization("demo-org-harzpraxis").includes("Nephrologie"), "Dialysezentrum benötigt Nephrologie als Fachrichtung.");
assert.ok(specialtiesForOrganization("demo-org-saar-asv").includes("Rheumatologie"), "ASV-Team benötigt Rheumatologie als Fachrichtung.");
assert.ok(specialtiesForOrganization("demo-org-pleisse-zahn").includes("Zahnmedizin"), "Zahn-MVZ benötigt Zahnmedizin als Fachrichtung.");

const normalizedHospitations = data.hospitations.map((item) => model.normalizeHospitationRecord(item));
const normalizedObservations = normalizedHospitations.flatMap((item) => item.observations);
assert.equal(normalizedObservations.length, 69, "Die 28 Hospitationen müssen 69 strukturierte Beobachtungen enthalten.");
assert.deepEqual(
  sorted(normalizedObservations.map((item) => item.id)),
  sorted(data.hospitationObservations.map((item) => item.id)),
  "Top-Level-Beobachtungen und Hospitationsdokumentationen müssen dieselben 69 Beobachtungen enthalten."
);
const documentedObservationCounts = normalizedHospitations
  .filter((item) => item.status === "Dokumentiert")
  .map((item) => item.observations.length);
assert.deepEqual([...new Set(documentedObservationCounts)].sort((a, b) => a - b), [2, 3, 4], "Dokumentierte Hospitationen benötigen realistisch variierende Beobachtungszahlen.");

for (const hospitation of data.hospitations) {
  assert.ok(contactIds.has(hospitation.contactId), `${hospitation.id}: unbekannter Kontakt ${hospitation.contactId}.`);
  assert.ok(organizationIds.has(hospitation.organizationId), `${hospitation.id}: unbekannte Organisation ${hospitation.organizationId}.`);
  assert.ok(profileIds.has(hospitation.ownerId), `${hospitation.id}: unbekannter Owner ${hospitation.ownerId}.`);
  assert.ok(new Date(hospitation.startsAt).getTime() < new Date(hospitation.endsAt).getTime(), `${hospitation.id}: Endzeit muss nach der Startzeit liegen.`);
  if (hospitation.status === "Dokumentiert" || hospitation.status === "Durchgeführt") {
    assert.ok(new Date(hospitation.endsAt).getTime() <= new Date("2026-07-25T23:59:59.999Z").getTime(), `${hospitation.id}: abgeschlossene Hospitation liegt in der Zukunft.`);
  }
  assert.ok(Array.isArray(hospitation.topics) && hospitation.topics.length >= 2, `${hospitation.id}: Themenabdeckung ist zu dünn.`);
  assert.match(hospitation.requestNote, /synthetisch|fiktiv/i, `${hospitation.id}: sichtbare synthetische Kennzeichnung fehlt.`);
}
assert.ok(sorted(data.hospitations.map((item) => item.status)).length >= 6, "Hospitationen müssen mindestens sechs Bearbeitungsstände abdecken.");
assert.equal(sorted(data.hospitations.map((item) => item.sector)).length, 13, "Hospitationen müssen alle 13 Sektoren abdecken.");
assert.ok(sorted(data.hospitations.map((item) => item.state)).length >= 12, "Hospitationen müssen mindestens zwölf Bundesländer abdecken.");
const ePrescriptionWorkflow = data.hospitations.find((item) => item.id === "demo-hospitation-workflow-04");
assert.equal(ePrescriptionWorkflow?.organizationId, "demo-org-rheinapotheke", "E-Rezept-Workflow muss fachlich einer Apotheke zugeordnet sein.");
assert.equal(ePrescriptionWorkflow?.sector, "Apotheke", "E-Rezept-Workflow benötigt den Sektor Apotheke.");

const observationTexts = new Set();
for (const observation of normalizedObservations) {
  assert.match(observation.id, /^demo-observation-/, `${observation.id}: Beobachtungs-ID ist nicht reserviert.`);
  assert.ok(observation.observedAt, `${observation.id}: Zeitpunkt fehlt.`);
  assert.ok(observation.situation, `${observation.id}: Situation fehlt.`);
  assert.ok(observation.trigger, `${observation.id}: Auslöser fehlt.`);
  assert.ok(observation.description, `${observation.id}: konkrete Beobachtung fehlt.`);
  assert.ok(observation.actions.length >= 2, `${observation.id}: Handlungsschritte fehlen.`);
  assert.ok(observation.toolsAndDocuments.length >= 1, `${observation.id}: Systeme oder Dokumente fehlen.`);
  assert.ok(observation.involvedRoles.length >= 1, `${observation.id}: Rollen fehlen.`);
  assert.ok(observation.observationType, `${observation.id}: Beobachtungsart fehlt.`);
  assert.equal(observation.evidenceType, "synthetic_source_based", `${observation.id}: Quellenart muss transparent sein.`);
  assert.equal(observation.sourceType, "synthetic_source_scenario", `${observation.id}: Szenario ist nicht als synthetisch markiert.`);
  assert.match(observation.sourceReference, /^Fachlicher Quellenbezug \d{2} · https:\/\/www\./, `${observation.id}: offizieller Prozessquellenbezug fehlt.`);
  assert.ok(observation.uncertainty, `${observation.id}: Unsicherheitsangabe fehlt.`);
  assert.equal(observation.relevanceScore, null, `${observation.id}: synthetische Rohbeobachtung darf keinen Relevanzscore vortäuschen.`);
  assert.equal(observation.usageRecommendation, "", `${observation.id}: synthetische Rohbeobachtung darf keine Nutzungsempfehlung vortäuschen.`);
  assert.ok(!observationTexts.has(observation.description), `${observation.id}: Beobachtungstext ist nicht eindeutig.`);
  observationTexts.add(observation.description);
}
assert.ok(normalizedObservations.some((item) => item.problemType === "positives Muster / Best Practice"), "Funktionierende Abläufe fehlen.");
assert.ok(normalizedObservations.some((item) => item.problemType !== "positives Muster / Best Practice"), "Konkrete Reibungspunkte fehlen.");
assert.ok(normalizedObservations.some((item) => item.observationType === "Gegenbeispiel"), "Behelfslösungen müssen als Beobachtungsart Gegenbeispiel sichtbar bleiben.");
assert.ok(normalizedObservations.every((item) => !["Rückfrage", "Workaround"].includes(item.problemType)), "Problemtypen müssen Ursachen statt Reaktionen beschreiben.");

for (const observation of data.hospitationObservations) {
  assert.ok(hospitationIds.has(observation.hospitationId), `${observation.id}: unbekannte Hospitation ${observation.hospitationId}.`);
  assert.ok(profileIds.has(observation.ownerId), `${observation.id}: unbekannter Owner ${observation.ownerId}.`);
  assert.equal(observation.evidenceType, "interpreted", `${observation.id}: First-Class-Beobachtung benötigt einen DB-gültigen Evidenztyp.`);
  assert.equal(observation.originalEvidenceType, "synthetic_source_based", `${observation.id}: ursprüngliche synthetische Quellenart fehlt.`);
  assert.equal(observation.payload?.evidenceType, "interpreted", `${observation.id}: Payload darf keinen DB-ungültigen Evidenztyp reaktivieren.`);
  assert.equal(observation.payload?.originalEvidenceType, "synthetic_source_based", `${observation.id}: Payload muss die ursprüngliche Quellenart bewahren.`);
}
for (const slot of data.hospitationSlots) {
  assert.ok(contactIds.has(slot.contactId), `${slot.id}: unbekannter Kontakt ${slot.contactId}.`);
  assert.ok(organizationIds.has(slot.organizationId), `${slot.id}: unbekannte Organisation ${slot.organizationId}.`);
  assert.ok(profileIds.has(slot.ownerId), `${slot.id}: unbekannter Owner ${slot.ownerId}.`);
  assert.match(slot.notes, /synthetisch/i, `${slot.id}: synthetische Kennzeichnung fehlt.`);
}

for (const assessment of data.hospitationRoadmapAssessments) {
  assert.ok(hospitationIds.has(assessment.hospitationId), `${assessment.id}: unbekannte Hospitation ${assessment.hospitationId}.`);
  assert.ok(roadmapItemIds.has(assessment.roadmapItemId), `${assessment.id}: unbekanntes Roadmap-Element ${assessment.roadmapItemId}.`);
  for (const field of ["careRelevance", "patientSafety", "processRelief", "urgency", "implementationFeasibility", "adoptionLikelihood", "confidenceScore"]) {
    assert.ok(Number.isInteger(assessment[field]) && assessment[field] >= 1 && assessment[field] <= 5, `${assessment.id}: ${field} muss zwischen 1 und 5 liegen.`);
  }
  assert.match(assessment.evidenceNote, /synthetisch/i, `${assessment.id}: Bewertung muss als synthetisch gekennzeichnet sein.`);
}
for (const need of data.hospitationUnmetNeeds) {
  assert.ok(hospitationIds.has(need.hospitationId), `${need.id}: unbekannte Hospitation ${need.hospitationId}.`);
  assert.ok(roadmapItemIds.has(need.relatedRoadmapItemId), `${need.id}: unbekanntes Roadmap-Element ${need.relatedRoadmapItemId}.`);
  assert.match(`${need.problem} ${need.nextStep}`, /demo|synthetisch/i, `${need.id}: Unmet Need muss als Demo-Ableitung erkennbar sein.`);
}

for (const format of data.formats) {
  assert.ok(profileIds.has(format.ownerId), `${format.id}: unbekannter Owner ${format.ownerId}.`);
  assert.ok(new Date(format.startsAt).getTime() < new Date(format.endsAt).getTime(), `${format.id}: Endzeit muss nach der Startzeit liegen.`);
  for (const participant of format.participants || []) {
    assert.match(participant.id, /^demo-format-(?:past-)?participant-/, `${format.id}: Teilnahme-ID ist nicht reserviert.`);
    assert.equal(participant.formatId, format.id, `${participant.id}: Formatbezug stimmt nicht.`);
    assert.ok(contactIds.has(participant.contactId), `${participant.id}: unbekannter Kontakt ${participant.contactId}.`);
  }
}
assert.ok(sorted(data.formats.map((item) => item.formatType)).length >= 5, "Formate müssen mindestens fünf Formtypen abdecken.");
assert.deepEqual(sorted(data.formats.map((item) => item.status)), ["Abgeschlossen", "Aktiv", "Planung"], "Formate müssen Planung, Aktiv und Abgeschlossen abdecken.");
const formatTopics = data.formats.map((format) => `${format.title} ${format.goal}`).join(" ");
for (const topic of ["ePA", "E-Rezept", "TI-Messenger", "KIM", "TI-Gateway", "ISiK", "FHIR", "VSDM", "PoPP"]) {
  assert.ok(formatTopics.includes(topic), `Aktueller gematik-Bezug fehlt im Formatportfolio: ${topic}`);
}

assert.deepEqual(new Set(data.stakeholderTypes.map((type) => type.id)), stakeholderTypeIds, "Kontrollvokabular der Stakeholdertypen weicht ab.");
for (const type of data.stakeholderTypes) {
  const organizations = data.stakeholderOrganizations.filter((row) => row.stakeholderTypeId === type.id);
  const people = data.stakeholderPeople.filter((row) => row.stakeholderTypeId === type.id);
  assert.ok(organizations.length >= 5, `${type.id}: mindestens fünf Stakeholderorganisationen erforderlich.`);
  assert.ok(people.length >= organizations.length, `${type.id}: jede Stakeholdergruppe benötigt ausreichend Ansprechpersonen.`);
}
for (const organization of data.stakeholderOrganizations) {
  assert.ok(stakeholderTypeIds.has(organization.stakeholderTypeId), `${organization.id}: unbekannter Stakeholdertyp.`);
}
for (const person of data.stakeholderPeople) {
  assert.ok(stakeholderTypeIds.has(person.stakeholderTypeId), `${person.id}: unbekannter Stakeholdertyp.`);
  assert.ok(stakeholderOrganizationIds.has(person.organizationId), `${person.id}: unbekannte Stakeholderorganisation ${person.organizationId}.`);
  assert.equal(
    data.stakeholderOrganizations.find((row) => row.id === person.organizationId)?.stakeholderTypeId,
    person.stakeholderTypeId,
    `${person.id}: Person und Organisation verwenden unterschiedliche Stakeholdertypen.`
  );
}
const pressStakeholderOrganizations = data.stakeholderOrganizations.filter((row) => row.stakeholderTypeId === "press");
const pressStakeholderPeople = data.stakeholderPeople.filter((row) => row.stakeholderTypeId === "press");
assert.equal(pressStakeholderOrganizations.length, 12, "Die Presse-Demo benötigt zwölf synthetische Medien- und Pressestellen.");
assert.equal(pressStakeholderPeople.length, 26, "Die Presse-Demo benötigt 26 synthetische Pressekontakte.");
assert.equal(
  new Set(pressStakeholderOrganizations.map((row) => row.organizationType)).size,
  11,
  "Die Presse-Demo muss unterschiedliche Medien- und Pressestellentypen abdecken."
);
for (const organization of pressStakeholderOrganizations) {
  assert.equal(organization.memberCount, null, `${organization.id}: Presseorganisationen dürfen keine fingierte Mitgliederzahl erhalten.`);
  assert.match(organization.website || "", /^https:\/\/[a-z0-9-]+\.example\.invalid\/?$/i, `${organization.id}: Website muss eine reservierte Demo-URL sein.`);
  assert.match(organization.email || "", /@presse\.example\.invalid$/i, `${organization.id}: E-Mail muss eine reservierte Demo-Adresse sein.`);
  assert.match(organization.source || "", /synthetisch/i, `${organization.id}: synthetische Herkunft fehlt.`);
}
for (const person of pressStakeholderPeople) {
  assert.match(person.email || "", /@presse\.example\.invalid$/i, `${person.id}: E-Mail muss eine reservierte Demo-Adresse sein.`);
  assert.match(person.url || "", /^https:\/\/[a-z0-9-]+\.example\.invalid\/profil$/i, `${person.id}: Profil muss eine reservierte Demo-URL sein.`);
  assert.ok(Array.isArray(person.themes) && person.themes.length >= 3, `${person.id}: realistische Pressethemen fehlen.`);
  assert.match(person.source || "", /synthetisch/i, `${person.id}: synthetische Herkunft fehlt.`);
}
const pressRolePortfolio = pressStakeholderPeople.map((person) => person.role).join(" ");
for (const rolePattern of [/Pressesprecher/i, /Redaktionsleitung|Chefredakteur/i, /Redakteur|Korrespondent|Datenjournalist/i]) {
  assert.match(pressRolePortfolio, rolePattern, `Rollenprofil fehlt: ${rolePattern}`);
}
const pressTopicPortfolio = pressStakeholderPeople.flatMap((person) => person.themes).join(" ");
for (const topic of ["Digital Health", "Gesundheitssystem", "Gesundheitspolitik", "gematik", "Telematikinfrastruktur"]) {
  assert.ok(pressTopicPortfolio.includes(topic), `Presse-Schwerpunktthema fehlt: ${topic}`);
}

for (const organization of data.expertOrganizations) {
  assert.ok(expertGroupIds.has(organization.groupId), `${organization.id}: unbekannte Expertengruppe ${organization.groupId}.`);
}
for (const contact of data.expertContacts) {
  assert.ok(expertGroupIds.has(contact.groupId), `${contact.id}: unbekannte Expertengruppe ${contact.groupId}.`);
  assert.ok(expertOrganizationIds.has(contact.organizationId), `${contact.id}: unbekannte Expertenorganisation ${contact.organizationId}.`);
  assert.equal(contact.groupId, expertOrganizationById.get(contact.organizationId)?.groupId, `${contact.id}: Kontakt und Expertenorganisation verwenden unterschiedliche Gruppen.`);
  for (const ownerId of contact.ownerIds || []) assert.ok(profileIds.has(ownerId), `${contact.id}: unbekannter Owner ${ownerId}.`);
}
for (const link of data.expertEntityLinks) {
  assert.ok(["contact", "organization"].includes(link.linkType), `${link.id}: ungültiger Verknüpfungstyp ${link.linkType}.`);
  if (link.linkType === "contact") {
    assert.ok(expertContactIds.has(link.expertContactId), `${link.id}: unbekannter Expertenkontakt.`);
    assert.ok(contactIds.has(link.contactId), `${link.id}: unbekannter Versorgungskontakt.`);
    assert.equal(link.expertOrganizationId, undefined, `${link.id}: Kontaktlink darf keine Expertenorganisation enthalten.`);
    assert.equal(link.organizationId, undefined, `${link.id}: Kontaktlink darf keine Versorgungsorganisation enthalten.`);
  } else {
    assert.ok(expertOrganizationIds.has(link.expertOrganizationId), `${link.id}: unbekannte Expertenorganisation.`);
    assert.ok(organizationIds.has(link.organizationId), `${link.id}: unbekannte Versorgungsorganisation.`);
    assert.equal(link.expertContactId, undefined, `${link.id}: Organisationslink darf keinen Expertenkontakt enthalten.`);
    assert.equal(link.contactId, undefined, `${link.id}: Organisationslink darf keinen Versorgungskontakt enthalten.`);
  }
}
assert.equal(data.expertEntityLinks.filter((link) => link.linkType === "contact").length, 4, "Vier Kontaktverknüpfungen werden für die Demo benötigt.");
assert.equal(data.expertEntityLinks.filter((link) => link.linkType === "organization").length, 4, "Vier Organisationsverknüpfungen werden für die Demo benötigt.");

const objectIdsByType = {
  contact: contactIds,
  organization: organizationIds,
  format: formatIds,
  hospitation: hospitationIds
};
for (const event of data.activityEvents) {
  assert.ok(profileIds.has(event.actorId), `${event.id}: unbekannte ausführende Person ${event.actorId}.`);
  assert.ok(contactIds.has(event.contactId), `${event.id}: unbekannter Kontakt ${event.contactId}.`);
  assert.ok(objectIdsByType[event.objectType]?.has(event.objectId), `${event.id}: unbekanntes Aktivitätsobjekt ${event.objectType}/${event.objectId}.`);
  if (event.objectType === "hospitation") {
    assert.equal(event.contactId, hospitationById.get(event.objectId)?.contactId, `${event.id}: Aktivität verweist nicht auf den Hospitationskontakt.`);
  }
  if (event.objectType === "format") {
    assert.ok(formatById.get(event.objectId)?.participants.some((participant) => participant.contactId === event.contactId), `${event.id}: Teilnahmeaktivität verweist auf keinen Formatteilnehmer.`);
  }
}
assert.ok(sorted(data.activityEvents.map((event) => event.categoryKey)).length >= 6, "Aktivitäten müssen mindestens sechs Kategorien abdecken.");
for (const change of data.changes) {
  assert.ok(contactIds.has(change.contactId), `${change.id}: unbekannter Kontakt ${change.contactId}.`);
  assert.ok(profileIds.has(change.changedBy), `${change.id}: unbekannte ausführende Person ${change.changedBy}.`);
}
for (const notification of data.notifications) {
  assert.ok(objectIdsByType[notification.objectType]?.has(notification.objectId), `${notification.id}: unbekanntes Benachrichtigungsobjekt.`);
  assert.equal(notification.entityType, notification.objectType, `${notification.id}: Objekt- und Entitätstyp widersprechen sich.`);
  assert.equal(notification.entityId, notification.objectId, `${notification.id}: Objekt- und Entitäts-ID widersprechen sich.`);
  const expectedEntityType = {
    contacts: "contact",
    organizations: "organization",
    hospitations: "hospitation",
    formats: "format",
    team: "contact"
  }[notification.context];
  assert.equal(notification.entityType, expectedEntityType, `${notification.id}: Entität passt nicht zum Benachrichtigungskontext.`);
}
assert.deepEqual(
  sorted(data.notifications.map((item) => item.context)),
  ["contacts", "formats", "hospitations", "organizations", "team"],
  "Benachrichtigungen müssen alle zentralen Arbeitskontexte abdecken."
);

for (const note of data.contactNotes) {
  assert.ok(contactIds.has(note.contactId), `${note.id}: unbekannter Kontakt ${note.contactId}.`);
  assert.ok(profileIds.has(note.createdBy), `${note.id}: unbekannte erstellende Person ${note.createdBy}.`);
  assert.match(`${note.title} ${note.body}`, /demo|synthetisch|fiktiv/i, `${note.id}: Notiz muss sichtbar synthetisch sein.`);
}
for (const attachment of data.contactNoteAttachments) {
  assert.ok(contactIds.has(attachment.contactId), `${attachment.id}: unbekannter Kontakt ${attachment.contactId}.`);
  assert.ok(noteIds.has(attachment.noteId), `${attachment.id}: unbekannte Notiz ${attachment.noteId}.`);
  assert.ok(profileIds.has(attachment.uploaderId), `${attachment.id}: unbekannte hochladende Person ${attachment.uploaderId}.`);
  assert.equal(attachment.mimeType, "text/plain", `${attachment.id}: öffentliche Demo-Anhänge bleiben reine Textdateien.`);
  assert.match(`${attachment.description} ${attachment.extractedText}`, /synthetisch/i, `${attachment.id}: Anhang ist nicht als synthetisch gekennzeichnet.`);
}

const allowedSavedViewTypes = new Set(["contacts", "organizations", "experts", "stakeholders", "formats", "map", "analytics"]);
for (const view of data.savedViews) {
  assert.ok(profileIds.has(view.ownerId), `${view.id}: unbekannter Ansichts-Owner ${view.ownerId}.`);
  assert.ok(allowedSavedViewTypes.has(view.viewType), `${view.id}: ${view.viewType} ist kein DB-gültiger Ansichtstyp.`);
}
assert.ok(savedViewIds.has(data.userSettings.defaultViewId), "Die Standardansicht in userSettings existiert nicht.");
assert.ok(profileIds.has(data.userSettings.userId), "Das Demo-Nutzerprofil in userSettings existiert nicht.");
assert.equal(data.userSettings.preferences?.demo?.resetOnReload, true, "Demo-Einstellungen müssen den Reset beim Neuladen ausweisen.");

const aggregates = model.getDashboardAggregates(data.hospitations);
assert.equal(aggregates.total, 28);
assert.equal(aggregates.observationsTotal, 69);
assert.equal(aggregates.quotesTotal, 0, "Synthetische Zitate dürfen nicht als Feldbelege erscheinen.");
assert.equal(aggregates.mediaArtifactsTotal, 0, "Synthetische Medien dürfen nicht als Feldbelege erscheinen.");
assert.equal(aggregates.impulsesTotal, 0, "Impulse gehören nicht in die Rohdokumentation.");

console.log(
  "Pages-Datenvertrag OK: 130 Kontakte, 55 Organisationen in 16 Ländern/13 Sektoren, " +
  "28 Hospitationen mit 69 Beobachtungen sowie vollständige Formate-, Stakeholder-, Experten- und Aktivitätsbeziehungen geprüft."
);
