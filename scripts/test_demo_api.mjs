import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const demoDataSource = fs.readFileSync("frontend/data/demo-data.js", "utf8");
const demoApiSource = fs.readFileSync("frontend/data/demo-api.js", "utf8");
const publicPoliticsDirectorySource = fs.readFileSync(
  "frontend/data/public-politics-directory.js",
  "utf8"
);
const dataServiceSource = fs.readFileSync("frontend/data/data-service.js", "utf8");
const registrationSource = fs.readFileSync("frontend/pages/mitmachen/versorgungs-netzwerk.js", "utf8");
const targetAuditSource = fs.readFileSync("scripts/audit_target_assets.mjs", "utf8");
const FORMAT_TEST_NOW = "2026-07-19T12:00:00.000Z";

assert.doesNotMatch(
  demoApiSource,
  /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\s*\.\s*cookie/i,
  "Die öffentliche Demo-API darf Fachdaten nicht persistent im Browser speichern."
);
assert.doesNotMatch(
  demoApiSource,
  /supabase(?:\.co|-js|Url|AnonKey)|service[_-]?role|storage\/v1/i,
  "Die öffentliche Demo-API darf weder Supabase noch geschützten Storage referenzieren."
);
assert.match(demoApiSource, /persistence:\s*["']memory-only["']/, "Die Demo-Runtime muss memory-only explizit ausweisen.");
assert.match(demoApiSource, /resetOnReload:\s*true/, "Die Demo-Runtime muss den Reset beim Neuladen ausweisen.");
assert.match(demoApiSource, /const\s+baseline\s*=\s*window\.VERSORGUNGS_COMPASS_DEMO_DATA/, "Die Demo-API muss ausschließlich den synthetischen Datensatz als Baseline verwenden.");
assert.match(demoApiSource, /const\s+state\s*=\s*clone\(baseline\)|const\s+state\s*=\s*clone\s*\(\s*baseline\s*\)/, "Die Demo-API muss ihre Baseline tief kopieren.");
assert.match(demoApiSource, /ownerOnlyContactChannels\s*===\s*true/, "Die Owner-Projektion muss explizit durch die Pages-Capability aktiviert werden.");
assert.match(demoApiSource, /allDemoContactsInvitable\s*===\s*true/, "Die vollständige Demo-Einladungsfreigabe muss explizit durch die Pages-Capability aktiviert werden.");
assert.match(demoApiSource, /contactChannelAccess:\s*hasAccess\s*\?\s*["']owner["']\s*:\s*["']restricted["']/, "Der Demo-Adapter muss den Kontaktkanal-Zugriff explizit ausweisen.");
assert.doesNotMatch(
  demoApiSource,
  /vk-public-demo-notice|vk-public-demo-trigger|data-demo-notice-close/,
  "Die öffentliche Demo darf keinen schwebenden Hinweis am Bildschirmrand injizieren."
);
assert.match(dataServiceSource, /VersorgungsCompassDemoApi[\s\S]*?active\s*===\s*true/, "Der gemeinsame Data-Service muss im Demo-Profil einen aktiven lokalen Adapter verlangen.");
assert.match(registrationSource, /function\s+completeDemo\s*\(/, "Die Konzeptdemo muss ihren rein lokalen Abschluss explizit benennen.");
assert.doesNotMatch(registrationSource, /VersorgungsCompassDemoApi|\b(?:fetch|XMLHttpRequest|sendBeacon)\b/, "Die Konzeptdemo darf weder den Demo-Adapter noch eine Transport-API verwenden.");

for (const forbiddenDemoAsset of [
  "data/public-politics-directory.js",
  "data/demo-data.js",
  "data/demo-api.js"
]) {
  assert.match(
    targetAuditSource,
    new RegExp(`["']${forbiddenDemoAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`),
    `Target-Audit muss ${forbiddenDemoAsset} ausdrücklich ausschließen.`
  );
}

function createRuntime({
  dataMode = "demo",
  authMode = "anonymous-demo",
  demoRole = "admin",
  demoProfile = "",
  demoOnboarding = "",
  ownerOnlyContactChannels = true,
  allDemoContactsInvitable = true,
  includePublicPoliticsDirectory = true,
  mutateDemoData
} = {}) {
  const originalFetchCalls = [];
  const dispatchedEvents = [];
  const documentListeners = new Map();
  const storageAccesses = [];
  const location = new URL("https://demo.example.invalid/versorgungs-kompass.html");
  if (demoProfile) location.searchParams.set("demoProfile", demoProfile);
  if (demoOnboarding) location.searchParams.set("demoOnboarding", demoOnboarding);
  const originalFetch = async (input, init = {}) => {
    originalFetchCalls.push({ input: String(input), init: { ...init } });
    return new Response("static passthrough", { status: 200 });
  };
  const window = {
    location,
    fetch: originalFetch,
    atob,
    VERSORGUNGS_COMPASS_CONFIG: {
      dataMode,
      authMode,
      apiBaseUrl: "",
      requireApiGateway: false,
      demoRole,
      capabilities: {
        ownerOnlyContactChannels,
        allDemoContactsInvitable
      }
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    }
  };
  for (const storageName of ["localStorage", "sessionStorage", "indexedDB"]) {
    Object.defineProperty(window, storageName, {
      configurable: true,
      get() {
        storageAccesses.push(storageName);
        throw new Error(`${storageName} darf von der memory-only Demo nicht verwendet werden.`);
      }
    });
  }
  const document = {
    currentScript: { src: "https://demo.example.invalid/data/demo-data.js" },
    readyState: "loading",
    body: null,
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    }
  };
  const context = {
    window,
    document,
    URL,
    Date,
    console,
    Response,
    Request,
    FormData,
    TextEncoder,
    Uint8Array,
    CustomEvent,
    structuredClone,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  if (includePublicPoliticsDirectory) {
    document.currentScript = {
      src: "https://demo.example.invalid/data/public-politics-directory.js"
    };
    vm.runInContext(publicPoliticsDirectorySource, context, {
      filename: "frontend/data/public-politics-directory.js"
    });
  }
  document.currentScript = { src: "https://demo.example.invalid/data/demo-data.js" };
  vm.runInContext(demoDataSource, context, { filename: "frontend/data/demo-data.js" });
  if (typeof mutateDemoData === "function") mutateDemoData(window.VERSORGUNGS_COMPASS_DEMO_DATA);
  document.currentScript = { src: "https://demo.example.invalid/data/demo-api.js" };
  vm.runInContext(demoApiSource, context, { filename: "frontend/data/demo-api.js" });
  return {
    context,
    window,
    documentListeners,
    originalFetch,
    originalFetchCalls,
    dispatchedEvents,
    storageAccesses
  };
}

function makeContact76EhcOnly(demoData) {
  const contact = demoData.contacts.find((item) => item.id === "demo-contact-76");
  Object.assign(contact, {
    mitmachenConsentStatus: "not_requested",
    mitmachenConsentEffectiveAt: "",
    mitmachenConsentSource: "",
    mitmachenConsentTextVersion: "",
    mitmachenConsentRecordedBy: "",
    mitmachenConsentNote: ""
  });
}

const inactiveRuntime = createRuntime({ dataMode: "api", authMode: "oidc" });
assert.equal(inactiveRuntime.window.fetch, inactiveRuntime.originalFetch, "Demo-API darf sich außerhalb des expliziten Demo-Profils nicht aktivieren.");
assert.equal(inactiveRuntime.window.VersorgungsCompassDemoApi, undefined, "Target-Profil darf keine Demo-Runtime exportieren.");
assert.equal(inactiveRuntime.window.VERSORGUNGS_COMPASS_DEMO_RUNTIME, undefined, "Target-Profil darf keine Demo-Metadaten exportieren.");

const editorRuntime = createRuntime({
  demoProfile: "demo-profile-editor",
  allDemoContactsInvitable: false,
  mutateDemoData: makeContact76EhcOnly
});
assert.equal(
  editorRuntime.window.VersorgungsCompassDemoApi.snapshot().currentProfileId,
  "demo-profile-editor",
  "Ein bekanntes aktives demoProfile muss das aktuelle Demo-Profil exakt auswählen."
);
const invalidProfileRuntime = createRuntime({ demoProfile: "demo-profile-does-not-exist" });
assert.equal(
  invalidProfileRuntime.window.VersorgungsCompassDemoApi.snapshot().currentProfileId,
  "demo-profile-admin",
  "Ein unbekanntes demoProfile muss auf das konfigurierte Standardprofil zurückfallen."
);
const inactiveProfileRuntime = createRuntime({
  demoProfile: "demo-profile-editor",
  mutateDemoData(demoData) {
    demoData.profiles.find((profile) => profile.id === "demo-profile-editor").active = false;
  }
});
assert.equal(
  inactiveProfileRuntime.window.VersorgungsCompassDemoApi.snapshot().currentProfileId,
  "demo-profile-admin",
  "Ein inaktives demoProfile darf nicht ausgewählt werden."
);

const legacyDemoRuntime = createRuntime({ ownerOnlyContactChannels: false });
const politicsDirectory = await (
  await legacyDemoRuntime.window.fetch("/api/politics/health-committee")
).json();
assert.equal(politicsDirectory.available, true);
assert.equal(politicsDirectory.publicDirectory, true);
assert.equal(politicsDirectory.memberCount, 38);
assert.equal(politicsDirectory.members.length, 38);
assert.equal(
  politicsDirectory.members.every((member) => member.postalCodes.length <= 1),
  true,
  "Der Pages-Politikvertrag darf höchstens eine repräsentative PLZ pro Person ausliefern."
);
assert.equal(
  politicsDirectory.members
    .filter((member) => member.imageRightsStatus === "review_required")
    .every((member) => !Object.hasOwn(member, "imageUrl")),
  true,
  "Politikporträts mit ausstehender Rechteprüfung dürfen keine Bild-URL erhalten."
);
const politicsUnavailableRuntime = createRuntime({
  ownerOnlyContactChannels: false,
  includePublicPoliticsDirectory: false
});
const unavailablePoliticsDirectory = await (
  await politicsUnavailableRuntime.window.fetch("/api/politics/health-committee")
).json();
assert.equal(
  unavailablePoliticsDirectory.available,
  false,
  "Ohne den expliziten Pages-Snapshot muss die Demo-API fail-closed bleiben."
);
const legacyContactResponse = await legacyDemoRuntime.window.fetch("/api/contacts/demo-contact-02");
const legacyContact = await legacyContactResponse.json();
assert.equal(legacyContact.email, "kontakt-002@versorgung.example.invalid", "Ohne Pages-Capability muss der bisherige Demo-Vertrag unverändert bleiben.");
assert.equal(legacyContact.contactChannelAccess, undefined, "Ohne Pages-Capability darf kein neuer Access-State erzwungen werden.");
const legacyRestrictedEhcRuntime = createRuntime({
  demoProfile: "demo-profile-editor",
  ownerOnlyContactChannels: false,
  allDemoContactsInvitable: false,
  mutateDemoData: makeContact76EhcOnly
});
const legacyRestrictedEhcContact = await (
  await legacyRestrictedEhcRuntime.window.fetch("/api/contacts/demo-contact-76")
).json();
assert.equal(legacyRestrictedEhcContact.profileAccess, "ehc_restricted", "Der EHC-only-Schutz darf nicht von der allgemeinen Kanal-Capability abhängen.");
assert.equal(legacyRestrictedEhcContact.name, "Geschützter EHC-Kontakt");
assert.equal(legacyRestrictedEhcContact.email, "");

for (const ehcConsentStatus of ["withdrawn", "not_requested"]) {
  const historicalEhcRuntime = createRuntime({
    demoProfile: "demo-profile-editor",
    allDemoContactsInvitable: false,
    mutateDemoData(demoData) {
      makeContact76EhcOnly(demoData);
      const contact = demoData.contacts.find((item) => item.id === "demo-contact-76");
      contact.ehcConsentStatus = ehcConsentStatus;
    }
  });
  const historicalEhcContact = await (
    await historicalEhcRuntime.window.fetch("/api/contacts/demo-contact-76")
  ).json();
  assert.equal(
    historicalEhcContact.profileAccess,
    "ehc_restricted",
    `Der EHC-Profilschutz muss nach Status ${ehcConsentStatus} erhalten bleiben.`
  );
  assert.equal(historicalEhcContact.name, "Geschützter EHC-Kontakt");
  assert.equal(historicalEhcContact.email, "");
}
const verbalMitmachenEhcRuntime = createRuntime({
  demoProfile: "demo-profile-editor",
  allDemoContactsInvitable: false,
  mutateDemoData(demoData) {
    makeContact76EhcOnly(demoData);
    const contact = demoData.contacts.find((item) => item.id === "demo-contact-76");
    contact.mitmachenConsentStatus = "granted";
    contact.mitmachenConsentSource = "verbal_confirmed";
  }
});
const verbalMitmachenEhcContact = await (
  await verbalMitmachenEhcRuntime.window.fetch("/api/contacts/demo-contact-76")
).json();
assert.equal(
  verbalMitmachenEhcContact.profileAccess,
  "ehc_restricted",
  "Eine nur mündliche #Mitmachen-Angabe darf den EHC-Profilschutz nicht aufheben."
);
assert.equal(verbalMitmachenEhcContact.name, "Geschützter EHC-Kontakt");

const seededSensitiveHistoryRuntime = createRuntime({
  mutateDemoData(demoData) {
    demoData.activityEvents.unshift({
      id: "demo-activity-sensitive-contract",
      eventKey: "contact.updated",
      categoryKey: "master_data",
      actionKey: "update",
      objectType: "contact",
      objectId: "demo-contact-02",
      contactId: "demo-contact-02",
      title: "Sensibler Contract-Test",
      occurredAt: "2026-07-20T12:00:00.000Z",
      changes: [{ fieldName: "email", oldValue: "alt-geheim@example.invalid", newValue: "neu-geheim@example.invalid" }]
    });
    demoData.changes.unshift({
      id: "demo-change-sensitive-contract",
      contactId: "demo-contact-02",
      contact_id: "demo-contact-02",
      fieldName: "email",
      field_name: "email",
      oldValue: "alt-geheim@example.invalid",
      newValue: "neu-geheim@example.invalid"
    });
  }
});
const seededSensitiveSnapshot = seededSensitiveHistoryRuntime.window.VersorgungsCompassDemoApi.snapshot();
assert.deepEqual(
  JSON.parse(JSON.stringify(seededSensitiveSnapshot.activityEvents.find((activity) => activity.id === "demo-activity-sensitive-contract")?.changes)),
  [],
  "Sensible Activity-Changes eines fremden Kontakts müssen im Snapshot redigiert werden."
);
assert.ok(
  !seededSensitiveSnapshot.changes.some((change) => change.id === "demo-change-sensitive-contract"),
  "Flache sensible Change-Zeilen eines fremden Kontakts dürfen im Snapshot nicht erscheinen."
);

const runtime = createRuntime();
const { window } = runtime;
const api = window.VersorgungsCompassDemoApi;
const runtimeContract = window.VERSORGUNGS_COMPASS_DEMO_RUNTIME;

assert.ok(api, "Die Demo-API wurde im Demo-Profil nicht initialisiert.");
assert.ok(Object.isFrozen(api), "Der öffentliche Demo-API-Export muss unveränderlich sein.");
assert.equal(api.active, true, "Die Demo-API muss ihre aktive lokale Übernahme für fail-closed Aufrufer explizit bestätigen.");
assert.deepEqual(
  JSON.parse(JSON.stringify(runtimeContract)),
  {
    onboardingPreview: false,
    publicDemo: true,
    persistence: "memory-only",
    resetOnReload: true,
    syntheticOnly: true
  },
  "Die Runtime-Metadaten müssen den öffentlichen, synthetischen memory-only Betrieb eindeutig beschreiben."
);

const onboardingPreviewRuntime = createRuntime({
  demoProfile: "demo-profile-viewer",
  demoOnboarding: "fresh"
});
const onboardingPreviewSnapshot = onboardingPreviewRuntime.window.VersorgungsCompassDemoApi.snapshot();
assert.equal(
  onboardingPreviewRuntime.window.VERSORGUNGS_COMPASS_DEMO_RUNTIME.onboardingPreview,
  true,
  "Nur der explizite Viewer-Testlink darf den Onboarding-Previewmodus aktivieren."
);
assert.equal(onboardingPreviewSnapshot.currentProfileId, "demo-profile-viewer");
assert.deepEqual(
  JSON.parse(JSON.stringify(onboardingPreviewSnapshot.userSettings.preferences.onboarding)),
  { version: 2, currentStep: "welcome" },
  "Der Viewer-Testlink muss ausschließlich einen frischen In-Memory-Onboardingzustand bereitstellen."
);

const adminOnboardingPreviewRuntime = createRuntime({
  demoProfile: "demo-profile-admin",
  demoOnboarding: "fresh"
});
assert.equal(
  adminOnboardingPreviewRuntime.window.VERSORGUNGS_COMPASS_DEMO_RUNTIME.onboardingPreview,
  false,
  "Der Previewparameter darf für das Admin-Demoprofil nicht aktiviert werden."
);
assert.equal(runtime.storageAccesses.length, 0, "Initialisierung darf keinen persistenten Browser-Speicher berühren.");
assert.equal(runtime.documentListeners.has("DOMContentLoaded"), false, "Ohne schwebenden Demo-Hinweis ist kein DOMContentLoaded-Hook nötig.");

const initialSnapshot = api.snapshot();
const immutableBaselineCount = window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.length;
assert.equal(initialSnapshot.contacts.length, 130);
assert.equal(initialSnapshot.organizations.length, 55);
assert.equal(initialSnapshot.currentProfileId, "demo-profile-admin");
assert.equal(initialSnapshot.organizationPrimarySystems.length, 55);
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-01")?.contactChannelAccess, "owner");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-01")?.email, "kontakt-001@versorgung.example.invalid");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-02")?.contactChannelAccess, "restricted");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-02")?.email, "");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-02")?.phone, "");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-17")?.contactChannelAccess, "restricted");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-17")?.email, "", "Ownerlose Kontakte müssen für alle Demo-Profile eingeschränkt bleiben.");
const ownedEhcOnlyContact = initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-76");
assert.equal(ownedEhcOnlyContact?.profileAccess, undefined, "Ein schriftlich für #Mitmachen freigegebener Kontakt ist nicht mehr EHC-only.");
assert.equal(ownedEhcOnlyContact?.contactChannelAccess, "owner");
assert.notEqual(ownedEhcOnlyContact?.name, "Geschützter EHC-Kontakt");
assert.equal(ownedEhcOnlyContact?.ehcConsentStatus, "granted");
assert.equal(ownedEhcOnlyContact?.ehcConsentSource, "survalyzer_ehc");
assert.equal(ownedEhcOnlyContact?.mitmachenConsentStatus, "granted");
assert.equal(ownedEhcOnlyContact?.mitmachenConsentSource, "written");
assert.ok(ownedEhcOnlyContact?.ehcConsentTextVersion, "Der Owner muss den vollständigen synthetischen EHC-Nachweis sehen.");
const directlyInvitableContacts = initialSnapshot.contacts.filter((contact) => {
  const effectiveTime = new Date(contact.mitmachenConsentEffectiveAt || "").getTime();
  return contact.mitmachenConsentStatus === "granted"
    && ["online_form", "email", "written"].includes(contact.mitmachenConsentSource)
    && Number.isFinite(effectiveTime)
    && effectiveTime <= new Date(FORMAT_TEST_NOW).getTime()
    && Boolean(contact.mitmachenConsentTextVersion)
    && Boolean(contact.mitmachenConsentRecordedBy);
});
assert.equal(directlyInvitableContacts.length, initialSnapshot.contacts.length, "Alle 130 Bestandskontakte der öffentlichen Demo müssen grün einladbar sein.");
assert.equal(
  initialSnapshot.contacts.filter((contact) => ["archived", "Archiviert"].includes(contact.status)).length,
  0,
  "Die öffentliche Demo darf keine archivierten und dadurch nicht einladbaren Bestandskontakte enthalten."
);
assert.equal(
  window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.find((contact) => contact.id === "demo-contact-02")?.email,
  "kontakt-002@versorgung.example.invalid",
  "Die Projektion darf die synthetische Baseline nicht verändern."
);

