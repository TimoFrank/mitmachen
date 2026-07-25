import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const demoDataSource = fs.readFileSync("frontend/data/demo-data.js", "utf8");
const demoApiSource = fs.readFileSync("frontend/data/demo-api.js", "utf8");
const dataServiceSource = fs.readFileSync("frontend/data/data-service.js", "utf8");
const registrationSource = fs.readFileSync("frontend/pages/mitmachen/versorgungs-netzwerk.js", "utf8");
const targetAuditSource = fs.readFileSync("scripts/audit_target_assets.mjs", "utf8");

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
assert.match(demoApiSource, /contactChannelAccess:\s*hasAccess\s*\?\s*["']owner["']\s*:\s*["']restricted["']/, "Der Demo-Adapter muss den Kontaktkanal-Zugriff explizit ausweisen.");
assert.match(demoApiSource, /<strong>Hinweis:<\/strong>\s*<span>Öffentliche Demo<\/span>/, "Der Demo-Hinweis muss die öffentliche Demo knapp als Hinweis benennen.");
assert.doesNotMatch(demoApiSource, /Bitte keine echten Angaben eingeben/, "Der subtile Demo-Hinweis darf keinen zusätzlichen Warnsatz anzeigen.");
assert.match(demoApiSource, /data-demo-notice-close>OK<\/button>/, "Der Demo-Hinweis muss sich mit einer knappen Bestätigung schließen lassen.");
assert.match(demoApiSource, /id\s*=\s*["']vk-public-demo-trigger["']/, "Die geschlossene Demo-Leiste muss über einen schwebenden Trigger wieder erreichbar sein.");
assert.match(demoApiSource, /<svg viewBox=["']0 0 24 24["']>[\s\S]*?<circle[\s\S]*?<path/, "Der geschlossene Demo-Hinweis muss ein echtes Info-Symbol statt eines Buchstabens verwenden.");
assert.match(demoApiSource, /const\s+DEMO_NOTICE_DATA_VIEWS\s*=\s*new Set/, "Der Demo-Hinweis muss auf ausdrücklich freigegebene Datenansichten begrenzt sein.");
assert.match(demoApiSource, /DEMO_NOTICE_DATA_VIEWS\.has\(activeView\)/, "Die Sichtbarkeit des Demo-Hinweises muss der aktiven Datenansicht folgen.");
assert.match(demoApiSource, /mobileViewport\.matches[\s\S]*?is-mobile-sidebar-expanded/, "Die Demo-Kennzeichnung darf die geöffnete mobile Navigation nicht überdecken.");
assert.match(demoApiSource, /attributeFilter:\s*\[\s*["']data-active-view["']\s*,\s*["']class["']\s*\]/, "Der Demo-Hinweis muss auf Ansichts- und Navigationswechsel reagieren.");
assert.doesNotMatch(demoApiSource, /Demo zurücksetzen|Änderungen verschwinden beim Neuladen|window\.location\.reload\s*\(/, "Das Schließen des Demo-Hinweises darf weder Reset-Text noch Reload-Logik enthalten.");
assert.match(dataServiceSource, /VersorgungsCompassDemoApi[\s\S]*?active\s*===\s*true/, "Der gemeinsame Data-Service muss im Demo-Profil einen aktiven lokalen Adapter verlangen.");
assert.match(registrationSource, /function\s+completeDemo\s*\(/, "Die Konzeptdemo muss ihren rein lokalen Abschluss explizit benennen.");
assert.doesNotMatch(registrationSource, /VersorgungsCompassDemoApi|\b(?:fetch|XMLHttpRequest|sendBeacon)\b/, "Die Konzeptdemo darf weder den Demo-Adapter noch eine Transport-API verwenden.");

for (const forbiddenDemoAsset of ["data/demo-data.js", "data/demo-api.js"]) {
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
  ownerOnlyContactChannels = true,
  mutateDemoData
} = {}) {
  const originalFetchCalls = [];
  const dispatchedEvents = [];
  const documentListeners = new Map();
  const storageAccesses = [];
  const location = new URL("https://demo.example.invalid/versorgungs-kompass.html");
  if (demoProfile) location.searchParams.set("demoProfile", demoProfile);
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
        ownerOnlyContactChannels
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

const inactiveRuntime = createRuntime({ dataMode: "api", authMode: "oidc" });
assert.equal(inactiveRuntime.window.fetch, inactiveRuntime.originalFetch, "Demo-API darf sich außerhalb des expliziten Demo-Profils nicht aktivieren.");
assert.equal(inactiveRuntime.window.VersorgungsCompassDemoApi, undefined, "Target-Profil darf keine Demo-Runtime exportieren.");
assert.equal(inactiveRuntime.window.VERSORGUNGS_COMPASS_DEMO_RUNTIME, undefined, "Target-Profil darf keine Demo-Metadaten exportieren.");

const editorRuntime = createRuntime({ demoProfile: "demo-profile-editor" });
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
const legacyContactResponse = await legacyDemoRuntime.window.fetch("/api/contacts/demo-contact-02");
const legacyContact = await legacyContactResponse.json();
assert.equal(legacyContact.email, "demo-contact-02@example.invalid", "Ohne Pages-Capability muss der bisherige Demo-Vertrag unverändert bleiben.");
assert.equal(legacyContact.contactChannelAccess, undefined, "Ohne Pages-Capability darf kein neuer Access-State erzwungen werden.");

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
    publicDemo: true,
    persistence: "memory-only",
    resetOnReload: true,
    syntheticOnly: true
  },
  "Die Runtime-Metadaten müssen den öffentlichen, synthetischen memory-only Betrieb eindeutig beschreiben."
);
assert.equal(runtime.storageAccesses.length, 0, "Initialisierung darf keinen persistenten Browser-Speicher berühren.");
assert.ok(runtime.documentListeners.has("DOMContentLoaded"), "Der sichtbare Demo-Hinweis muss für DOMContentLoaded registriert sein.");

const initialSnapshot = api.snapshot();
const immutableBaselineCount = window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.length;
assert.equal(initialSnapshot.contacts.length, 64);
assert.equal(initialSnapshot.organizations.length, 32);
assert.equal(initialSnapshot.currentProfileId, "demo-profile-admin");
assert.equal(initialSnapshot.organizationPrimarySystems.length, 32);
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-01")?.contactChannelAccess, "owner");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-01")?.email, "demo-contact-01@example.invalid");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-02")?.contactChannelAccess, "restricted");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-02")?.email, "");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-02")?.phone, "");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-17")?.contactChannelAccess, "restricted");
assert.equal(initialSnapshot.contacts.find((contact) => contact.id === "demo-contact-17")?.email, "", "Ownerlose Kontakte müssen für alle Demo-Profile eingeschränkt bleiben.");
assert.equal(
  window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.find((contact) => contact.id === "demo-contact-02")?.email,
  "demo-contact-02@example.invalid",
  "Die Projektion darf die synthetische Baseline nicht verändern."
);

const contactsResponse = await window.fetch("/api/contacts?includeArchived=true");
assert.equal(contactsResponse.status, 200);
assert.equal(contactsResponse.headers.get("X-Versorgungs-Kompass-Demo"), "memory-only");
const contactsPayload = await contactsResponse.json();
assert.equal(contactsPayload.items.length, 64);
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
assert.equal(editorSharedContact.email, "demo-contact-01@example.invalid");
assert.equal(editorOwnedContact.contactChannelAccess, "owner");
assert.equal(editorOwnedContact.phone, "+49 000 120002");

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
assert.equal(viewerOwnedContact.email, "demo-contact-03@example.invalid");

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
      name: "Ownerloser Demo-Kontakt",
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
    name: "Demo Runtime Kontakt",
    organizationId: "demo-org-nordstadt",
    organization: "Demo-MVZ Nordstadt",
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
assert.equal(api.snapshot().contacts.length, 66);
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
  "demo-contact-02@example.invalid",
  "Ein abgelehnter Non-Owner-PATCH darf den intern erhaltenen Wert nicht verändern."
);
assert.equal(revealedUnchangedContact.phone, "+49 000 120002");

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
    title: "Demo Runtime Notiz",
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
    firstName: "Demo Runtime",
    lastName: "Registrierung",
    email: "runtime-registrierung@example.invalid",
    organization: "Demo Runtime Organisation",
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
