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
assert.match(dataServiceSource, /VersorgungsCompassDemoApi[\s\S]*?active\s*===\s*true/, "Der gemeinsame Data-Service muss im Demo-Profil einen aktiven lokalen Adapter verlangen.");
assert.match(registrationSource, /VersorgungsCompassDemoApi[\s\S]*?active\s*===\s*true/, "Die öffentliche Registrierung muss im Demo-Profil einen aktiven lokalen Adapter verlangen.");

for (const forbiddenDemoAsset of ["data/demo-data.js", "data/demo-api.js"]) {
  assert.match(
    targetAuditSource,
    new RegExp(`["']${forbiddenDemoAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`),
    `Target-Audit muss ${forbiddenDemoAsset} ausdrücklich ausschließen.`
  );
}

function createRuntime({ dataMode = "demo", authMode = "anonymous-demo" } = {}) {
  const originalFetchCalls = [];
  const dispatchedEvents = [];
  const documentListeners = new Map();
  const storageAccesses = [];
  const location = new URL("https://demo.example.invalid/versorgungs-kompass.html");
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
      demoRole: "admin"
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

const contactsResponse = await window.fetch("/api/contacts?includeArchived=true");
assert.equal(contactsResponse.status, 200);
assert.equal(contactsResponse.headers.get("X-Versorgungs-Kompass-Demo"), "memory-only");
const contactsPayload = await contactsResponse.json();
assert.equal(contactsPayload.items.length, 64);
assert.equal(runtime.originalFetchCalls.length, 0, "Lokale Demo-API-Aufrufe dürfen das Netzwerk nicht erreichen.");

contactsPayload.items[0].name = "Manipulierter Rückgabewert";
assert.notEqual(api.snapshot().contacts[0].name, "Manipulierter Rückgabewert", "API-Antworten müssen vom internen Zustand entkoppelt sein.");

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
assert.equal(api.snapshot().contacts.length, 65);
assert.equal(window.VERSORGUNGS_COMPASS_DEMO_DATA.contacts.length, immutableBaselineCount, "Mutationen dürfen die veröffentlichte Baseline nicht verändern.");

const updateResponse = await window.fetch(`/api/contacts/${encodeURIComponent(createdContact.id)}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ priority: "Hoch", nextStep: "Synthetischen Ablauf lokal prüfen." })
});
assert.equal(updateResponse.status, 200);
assert.equal((await updateResponse.json()).priority, "Hoch");
assert.ok(api.snapshot().activityEvents.length > initialSnapshot.activityEvents.length, "Lokale Mutationen müssen den Demo-Aktivitätsverlauf aktualisieren.");

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