const contactsResponse = await window.fetch("/api/contacts?includeArchived=true");
assert.equal(contactsResponse.status, 200);
assert.equal(contactsResponse.headers.get("X-Versorgungs-Kompass-Demo"), "memory-only");
const contactsPayload = await contactsResponse.json();
assert.equal(contactsPayload.items.length, 130);
assert.equal(contactsPayload.items.find((contact) => contact.id === "demo-contact-02")?.contactChannelAccess, "restricted");
assert.equal(contactsPayload.items.find((contact) => contact.id === "demo-contact-02")?.email, "");
assert.equal(runtime.originalFetchCalls.length, 0, "Lokale Demo-API-Aufrufe dürfen das Netzwerk nicht erreichen.");

const restrictedDetailResponse = await window.fetch("/api/contacts/demo-contact-02");
assert.equal(restrictedDetailResponse.status, 200);
const restrictedDetail = await restrictedDetailResponse.json();
assert.equal(restrictedDetail.contactChannelAccess, "restricted");
assert.equal(restrictedDetail.email, "");
assert.equal(restrictedDetail.phone, "");

const editorSharedContact = await (await editorRuntime.window.fetch("/api/contacts/demo-contact-01")).json();
const editorOwnedContact = await (await editorRuntime.window.fetch("/api/contacts/demo-contact-02")).json();
assert.equal(editorSharedContact.contactChannelAccess, "owner", "Jeder Co-Owner muss Zugriff auf Kontaktkanäle erhalten.");
assert.equal(editorSharedContact.email, "kontakt-001@versorgung.example.invalid");
assert.equal(editorOwnedContact.contactChannelAccess, "owner");
assert.equal(editorOwnedContact.phone, "+49 171 39200 56");

const rawEhcOnlyContact = editorRuntime.window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.find(
  (contact) => contact.id === "demo-contact-76"
);
const restrictedEhcResponse = await editorRuntime.window.fetch("/api/contacts/demo-contact-76");
assert.equal(restrictedEhcResponse.status, 200);
const restrictedEhcContact = await restrictedEhcResponse.json();
assert.equal(restrictedEhcContact.profileAccess, "ehc_restricted");
assert.equal(restrictedEhcContact.contactChannelAccess, "restricted");
assert.equal(restrictedEhcContact.name, "Geschützter EHC-Kontakt");
assert.equal(restrictedEhcContact.relationshipBasis, rawEhcOnlyContact.relationshipBasis, "Die Beziehungsstatusachse muss im Stub erhalten bleiben.");
assert.equal(restrictedEhcContact.ehcConsentStatus, "granted", "Die EHC-Statusachse muss im Stub erhalten bleiben.");
assert.equal(restrictedEhcContact.mitmachenConsentStatus, "not_requested", "Die #Mitmachen-Statusachse muss im Stub erhalten bleiben.");
for (const field of [
  "organizationId",
  "organization",
  "category",
  "specialty",
  "contactRole",
  "ownerId",
  "owner",
  "postalCode",
  "city",
  "state",
  "email",
  "phone",
  "linkedin",
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
  "ehcConsentNote",
  "note",
  "notes",
  "nextStep",
  "image",
  "imageStoragePath",
  "imageKind",
  "imageMimeType",
  "imageSourceLabel",
  "imageRightsNote",
  "createdAt",
  "updatedAt"
]) {
  assert.equal(restrictedEhcContact[field], "", `Der EHC-Stub muss ${field} leeren.`);
}
assert.deepEqual(restrictedEhcContact.ownerIds, []);
assert.deepEqual(restrictedEhcContact.sources, []);
assert.deepEqual(restrictedEhcContact.themes, []);
assert.equal(restrictedEhcContact.lat, null);
assert.equal(restrictedEhcContact.lon, null);
const serializedRestrictedEhcContact = JSON.stringify(restrictedEhcContact);
for (const secret of [
  rawEhcOnlyContact.name,
  rawEhcOnlyContact.organization,
  rawEhcOnlyContact.city,
  rawEhcOnlyContact.email,
  rawEhcOnlyContact.phone,
  rawEhcOnlyContact.ehcConsentSource,
  rawEhcOnlyContact.ehcConsentTextVersion,
  rawEhcOnlyContact.ehcConsentNote
]) {
  assert.ok(secret, "Der Leckfreiheitstest benötigt nichtleere synthetische Ausgangswerte.");
  assert.ok(!serializedRestrictedEhcContact.includes(secret), `Der EHC-Stub darf den Ausgangswert ${secret} nicht enthalten.`);
}
const editorEhcList = await (await editorRuntime.window.fetch("/api/contacts?includeArchived=true")).json();
assert.deepEqual(
  editorEhcList.items.find((contact) => contact.id === "demo-contact-76"),
  restrictedEhcContact,
  "Listen- und Detailprojektion müssen denselben nicht-identifizierenden EHC-Stub liefern."
);
assert.deepEqual(
  JSON.parse(JSON.stringify(
    editorRuntime.window.VersorgungsCompassDemoApi.snapshot().contacts.find((contact) => contact.id === "demo-contact-76")
  )),
  restrictedEhcContact,
  "Auch der Runtime-Snapshot muss den EHC-only-Kontakt vollständig projizieren."
);
const editorActivityCountBeforeEhcPatch = editorRuntime.window.VersorgungsCompassDemoApi.snapshot().activityEvents.length;
const forbiddenEhcPatchResponse = await editorRuntime.window.fetch("/api/contacts/demo-contact-76", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ priority: "Hoch" })
});
assert.equal(forbiddenEhcPatchResponse.status, 403, "Non-Owner dürfen auch unsensible Felder eines EHC-only-Profils nicht patchen.");
assert.equal(
  editorRuntime.window.VersorgungsCompassDemoApi.snapshot().activityEvents.length,
  editorActivityCountBeforeEhcPatch,
  "Ein abgelehnter EHC-only-PATCH darf kein Aktivitätsereignis erzeugen."
);
const forbiddenEhcImageResponse = await editorRuntime.window.fetch("/api/contacts/demo-contact-76/image", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ contentType: "image/png", data: "iVBORw0KGgo=", width: 1, height: 1 })
});
assert.equal(forbiddenEhcImageResponse.status, 403, "Non-Owner dürfen den EHC-only-Schutz nicht über die Bildroute umgehen.");

const snakeCaseOwnersCreate = await editorRuntime.window.fetch("/api/contacts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: {
      name: "Snake-Case Owner-Liste",
      owner_ids: ["demo-profile-editor"],
      email: "snake-owner-list@example.invalid",
      status: "active"
    }
  })
});
assert.equal(snakeCaseOwnersCreate.status, 201);
assert.equal((await snakeCaseOwnersCreate.json()).contactChannelAccess, "owner", "owner_ids muss als normalisierte Owner-Liste gelten.");

const scalarOwnerFallbackCreate = await editorRuntime.window.fetch("/api/contacts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: {
      name: "Skalarer Owner-Fallback",
      owner_id: "demo-profile-editor",
      email: "scalar-owner@example.invalid",
      status: "active"
    }
  })
});
assert.equal(scalarOwnerFallbackCreate.status, 201);
assert.equal((await scalarOwnerFallbackCreate.json()).contactChannelAccess, "owner", "owner_id muss ohne Owner-Liste als Fallback gelten.");

const viewerRuntime = createRuntime({ demoProfile: "demo-profile-viewer" });
const viewerOwnedContact = await (await viewerRuntime.window.fetch("/api/contacts/demo-contact-03")).json();
assert.equal(viewerOwnedContact.contactChannelAccess, "owner", "Die Leseberechtigung folgt der Owner-ID und nicht der Profilrolle.");
assert.equal(viewerOwnedContact.email, "kontakt-003@versorgung.example.invalid");

contactsPayload.items[0].name = "Manipulierter Rückgabewert";
assert.notEqual(api.snapshot().contacts[0].name, "Manipulierter Rückgabewert", "API-Antworten müssen vom internen Zustand entkoppelt sein.");

const contactCountBeforeForbiddenCreate = api.snapshot().contacts.length;
const forbiddenCreateResponse = await window.fetch("/api/contacts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: {
      name: "Nicht autorisierter Kontakt",
      ownerIds: ["demo-profile-editor"],
      email: "nicht-erlaubt@example.invalid",
      status: "active"
    }
  })
});
assert.equal(forbiddenCreateResponse.status, 403, "Kontaktdaten dürfen beim Erstellen nur durch einen finalen Owner gesetzt werden.");
assert.equal(api.snapshot().contacts.length, contactCountBeforeForbiddenCreate, "Ein abgelehntes Create darf den Rohzustand nicht verändern.");

const restrictedCreateResponse = await window.fetch("/api/contacts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: {
      name: "Ownerloser Kontakt",
      ownerIds: [],
      email: "",
      phone: "",
      status: "active"
    }
  })
});
assert.equal(restrictedCreateResponse.status, 201, "Ein Kontakt ohne gesetzte Kontaktkanäle darf weiterhin ownerlos angelegt werden.");
const restrictedCreatedContact = await restrictedCreateResponse.json();
assert.equal(restrictedCreatedContact.contactChannelAccess, "restricted");
assert.equal(restrictedCreatedContact.email, "");
assert.equal(restrictedCreatedContact.phone, "");

const createResponse = await window.fetch("/api/contacts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Lokal erstellter Kontakt",
    organizationId: "demo-org-nordstadt",
    organization: "MVZ Spreewinkel",
    category: "Praxis",
    ownerId: "demo-profile-admin",
    ownerIds: ["demo-profile-admin"],
    email: "runtime-kontakt@example.invalid",
    image: "https://tracker.example.invalid/kontakt.png",
    status: "active"
  })
});
assert.equal(createResponse.status, 201);
const createdContact = await createResponse.json();
assert.match(createdContact.id, /^demo-contact-local-\d+$/, "Lokal angelegte Entitäten benötigen reservierte Demo-IDs.");
assert.equal(createdContact.image, "", "Externe Kontaktbilder dürfen in der öffentlichen Demo nicht nachgeladen werden.");
assert.equal(createdContact.contactChannelAccess, "owner");
assert.equal(createdContact.email, "runtime-kontakt@example.invalid");
assert.equal(createdContact.relationshipBasis, "review_required", "Neue Demo-Kontakte benötigen eine explizite Standard-Beziehungsgrundlage.");
assert.equal(createdContact.mitmachenConsentStatus, "not_requested", "Neue Demo-Kontakte dürfen keine #Mitmachen-Einwilligung vortäuschen.");
assert.equal(createdContact.ehcConsentStatus, "not_requested", "Neue Demo-Kontakte dürfen keine EHC-Einwilligung vortäuschen.");
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
  assert.equal(createdContact[field], "", `Neue Demo-Kontakte müssen ${field} leer initialisieren.`);
}
assert.equal(api.snapshot().contacts.length, immutableBaselineCount + 2);
assert.equal(window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.length, immutableBaselineCount, "Mutationen dürfen die veröffentlichte Baseline nicht verändern.");

const activityCountBeforeForbiddenPatch = api.snapshot().activityEvents.length;
const forbiddenPatchResponse = await window.fetch("/api/contacts/demo-contact-02", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "ueberschrieben@example.invalid", phone: "+49 000 999999" })
});
assert.equal(forbiddenPatchResponse.status, 403, "Ein Non-Owner-PATCH mit E-Mail oder Telefon muss fail-closed antworten.");
assert.equal(api.snapshot().activityEvents.length, activityCountBeforeForbiddenPatch, "Ein abgelehnter PATCH darf kein Aktivitätsereignis erzeugen.");

const allowedNonsensitivePatchResponse = await window.fetch("/api/contacts/demo-contact-02", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ priority: "Hoch" })
});
assert.equal(allowedNonsensitivePatchResponse.status, 200, "Non-Owner dürfen unsensible Felder gemäß bestehendem Demo-Vertrag weiter ändern.");
const allowedNonsensitivePatch = await allowedNonsensitivePatchResponse.json();
assert.equal(allowedNonsensitivePatch.priority, "Hoch");
assert.equal(allowedNonsensitivePatch.contactChannelAccess, "restricted");
assert.equal(allowedNonsensitivePatch.email, "");

const restrictedImageResponse = await window.fetch("/api/contacts/demo-contact-02/image", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contentType: "image/png",
    data: "iVBORw0KGgo=",
    width: 1,
    height: 1
  })
});
assert.equal(restrictedImageResponse.status, 200);
const restrictedContactWithImage = await restrictedImageResponse.json();
assert.equal(restrictedContactWithImage.contactChannelAccess, "restricted", "Auch Bildantworten müssen den Kontakt projizieren.");
assert.equal(restrictedContactWithImage.email, "");
assert.equal(restrictedContactWithImage.phone, "");

const revealUnchangedContactResponse = await window.fetch("/api/contacts/demo-contact-02", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    ownerId: "demo-profile-admin",
    ownerIds: ["demo-profile-admin", "demo-profile-editor"]
  })
});
assert.equal(revealUnchangedContactResponse.status, 200);
const revealedUnchangedContact = await revealUnchangedContactResponse.json();
assert.equal(revealedUnchangedContact.contactChannelAccess, "owner");
assert.equal(
  revealedUnchangedContact.email,
  "kontakt-002@versorgung.example.invalid",
  "Ein abgelehnter Non-Owner-PATCH darf den intern erhaltenen Wert nicht verändern."
);
assert.equal(revealedUnchangedContact.phone, "+49 171 39200 56");

const updateResponse = await window.fetch(`/api/contacts/${encodeURIComponent(createdContact.id)}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ priority: "Hoch", nextStep: "Synthetischen Ablauf lokal prüfen." })
});
assert.equal(updateResponse.status, 200);
const updatedContact = await updateResponse.json();
assert.equal(updatedContact.priority, "Hoch");
assert.equal(updatedContact.contactChannelAccess, "owner");
assert.ok(api.snapshot().activityEvents.length > initialSnapshot.activityEvents.length, "Lokale Mutationen müssen den Demo-Aktivitätsverlauf aktualisieren.");

const retainedEmail = "intern-erhalten@example.invalid";
const retainedPhone = "+49 000 777777";
const ownerLossResponse = await window.fetch("/api/contacts/demo-contact-01", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: retainedEmail,
    phone: retainedPhone,
    ownerId: "demo-profile-editor",
    ownerIds: ["demo-profile-editor"]
  })
});
assert.equal(ownerLossResponse.status, 200, "Die Autorisierung eines Owner-PATCH muss auf dem Zustand vor der Mutation beruhen.");
const contactAfterOwnerLoss = await ownerLossResponse.json();
assert.equal(contactAfterOwnerLoss.contactChannelAccess, "restricted", "Die PATCH-Antwort muss anhand des Zustands nach der Mutation projiziert werden.");
assert.equal(contactAfterOwnerLoss.email, "");
assert.equal(contactAfterOwnerLoss.phone, "");

const restrictedOwnerLossSnapshot = api.snapshot();
const projectedOwnerLossActivity = restrictedOwnerLossSnapshot.activityEvents.find((activity) =>
  activity.contactId === "demo-contact-01"
  && activity.changes?.some((change) => change.fieldName === "ownerIds")
);
assert.ok(projectedOwnerLossActivity, "Unsensible Änderungen müssen im projizierten Verlauf erhalten bleiben.");
assert.ok(
  projectedOwnerLossActivity.changes.every((change) => !["email", "phone"].includes(change.fieldName)),
  "Sensible Feldänderungen dürfen im Snapshot eines Non-Owners nicht erscheinen."
);

const restrictedHistoryResponse = await window.fetch("/api/contacts/demo-contact-01/history");
assert.equal(restrictedHistoryResponse.status, 200);
const restrictedHistory = await restrictedHistoryResponse.json();
const restrictedHistoryEvent = restrictedHistory.items.find((activity) =>
  activity.changes?.some((change) => change.fieldName === "ownerIds")
);
assert.ok(restrictedHistoryEvent);
assert.ok(restrictedHistoryEvent.changes.every((change) => !["email", "phone"].includes(change.fieldName)));

const sensitiveActivitySearchResponse = await window.fetch(`/api/activities?q=${encodeURIComponent(retainedEmail)}`);
const sensitiveActivitySearch = await sensitiveActivitySearchResponse.json();
assert.equal(
  sensitiveActivitySearch.items.length,
  0,
  "Die Aktivitätssuche muss nach der Redaktion filtern und darf keine Trefferzahl als Seitenkanal preisgeben."
);

const restoreOwnerResponse = await window.fetch("/api/contacts/demo-contact-01", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    ownerId: "demo-profile-admin",
    ownerIds: ["demo-profile-admin", "demo-profile-editor"]
  })
});
assert.equal(restoreOwnerResponse.status, 200);
const restoredOwnerContact = await restoreOwnerResponse.json();
assert.equal(restoredOwnerContact.contactChannelAccess, "owner");
assert.equal(restoredOwnerContact.email, retainedEmail, "Owner-Wechsel dürfen den intern gespeicherten E-Mail-Wert nicht löschen.");
assert.equal(restoredOwnerContact.phone, retainedPhone, "Owner-Wechsel dürfen den intern gespeicherten Telefonwert nicht löschen.");

const imageResponse = await window.fetch(`/api/contacts/${encodeURIComponent(createdContact.id)}/image`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contentType: "image/png",
    data: "iVBORw0KGgo=",
    width: 1,
    height: 1,
    sourceLabel: "Synthetisches Testbild"
  })
});
assert.equal(imageResponse.status, 200);
const contactWithImage = await imageResponse.json();
assert.equal(contactWithImage.image, "data:image/png;base64,iVBORw0KGgo=", "Demo-Uploads müssen direkt im Arbeitsspeicher darstellbar sein.");
assert.equal(contactWithImage.imageStoragePath, "", "Demo-Uploads dürfen keinen nicht erreichbaren API-Bildpfad ausgeben.");
assert.equal(runtime.originalFetchCalls.length, 0, "Auch Kontaktbilder dürfen in der Demo keinen Netzwerkzugriff auslösen.");

const noteResponse = await window.fetch("/api/contact-notes", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contactId: createdContact.id,
    title: "Lokale Gesprächsnotiz",
    body: "Rein synthetische Notiz im Arbeitsspeicher."
  })
});
assert.equal(noteResponse.status, 201);
const createdNote = await noteResponse.json();
assert.match(createdNote.id, /^demo-note-local-\d+$/);

const attachmentResponse = await window.fetch("/api/contact-note-attachments", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contactId: createdContact.id,
    noteId: createdNote.id,
    fileName: "synthetischer-test.txt",
    mimeType: "text/plain",
    fileSize: 22,
    extractedText: "Synthetischer Testanhang",
    data: "U3ludGhldGlzY2hlciBUZXN0YW5oYW5n"
  })
});
assert.equal(attachmentResponse.status, 201);
const createdAttachment = await attachmentResponse.json();
assert.ok(api.snapshot().contactNoteAttachments.some((item) => item.id === createdAttachment.id));
const deleteNoteResponse = await window.fetch(`/api/contact-notes/${encodeURIComponent(createdNote.id)}`, { method: "DELETE" });
assert.equal(deleteNoteResponse.status, 200);
assert.ok(!api.snapshot().contactNoteAttachments.some((item) => item.id === createdAttachment.id), "Das Löschen einer Notiz muss lokale Demo-Anhänge wie der Target-FK-Vertrag mit entfernen.");

const registrationResponse = await window.fetch("/api/network-registrations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    firstName: "Lokale",
    lastName: "Registrierung",
    email: "runtime-registrierung@example.invalid",
    organization: "Lokal erstellte Organisation",
    sector: "Praxis"
  })
});
assert.equal(registrationResponse.status, 201);
const registrationPayload = await registrationResponse.json();
assert.equal(registrationPayload.persistence, "memory-only");
assert.equal(registrationPayload.registration.privacyCheckStatus, "synthetic_demo");

const firstNotificationId = initialSnapshot.notifications[0].id;
const notificationResponse = await window.fetch(`/api/notifications/${encodeURIComponent(firstNotificationId)}/read`, { method: "PATCH" });
assert.equal(notificationResponse.status, 200);
assert.equal(api.snapshot().notifications.find((item) => item.id === firstNotificationId)?.unread, false);

const invalidHospitationDayResponse = await window.fetch("/api/hospitations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: { mode: "create", name: "Kalendertag Testkontakt" },
    scheduledOn: "2026-02-31"
  })
});
assert.equal(invalidHospitationDayResponse.status, 400, "Die Demo-API darf keinen unmöglichen Kalendertag akzeptieren.");

const organizationOnlyHospitationResponse = await window.fetch("/api/hospitations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    organization: { mode: "create", name: "Organisation ohne Kontakt" },
    scheduledOn: "2098-05-01"
  })
});
assert.equal(organizationOnlyHospitationResponse.status, 400, "Der verschachtelte Terminvertrag benötigt immer einen Kontakt.");
assert.ok(!api.snapshot().organizations.some((item) => item.name === "Organisation ohne Kontakt"), "Fehlgeschlagene Terminanlagen müssen atomar zurückgerollt werden.");

const nestedHospitationResponse = await window.fetch("/api/hospitations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: { mode: "create", name: "Atomare Hospitation Testkontakt" },
    organization: { mode: "create", name: "Atomare Hospitation Testorganisation" },
    scheduledOn: "2098-05-02",
    status: "Angefragt"
  })
});
assert.equal(nestedHospitationResponse.status, 201);
const nestedHospitation = await nestedHospitationResponse.json();
assert.ok(nestedHospitation.contactId);
assert.ok(nestedHospitation.organizationId);
assert.equal(nestedHospitation.resolvedContact.organizationId, nestedHospitation.organizationId);

const hospitationCountBeforeAtomicRejection = api.snapshot().hospitations.length;
const mismatchedOrganizationResponse = await window.fetch("/api/hospitations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: { mode: "existing", id: nestedHospitation.contactId },
    organization: { mode: "create", name: "Organisation für atomaren Rollback" },
    scheduledOn: "2098-05-03"
  })
});
assert.equal(mismatchedOrganizationResponse.status, 400, "Kontakt und abweichende Organisation dürfen nicht gemeinsam gespeichert werden.");
assert.ok(!api.snapshot().organizations.some((item) => item.name === "Organisation für atomaren Rollback"), "Eine vor dem Fehler erzeugte Organisation muss atomar zurückgerollt werden.");
assert.equal(api.snapshot().hospitations.length, hospitationCountBeforeAtomicRejection, "Ein abgelehnter Termin darf keinen Teildatensatz hinterlassen.");

const organizationCountBeforeReuse = api.snapshot().organizations.length;
const reusedOrganizationResponse = await window.fetch("/api/hospitations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: { mode: "create", name: "Zweiter Kontakt derselben Organisation" },
    organization: { mode: "create", name: " atomare   hospitation testorganisation " },
    scheduledOn: "2098-05-03"
  })
});
assert.equal(reusedOrganizationResponse.status, 201);
const reusedOrganizationHospitation = await reusedOrganizationResponse.json();
assert.equal(reusedOrganizationHospitation.organizationId, nestedHospitation.organizationId, "Eine eindeutig vorhandene Organisation muss normalisiert wiederverwendet werden.");
assert.equal(api.snapshot().organizations.length, organizationCountBeforeReuse, "Die Wiederverwendung darf keine Organisationsdublette erzeugen.");

const organizationOnlyPatchResponse = await window.fetch(`/api/hospitations/${encodeURIComponent(nestedHospitation.id)}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    organization: { mode: "existing", id: nestedHospitation.organizationId }
  })
});
assert.equal(organizationOnlyPatchResponse.status, 200);
const organizationOnlyPatchedHospitation = await organizationOnlyPatchResponse.json();
assert.equal(organizationOnlyPatchedHospitation.contactId, nestedHospitation.contactId, "Ein Organisations-PATCH darf den bestehenden Kontakt nicht lösen.");

const duplicateNameHospitationResponse = await window.fetch("/api/hospitations", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    contact: { mode: "create", name: "Atomare Hospitation Testkontakt" },
    scheduled_on: "2098-05-04",
    status: "Angefragt"
  })
});
assert.equal(duplicateNameHospitationResponse.status, 201);
const duplicateNameHospitation = await duplicateNameHospitationResponse.json();
assert.equal(duplicateNameHospitation.contactId, nestedHospitation.contactId, "Ein eindeutig vorhandener Kontaktname muss wiederverwendet werden.");

const hospitationId = initialSnapshot.hospitations[0].id;
assert.ok(api.snapshot().hospitationObservations.some((item) => (item.hospitationId || item.hospitation_id) === hospitationId));
assert.ok(api.snapshot().hospitationRoadmapAssessments.some((item) => (item.hospitationId || item.hospitation_id) === hospitationId));
assert.ok(api.snapshot().hospitationUnmetNeeds.some((item) => (item.hospitationId || item.hospitation_id) === hospitationId));
const deleteHospitationResponse = await window.fetch(`/api/hospitations/${encodeURIComponent(hospitationId)}`, { method: "DELETE" });
assert.equal(deleteHospitationResponse.status, 200);
const afterHospitationDelete = api.snapshot();
assert.ok(!afterHospitationDelete.hospitationObservations.some((item) => (item.hospitationId || item.hospitation_id) === hospitationId), "Hospitationsbeobachtungen müssen lokal kaskadieren.");
assert.ok(!afterHospitationDelete.hospitationRoadmapAssessments.some((item) => (item.hospitationId || item.hospitation_id) === hospitationId), "Roadmap-Bewertungen müssen lokal kaskadieren.");
assert.ok(!afterHospitationDelete.hospitationUnmetNeeds.some((item) => (item.hospitationId || item.hospitation_id) === hospitationId), "Unmet Needs müssen lokal kaskadieren.");

const formatContractRuntime = createRuntime({
  allDemoContactsInvitable: false,
  mutateDemoData(demoData) {
    demoData.formats = [];
    demoData.contacts = [
      {
        id: "format-contact-ready",
        name: "Formatkontakt Freigegeben",
        status: "active",
        mitmachenConsentStatus: "granted",
        createdAt: FORMAT_TEST_NOW,
        updatedAt: FORMAT_TEST_NOW
      },
      {
        id: "format-contact-archived",
        name: "Formatkontakt Archiviert",
        status: "archived",
        mitmachenConsentStatus: "granted",
        createdAt: FORMAT_TEST_NOW,
        updatedAt: FORMAT_TEST_NOW
      },
      {
        id: "format-contact-second",
        name: "Zweiter Formatkontakt",
        status: "active",
        mitmachenConsentStatus: "granted",
        createdAt: FORMAT_TEST_NOW,
        updatedAt: FORMAT_TEST_NOW
      }
    ];
    demoData.activityEvents = [];
  }
});
const formatFetch = formatContractRuntime.window.fetch;
const formatApi = formatContractRuntime.window.VersorgungsCompassDemoApi;
const formatUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const missingFormatKeyResponse = await formatFetch("/api/formats", {
  method: "POST",
  body: JSON.stringify({ title: "Fehlender Schlüssel" })
});
assert.equal(missingFormatKeyResponse.status, 428);
assert.equal((await missingFormatKeyResponse.json()).code, "FORMAT_IDEMPOTENCY_KEY_REQUIRED");

const invalidFormatKeyResponse = await formatFetch("/api/formats", {
  method: "POST",
  body: JSON.stringify({ title: "Ungültiger Schlüssel", idempotencyKey: "kein-uuid" })
});
assert.equal(invalidFormatKeyResponse.status, 400);
assert.equal((await invalidFormatKeyResponse.json()).code, "FORMAT_IDEMPOTENCY_KEY_INVALID");

const createdFormatResponse = await formatFetch("/api/formats", {
  method: "POST",
  body: JSON.stringify({
    title: "Atomarer Formatvertrag",
    status: "Planung",
    idempotencyKey: formatUuid
  })
});
assert.equal(createdFormatResponse.status, 201);
let contractFormat = await createdFormatResponse.json();
assert.equal(contractFormat.id, formatUuid, "Der Idempotency-Key muss zugleich die stabile Format-ID sein.");
const replayFormatResponse = await formatFetch("/api/formats", {
  method: "POST",
  body: JSON.stringify({
    title: "Atomarer Formatvertrag",
    status: "Planung",
    idempotencyKey: formatUuid
  })
});
assert.equal(replayFormatResponse.status, 201);
assert.equal(formatApi.snapshot().formats.filter((item) => item.id === formatUuid).length, 1);

const oversizedBatchResponse = await formatFetch(`/api/formats/${formatUuid}/participants/batch`, {
  method: "POST",
  body: JSON.stringify({
    items: Array.from({ length: 501 }, () => ({ contactId: "format-contact-ready" }))
  })
});
assert.equal(oversizedBatchResponse.status, 400);
assert.equal((await oversizedBatchResponse.json()).code, "FORMAT_PARTICIPANT_BATCH_SIZE_INVALID");

const duplicateBatchResponse = await formatFetch(`/api/formats/${formatUuid}/participants/batch`, {
  method: "POST",
  body: JSON.stringify({
    items: [
      { contactId: "format-contact-ready" },
      { contactId: "format-contact-ready" }
    ]
  })
});
assert.equal(duplicateBatchResponse.status, 400);
assert.equal((await duplicateBatchResponse.json()).code, "FORMAT_PARTICIPANT_BATCH_DUPLICATE");

const blockedContactResponse = await formatFetch(`/api/formats/${formatUuid}/participants/batch`, {
  method: "POST",
  body: JSON.stringify({ items: [{ contactId: "format-contact-archived" }] })
});
assert.equal(blockedContactResponse.status, 409);
const blockedContactPayload = await blockedContactResponse.json();
assert.equal(blockedContactPayload.code, "FORMAT_PARTICIPANT_CONTACT_UNAVAILABLE");
assert.deepEqual(blockedContactPayload.blockedContactIds, ["format-contact-archived"]);
assert.deepEqual(blockedContactPayload.details.blockedContactIds, ["format-contact-archived"]);

const addParticipantResponse = await formatFetch(`/api/formats/${formatUuid}/participants/batch`, {
  method: "POST",
  body: JSON.stringify({ items: [{ contactId: "format-contact-ready" }] })
});
assert.equal(addParticipantResponse.status, 200);
contractFormat = await addParticipantResponse.json();
let existingParticipant = contractFormat.participants.find((item) => item.contactId === "format-contact-ready");
assert.ok(existingParticipant?.updatedAt);

const invalidParticipantIfMatchResponse = await formatFetch(
  `/api/formats/${formatUuid}/participants/format-contact-ready`,
  {
    method: "PATCH",
    headers: { "If-Match": "\"kein-datum\"" },
    body: JSON.stringify({ notes: "Darf nicht gespeichert werden" })
  }
);
assert.equal(invalidParticipantIfMatchResponse.status, 400);
assert.equal(
  (await invalidParticipantIfMatchResponse.json()).code,
  "FORMAT_PARTICIPANT_PRECONDITION_INVALID"
);

const participantIfMatchResponse = await formatFetch(
  `/api/formats/${formatUuid}/participants/format-contact-ready`,
  {
    method: "PATCH",
    headers: { "If-Match": `W/"${existingParticipant.updatedAt}"` },
    body: JSON.stringify({ notes: "Per If-Match aktualisiert" })
  }
);
assert.equal(participantIfMatchResponse.status, 200);
contractFormat = await participantIfMatchResponse.json();
existingParticipant = contractFormat.participants.find((item) => item.contactId === "format-contact-ready");
assert.equal(existingParticipant.notes, "Per If-Match aktualisiert");

const addSecondParticipantResponse = await formatFetch(`/api/formats/${formatUuid}/participants/batch`, {
  method: "POST",
  body: JSON.stringify({ items: [{ contactId: "format-contact-second" }] })
});
assert.equal(addSecondParticipantResponse.status, 200);
contractFormat = await addSecondParticipantResponse.json();
const secondParticipant = contractFormat.participants.find((item) => item.contactId === "format-contact-second");
const deleteParticipantIfMatchResponse = await formatFetch(
  `/api/formats/${formatUuid}/participants/format-contact-second`,
  {
    method: "DELETE",
    headers: { "if-match": `"${secondParticipant.updatedAt}"` }
  }
);
assert.equal(deleteParticipantIfMatchResponse.status, 200);
contractFormat = await deleteParticipantIfMatchResponse.json();
assert.ok(!contractFormat.participants.some((item) => item.contactId === "format-contact-second"));

const missingImportVersionResponse = await formatFetch(`/api/formats/${formatUuid}/participants/import`, {
  method: "POST",
  body: JSON.stringify({
    items: [{ contactId: "format-contact-ready", participantRole: "Moderation" }]
  })
});
assert.equal(missingImportVersionResponse.status, 428);
assert.equal((await missingImportVersionResponse.json()).code, "FORMAT_PARTICIPANT_IMPORT_PRECONDITION_REQUIRED");

const staleImportResponse = await formatFetch(`/api/formats/${formatUuid}/participants/import`, {
  method: "POST",
  body: JSON.stringify({
    items: [{
      contactId: "format-contact-ready",
      participantRole: "Moderation",
      expectedUpdatedAt: "2025-01-01T00:00:00.000Z"
    }]
  })
});
assert.equal(staleImportResponse.status, 409);
assert.equal((await staleImportResponse.json()).code, "FORMAT_PARTICIPANT_IMPORT_VERSION_CONFLICT");

const importResponse = await formatFetch(`/api/formats/${formatUuid}/participants/import`, {
  method: "POST",
  body: JSON.stringify({
    items: [{
      contactId: "format-contact-ready",
      participantRole: "Moderation",
      expectedUpdatedAt: existingParticipant.updatedAt
    }]
  })
});
assert.equal(importResponse.status, 200);
contractFormat = await importResponse.json();
const participantAfterImport = contractFormat.participants.find((item) => item.contactId === "format-contact-ready");
assert.equal(participantAfterImport.participantRole, "Moderation");
const formatUpdatedAtBeforeNoop = contractFormat.updatedAt;
const participantUpdatedAtBeforeNoop = participantAfterImport.updatedAt;
const activityCountBeforeNoop = formatApi.snapshot().activityEvents.length;
const noopImportResponse = await formatFetch(`/api/formats/${formatUuid}/participants/import`, {
  method: "POST",
  body: JSON.stringify({
    items: [{
      contactId: "format-contact-ready",
      invitationStatus: "Kandidat",
      participantRole: "Moderation",
      notes: ""
    }]
  })
});
assert.equal(noopImportResponse.status, 200);
contractFormat = await noopImportResponse.json();
assert.equal(contractFormat.updatedAt, formatUpdatedAtBeforeNoop, "Ein identischer Import darf das Format nicht versionieren.");
assert.equal(
  contractFormat.participants.find((item) => item.contactId === "format-contact-ready").updatedAt,
  participantUpdatedAtBeforeNoop,
  "Ein identischer Import darf die Beteiligung nicht versionieren."
);
assert.equal(formatApi.snapshot().activityEvents.length, activityCountBeforeNoop, "Ein identischer Import darf kein Ereignis erzeugen.");

const invalidFormatIfMatchResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "PATCH",
  headers: { "If-Match": "\"kein-datum\"" },
  body: JSON.stringify({ title: "Darf nicht gespeichert werden" })
});
assert.equal(invalidFormatIfMatchResponse.status, 400);
assert.equal((await invalidFormatIfMatchResponse.json()).code, "FORMAT_PRECONDITION_INVALID");

const staleFormatIfMatchResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "PATCH",
  headers: { "If-Match": "\"2025-01-01T00:00:00.000Z\"" },
  body: JSON.stringify({ title: "Darf ebenfalls nicht gespeichert werden" })
});
assert.equal(staleFormatIfMatchResponse.status, 409);
assert.equal((await staleFormatIfMatchResponse.json()).code, "FORMAT_VERSION_CONFLICT");

const formatIfMatchResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "PATCH",
  headers: { "If-Match": `W/"${contractFormat.updatedAt}"` },
  body: JSON.stringify({ title: "Per If-Match aktualisiert" })
});
assert.equal(formatIfMatchResponse.status, 200);
contractFormat = await formatIfMatchResponse.json();
assert.equal(contractFormat.title, "Per If-Match aktualisiert");

const bodyPrecedenceResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "PATCH",
  headers: { "If-Match": "\"2025-01-01T00:00:00.000Z\"" },
  body: JSON.stringify({
    goal: "Body-Version bleibt vorrangig",
    expectedUpdatedAt: contractFormat.updatedAt
  })
});
assert.equal(bodyPrecedenceResponse.status, 200);
contractFormat = await bodyPrecedenceResponse.json();
assert.equal(contractFormat.goal, "Body-Version bleibt vorrangig");

const implicitArchiveResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "Archiviert", expectedUpdatedAt: contractFormat.updatedAt })
});
assert.equal(implicitArchiveResponse.status, 409);
assert.equal((await implicitArchiveResponse.json()).code, "FORMAT_ARCHIVE_ACTION_REQUIRED");

const archiveResponse = await formatFetch(`/api/formats/${formatUuid}/archive`, {
  method: "POST",
  headers: { "If-Match": `W/"${contractFormat.updatedAt}"` }
});
assert.equal(archiveResponse.status, 200);
contractFormat = await archiveResponse.json();
const archivedParticipantMutation = await formatFetch(`/api/formats/${formatUuid}/participants/batch`, {
  method: "POST",
  body: JSON.stringify({ items: [{ contactId: "format-contact-ready" }] })
});
assert.equal(archivedParticipantMutation.status, 409);
assert.equal((await archivedParticipantMutation.json()).code, "FORMAT_RESTORE_ACTION_REQUIRED");
const archivedPatchResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "PATCH",
  body: JSON.stringify({ title: "Unzulässige Änderung", expectedUpdatedAt: contractFormat.updatedAt })
});
assert.equal(archivedPatchResponse.status, 409);
assert.equal((await archivedPatchResponse.json()).code, "FORMAT_RESTORE_ACTION_REQUIRED");

const restoreResponse = await formatFetch(`/api/formats/${formatUuid}/restore`, {
  method: "POST",
  headers: { "if-match": `"${contractFormat.updatedAt}"` }
});
assert.equal(restoreResponse.status, 200);
contractFormat = await restoreResponse.json();
assert.equal(contractFormat.status, "Planung");

const bodyArchiveResponse = await formatFetch(`/api/formats/${formatUuid}/archive`, {
  method: "POST",
  body: JSON.stringify({ expectedUpdatedAt: contractFormat.updatedAt })
});
assert.equal(bodyArchiveResponse.status, 200);
contractFormat = await bodyArchiveResponse.json();

const deleteWithoutVersion = await formatFetch(`/api/formats/${formatUuid}`, { method: "DELETE" });
assert.equal(deleteWithoutVersion.status, 428);
assert.equal((await deleteWithoutVersion.json()).code, "FORMAT_PRECONDITION_REQUIRED");
const deleteFormatResponse = await formatFetch(`/api/formats/${formatUuid}`, {
  method: "DELETE",
  headers: { "If-Match": `"${contractFormat.updatedAt}"` }
});
assert.equal(deleteFormatResponse.status, 200);
assert.ok(!formatApi.snapshot().formats.some((item) => item.id === formatUuid));

const editorFormatRuntime = createRuntime({
  demoProfile: "demo-profile-editor",
  mutateDemoData(demoData) {
    demoData.formats = [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Editor-Import gesperrt",
      status: "Planung",
      createdAt: FORMAT_TEST_NOW,
      updatedAt: FORMAT_TEST_NOW,
      participants: []
    }];
  }
});
const editorImportResponse = await editorFormatRuntime.window.fetch(
  "/api/formats/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/participants/import",
  {
    method: "POST",
    body: JSON.stringify({ items: [{ contactId: "demo-contact-01" }] })
  }
);
assert.equal(editorImportResponse.status, 403);
assert.equal((await editorImportResponse.json()).code, "FORMAT_ADMIN_REQUIRED");

const unknownResponse = await window.fetch("/api/not-part-of-demo-contract", { method: "POST" });
assert.equal(unknownResponse.status, 501, "Unbekannte Demo-Routen müssen fail-closed antworten.");
assert.equal(runtime.originalFetchCalls.length, 0, "Auch unbekannte /api-Aufrufe dürfen nicht ins Netzwerk fallen.");
assert.equal(runtime.storageAccesses.length, 0, "Demo-Mutationen dürfen keinen persistenten Browser-Speicher berühren.");

const resetSnapshot = api.reset();
assert.deepEqual(resetSnapshot, initialSnapshot, "Runtime-Reset muss den vollständigen Ausgangszustand wiederherstellen.");
assert.deepEqual(api.snapshot(), initialSnapshot, "Snapshot nach Reset muss der unveränderten Baseline entsprechen.");
assert.equal(runtime.dispatchedEvents.at(-1)?.type, "versorgungs-compass:demo-reset", "Runtime-Reset muss das dokumentierte Reset-Ereignis auslösen.");
assert.equal(runtime.storageAccesses.length, 0, "Runtime-Reset darf keinen persistenten Browser-Speicher berühren.");

const staticResponse = await window.fetch("/public/demo-profile-admin.svg");
assert.equal(staticResponse.status, 200);
assert.equal(runtime.originalFetchCalls.length, 1, "Nur statische Nicht-API-Ressourcen dürfen an den ursprünglichen Fetch weitergereicht werden.");

console.log(
  "Demo-API-Vertrag OK: explizite Demo-Aktivierung, lokales CRUD, fail-closed Routen, " +
  "tiefer Runtime-Reset und memory-only Betrieb ohne Supabase oder Browser-Persistenz geprüft."
);
