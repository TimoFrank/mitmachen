import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {}, console, URL, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync("frontend/data/hospitation-model.js", "utf8"), context);
const model = context.window.VersorgungsCompassHospitationModel;
const values = (key) => Array.from(model.codebook[key], (entry) => typeof entry === "object" ? entry.value : entry);
const fixedTime = "2026-09-12T10:00:00.000Z";

// Der Bestand ist absichtlich unabhängig von den neuen Modellkonstanten festgehalten.
// So meldet der Test auch eine spätere versehentliche Entfernung alter Kategorien.
const legacyValues = {
  processPhase: ["Anmeldung / Aufnahme", "Identifikation", "Behandlung / Beratung", "Verordnung", "Überweisung", "Befund / Dokumentation", "Kommunikation mit Patient:innen", "Kommunikation mit anderen Einrichtungen", "Nachbereitung", "Sonstiges"],
  problemType: ["Medienbruch", "fehlende Information", "doppelte Dokumentation", "Rückfrage", "Wartezeit", "Workaround", "Systemverständnis", "Rollenunklarheit", "technisches Problem", "positives Muster / Best Practice", "offene Frage", "Übernahme nötig"],
  impact: ["Zeitaufwand", "Fehleranfälligkeit", "Frust / Belastung", "Informationsverlust", "Patient:innen müssen selbst vermitteln", "Prozessverzögerung", "Sicherheitsgefühl sinkt", "Arbeitsfluss wird unterbrochen", "Ablauf funktioniert gut"],
  observationType: ["Reibung / Problem", "positives Beispiel", "Gegenbeispiel", "offene Frage", "Kontextwissen"]
};
const legacyAliases = {
  processPhase: {
    dokumentation: "Befund / Dokumentation", befundsuche: "Befund / Dokumentation",
    "überweisung / befundsuche": "Überweisung", "ueberweisung / befundsuche": "Überweisung",
    "verordnung und statusklärung": "Verordnung", "verordnung und statusklaerung": "Verordnung",
    "koordination und anschlussversorgung": "Nachbereitung",
    "patientenverständnis und nächste schritte": "Kommunikation mit Patient:innen",
    "patientenverstaendnis und naechste schritte": "Kommunikation mit Patient:innen",
    "prozessphase offen": "Sonstiges"
  },
  problemType: {
    statusunklarheit: "fehlende Information", informationslücke: "fehlende Information", informationsluecke: "fehlende Information",
    übergabeverzug: "fehlende Information", uebergabeverzug: "fehlende Information",
    verständlichkeitslücke: "Systemverständnis", verstaendlichkeitsluecke: "Systemverständnis",
    koordinationsaufwand: "Rollenunklarheit", "einordnung offen": "offene Frage"
  },
  impact: {
    zeit: "Zeitaufwand", mehraufwand: "Zeitaufwand", fehler: "Fehleranfälligkeit",
    fehleranfällig: "Fehleranfälligkeit", fehleranfaellig: "Fehleranfälligkeit",
    belastung: "Frust / Belastung", frust: "Frust / Belastung",
    informationslücke: "Informationsverlust", informationsluecke: "Informationsverlust", statusverlust: "Informationsverlust",
    vermittlungsaufwand: "Patient:innen müssen selbst vermitteln",
    verzögerung: "Prozessverzögerung", verzoegerung: "Prozessverzögerung", wartezeit: "Prozessverzögerung",
    unsicherheit: "Sicherheitsgefühl sinkt", unterbrechung: "Arbeitsfluss wird unterbrochen", "funktioniert gut": "Ablauf funktioniert gut"
  },
  observationType: {
    reibung: "Reibung / Problem", problem: "Reibung / Problem", "positives muster": "positives Beispiel",
    "positives beispiel": "positives Beispiel", bestpractice: "positives Beispiel", "best practice": "positives Beispiel",
    gegenbeispiel: "Gegenbeispiel", frage: "offene Frage", "offene frage": "offene Frage", kontext: "Kontextwissen", kontextwissen: "Kontextwissen"
  },
  evidenceType: {
    "direkt beobachtet": "directly_observed", "aus anonymisierter beobachtungsunterlage": "source_bound",
    "synthetisch, quellenbasiert": "synthetic_source_based", quellenbasiert: "synthetic_source_based",
    berichtet: "reported", interpretiert: "interpreted"
  }
};

function normalizedAndRoundTrip(key, input, expected) {
  const observation = model.normalizeObservation({
    id: "observation-codebook-fixture", description: "Synthetischer Testfall", [key]: input,
    createdAt: fixedTime, updatedAt: fixedTime
  });
  assert.equal(observation[key], expected, `${key}: ${input} muss als ${expected} erhalten bleiben.`);
  const payload = model.serializeDocumentationPayload({ observations: [observation], updatedAt: fixedTime });
  const restored = model.parseDocumentationOutcome(payload).observations[0];
  assert.equal(restored[key], expected, `${key}: ${input} geht beim Dokumentations-Roundtrip verloren.`);
  assert.equal(model.normalizeObservation(restored)[key], expected, `${key}: wiederholte Normalisierung verändert ${input}.`);
}

assert.equal(model.codebookVersion, "1.1-erprobung");
for (const [key, entries] of Object.entries(legacyValues)) {
  for (const value of entries) {
    normalizedAndRoundTrip(key, value, value);
    assert.equal(model.isLegacyCodebookValue(key, value), true, `${key}: Altwert ${value} ist nicht gekennzeichnet.`);
    assert.equal(model.codebookDefinition(key, value), null, `${key}: Altwert erhält irreführend eine neue Definition.`);
    assert.equal(values(key).includes(value), false, `${key}: Altwert wird als neue Auswahl angeboten.`);
  }
}
for (const [key, aliases] of Object.entries(legacyAliases)) {
  for (const [alias, canonical] of Object.entries(aliases)) {
    normalizedAndRoundTrip(key, alias, canonical);
    assert.equal(model.isLegacyCodebookValue(key, alias), key !== "evidenceType", `${key}: Alias ${alias} ist falsch gekennzeichnet.`);
  }
}

const expectedCurrentValues = {
  processPhase: ["Zugang", "Aufnahme", "Abklärung", "Versorgung", "Übergang", "Nachsorge", "Übergreifend", "Noch nicht zuordenbar"],
  problemType: ["Information fehlt", "Doppelte Dokumentation", "Technik gestört", "Abstimmung unklar", "Verständnis erschwert", "Kapazität fehlt", "Anderer Aspekt", "Kein Hindernis", "Noch nicht zuordenbar"],
  impact: ["Zusätzliche Arbeit", "Verzögerung", "Fehler", "Belastung", "Entlastung", "Andere Folge", "Nicht feststellbar"],
  observationType: ["Hindernis", "Gelungener Ablauf", "Kontext"],
  evidenceType: ["directly_observed", "reported", "source_bound", "interpreted", "synthetic_source_based"]
};
for (const [key, expected] of Object.entries(expectedCurrentValues)) {
  assert.deepEqual(values(key), expected, `${key}: Auswahl weicht vom erprobten Codebuch ab.`);
  const field = model.codebookFieldDefinitions[key];
  for (const property of ["question", "guide", "basis"]) assert.ok(field?.[property]?.trim(), `${key}: Feldhilfe ${property} fehlt.`);
  for (const value of expected) {
    normalizedAndRoundTrip(key, value, value);
    assert.equal(model.isLegacyCodebookValue(key, value), false, `${key}: Neuer Wert ${value} wird als Altwert behandelt.`);
    const definition = model.codebookDefinition(key, value);
    for (const property of ["definition", "inclusion", "exclusion", "example", "boundary", "basis"]) {
      assert.equal(typeof definition?.[property], "string", `${key}/${value}: ${property} fehlt.`);
      assert.ok(definition[property].trim(), `${key}/${value}: ${property} ist leer.`);
    }
  }
}

// Großgeschriebene neue Codes dürfen historische Aliases nicht umdeuten.
for (const [key, current, alias, expected] of [
  ["impact", "Fehler", "fehler", "Fehleranfälligkeit"],
  ["impact", "Belastung", "belastung", "Frust / Belastung"],
  ["impact", "Verzögerung", "verzögerung", "Prozessverzögerung"],
  ["problemType", "Doppelte Dokumentation", "doppelte Dokumentation", "doppelte Dokumentation"],
  ["observationType", "Kontext", "kontext", "Kontextwissen"]
]) {
  assert.equal(model.normalizeCodebookValue(key, current), current);
  assert.equal(model.normalizeCodebookValue(key, alias), expected);
}
for (const [id, label] of [
  ["directly_observed", "direkt beobachtet"], ["reported", "berichtet"], ["source_bound", "Beobachtungsunterlage"],
  ["interpreted", "Annahme"], ["synthetic_source_based", "synthetisches Beispiel"]
]) {
  assert.equal(model.optionLabel("evidenceType", id), label);
  assert.equal(model.normalizeCodebookValue("evidenceType", label), id);
}
for (const [value, label] of [
  ["Information fehlt", "Fehlende Information"], ["Doppelte Dokumentation", "Doppelte Dokumentation"],
  ["Technik gestört", "Technische Störung"], ["Abstimmung unklar", "Unklare Abstimmung"],
  ["Verständnis erschwert", "Verständnisproblem"], ["Kapazität fehlt", "Fehlende Kapazität"],
  ["Anderer Aspekt", "Anderes Problem"], ["Kein Hindernis", "Kein Problem erkennbar"],
  ["Noch nicht zuordenbar", "Noch nicht zuordenbar"]
]) {
  assert.equal(model.optionLabel("problemType", value), label);
  assert.equal(model.normalizeCodebookValue("problemType", label), value);
}
assert.equal(model.optionLabel("problemType", "Übernahme nötig"), "Übernahme nötig", "Die engere Doppeldokumentation darf einen bisherigen Übernahme-Code nicht umbenennen.");
assert.match(model.codebookDefinition("problemType", "Doppelte Dokumentation").exclusion, /einmaliges Scannen/);

// Ein Code darf weder Folgen noch Ursachen, Quellen oder positive Fälle erfinden.
for (const problemType of [...expectedCurrentValues.problemType, ...legacyValues.problemType]) {
  const result = model.normalizeObservation({ problemType });
  for (const key of ["impact", "observationType", "evidenceType", "usageRecommendation", "immediateConsequence", "nextStep"]) {
    assert.equal(result[key], "", `${problemType} erzeugt ungefragt ${key}.`);
  }
  assert.equal(result.relevanceScore, null, "Ein Code darf keine Relevanzbewertung erzeugen.");
}
for (const observationType of ["Gelungener Ablauf", "Kontext", "positives Beispiel", "Gegenbeispiel", "offene Frage"]) {
  const result = model.normalizeObservation({ observationType });
  assert.equal(result.observationType, observationType);
  assert.equal(result.problemType, "", "Die Beobachtungsart darf kein Problem erzeugen.");
  assert.equal(result.impact, "", "Die Beobachtungsart darf keine Folge erzeugen.");
}
assert.equal(model.normalizeObservation({}).evidenceType, "", "Eine fehlende Quelle muss offen bleiben.");
normalizedAndRoundTrip("evidenceType", "", "");
for (const originalEvidenceType of expectedCurrentValues.evidenceType) {
  normalizedAndRoundTrip("originalEvidenceType", originalEvidenceType, originalEvidenceType);
}
const sourceBoundSeed = model.normalizeObservation({
  evidenceType: "reported", payload: { originalEvidenceType: "synthetic_source_based" }
});
assert.equal(sourceBoundSeed.originalEvidenceType, "synthetic_source_based", "Die bekannte synthetische Herkunft darf beim Normalisieren nicht verloren gehen.");
assert.equal(Object.hasOwn(model.normalizeObservation({}), "originalEvidenceType"), false, "Eine ursprüngliche Quelle darf nicht erfunden werden.");
assert.equal(Object.hasOwn(model.normalizeObservation({ originalEvidenceType: "unbekannt" }), "originalEvidenceType"), false, "Nur bekannte Herkunfts-IDs sind erlaubt.");
assert.equal(model.normalizeCodebookValue("problemType", "unbekannter Code", "offen"), "offen");
assert.equal(model.isLegacyCodebookValue("problemType", "unbekannter Code"), false);
assert.equal(model.codebookDefinition("problemType", "unbekannter Code"), null);
assert.equal(model.normalizeObservation({ relevanceScore: 4, usageRecommendation: "Produkt prüfen" }).relevanceScore, 4);
assert.equal(model.normalizeObservation({ relevanceScore: 4, usageRecommendation: "Produkt prüfen" }).usageRecommendation, "Produkt prüfen");

// Die gemeinsame Darstellung liest historische Felder, ohne sie beim Lesen umzuschreiben.
for (const [input, expected] of [
  [null, ""], [{}, ""],
  [{ situation: "  Am Empfang  " }, "Am Empfang"],
  [{ description: "  Eine MFA sucht einen Befund.  " }, "Eine MFA sucht einen Befund."],
  [{ situation: "Am Empfang", description: "Eine MFA sucht einen Befund." }, "Am Empfang\n\nEine MFA sucht einen Befund."],
  [{ situation: "  ", situationContext: "Am Empfang", description: " ", observed: "Eine MFA sucht." }, "Am Empfang\n\nEine MFA sucht."],
  [{ situation_context: "Am Empfang", concrete_observation: "Eine MFA sucht." }, "Am Empfang\n\nEine MFA sucht."],
  [{ context: "Am Empfang", observation: "Eine MFA sucht." }, "Am Empfang\n\nEine MFA sucht."],
  [{ situation: "Am Empfang", description: "Am Empfang" }, "Am Empfang"],
  [{ situation: "Am Empfang", description: "Am Empfang\n\nEine MFA sucht." }, "Am Empfang\n\nEine MFA sucht."],
  [{ situation: "Erste Zeile\r\nZweite Zeile", description: "Erste Zeile\nZweite Zeile\nEine MFA sucht." }, "Erste Zeile\nZweite Zeile\nEine MFA sucht."],
  [{ situation: "Station", description: "Stationspersonal sucht." }, "Station\n\nStationspersonal sucht."],
  [{ situation: "Am Empfang", description: "Der Befund liegt Am Empfang." }, "Am Empfang\n\nDer Befund liegt Am Empfang."],
  [{ situation: "Am Empfang", description: "Am Empfang: Eine MFA sucht." }, "Am Empfang\n\nAm Empfang: Eine MFA sucht."]
]) {
  const before = JSON.stringify(input);
  assert.equal(model.observationText(input), expected);
  assert.equal(JSON.stringify(input), before, "Die gemeinsame Darstellung darf historische Angaben nicht verändern.");
  if (!input) continue;
  const original = model.normalizeObservation({ ...input, id: "combined-text-contract" });
  const recoded = model.normalizeObservation({ ...original, problemType: "Doppelte Dokumentation" });
  assert.equal(recoded.situation, original.situation, "Eine reine Codeänderung darf den Kontext nicht leeren.");
  assert.equal(recoded.description, original.description, "Eine reine Codeänderung darf den Befund nicht umschreiben.");
  assert.equal(model.observationText(recoded), expected);
  const combined = model.normalizeObservation({ ...recoded, situation: "", situationContext: "", description: expected, observed: expected });
  const restored = model.parseDocumentationOutcome(model.serializeDocumentationPayload({ observations: [combined] })).observations[0];
  assert.equal(restored.situation, "");
  assert.equal(restored.situationContext, "");
  assert.equal(restored.description, expected);
  assert.equal(model.observationText(restored), expected, "Wiederholtes Lesen und Speichern darf übernommenen Kontext nicht verdoppeln.");
}

// Der Editoradapter darf den Modellvertrag beim Lesen und Formular-Roundtrip
// nicht durch eigene Quellen-Defaults oder den Verlust unsichtbarer Angaben ändern.
const appSource = fs.readFileSync("frontend/app/versorgungs-kompass.js", "utf8");
function appFunctionRange(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Editorvertrag nicht gefunden: ${startMarker}`);
  return appSource.slice(start, end);
}
const editorContext = vm.createContext({
  hospitationModel: model,
  hospitationDocumentationUid: (_kind, id) => id,
  numberOrEmpty: (value) => value === null || value === undefined || value === "" ? "" : Number(value),
  meaningfulOrEmpty: (value) => Array.isArray(value) ? value.length > 0 : String(value ?? "").trim(),
  hospitationRepeatableCardsFromForm: (cards) => cards
});
vm.runInContext([
  appFunctionRange("      function hospitationObservationIsMeaningful(", "      function hospitationQuoteIsMeaningful("),
  appFunctionRange("      function hospitationRepeatableFieldValue(", "      function hospitationDocumentationQuotesFromForm("),
  "globalThis.normalizeEditor = normalizeHospitationObservation; globalThis.readEditor = hospitationDocumentationObservationsFromForm;"
].join("\n"), editorContext);
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.equal(editorContext.normalizeEditor({}).title, "", "Eine leere Entwurfskarte darf keinen erfundenen Kurztitel erhalten.");
assert.equal(editorContext.normalizeEditor({ evidenceType: "" }).evidenceType, "", "Der Editor darf eine offene Quelle nicht als direkt beobachtet ausgeben.");
const canonicalEditor = editorContext.normalizeEditor({ usageRecommendation: "Wissen teilen", involvedRoles: ["MFA"] });
assert.equal(canonicalEditor.nextUse, "Wissen teilen");
assert.equal(canonicalEditor.affectedRoles, "MFA");
const clearedEditor = editorContext.normalizeEditor({
  evidenceType: "", evidence_type: "reported", processPhase: "", process_phase: "Aufnahme",
  problemType: "", problem_type: "Medienbruch", observationType: "", observation_type: "Hindernis",
  sourceReference: "", source_reference: "Alter Quellenbezug"
});
for (const field of ["evidenceType", "processPhase", "problemType", "observationType", "sourceReference"]) assert.equal(clearedEditor[field], "");
const syntheticEditor = editorContext.normalizeEditor({ evidenceType: "reported", payload: { originalEvidenceType: "synthetic_source_based", importReference: "synthetische-fixture" } });
assert.equal(syntheticEditor.originalEvidenceType, "synthetic_source_based");
assert.equal(syntheticEditor.evidenceType, "synthetic_source_based");
assert.equal(syntheticEditor.payload.importReference, "synthetische-fixture");

function editorCard(original, edits) {
  const fields = new Map(Object.entries(edits).map(([key, value]) => [key, { value, type: "text" }]));
  return {
    querySelector(selector) {
      if (selector === "[data-repeatable-original]") return { value: JSON.stringify(original) };
      const key = selector.match(/^\[data-repeatable-field="([^"]+)"\]$/)?.[1];
      return fields.get(key) || null;
    }
  };
}
const editorOriginal = plain(editorContext.normalizeEditor({
  id: "editor-roundtrip", title: "Ursprüngliche Kurzfassung", situation: "Am Empfang",
  description: "Eine MFA sucht einen Befund.", concreteObservation: "Eine MFA sucht einen Befund.",
  problemType: "Medienbruch", processPhase: "Anmeldung / Aufnahme", impact: "Frust / Belastung",
  evidenceType: "", sourceType: "field-note", limitations: "Nur eine Situation dokumentiert.",
  internalUseAllowed: false, externalUseAllowed: true, usageRecommendation: "Wissen teilen",
  communicationChannels: ["Telefon", "Papier"],
  actions: ["Zusätzliches Telefonat"], involvedRoles: ["MFA"], workaround: "Telefonische Rückfrage",
  sourceReference: "Feldnotiz", source_reference: "Alter Quellenbezug", customMetadata: { marker: "erhalten" }
}));
const editorOriginalBefore = JSON.stringify(editorOriginal);
const [editorRecoded] = editorContext.readEditor([editorCard(editorOriginal, {
  problemType: "Doppelte Dokumentation", processPhase: "Aufnahme"
})]);
assert.equal(editorRecoded.situation, editorOriginal.situation, "Eine reine Codeänderung muss den historischen Kontext bewahren.");
assert.equal(editorRecoded.description, editorOriginal.description);
assert.equal(editorRecoded.observationType, "", "Der Editor darf aus einem Problemcode keine Beobachtungsart ableiten.");
assert.equal(editorRecoded.evidenceType, "", "Eine Codeänderung darf keine Quelle erfinden.");
assert.deepEqual(plain(editorRecoded.customMetadata), editorOriginal.customMetadata);
assert.equal(JSON.stringify(editorOriginal), editorOriginalBefore, "Der Formularleser darf seinen Ausgangsstand nicht verändern.");
const combinedText = model.observationText(editorOriginal);
const [editorSaved] = editorContext.readEditor([editorCard(editorOriginal, {
  id: editorOriginal.id, title: "Neue Kurzfassung", observed: combinedText,
  problemType: "", evidenceType: "", affectedRoles: "", actions: "", currentWorkaround: "", sourceReference: ""
})]);
assert.equal(editorSaved.title, "Neue Kurzfassung");
assert.equal(editorSaved.description, combinedText);
assert.equal(editorSaved.situation, "");
assert.equal(editorSaved.situationContext, "");
assert.equal(editorSaved.problemType, "");
assert.equal(editorSaved.evidenceType, "");
assert.equal(editorSaved.sourceReference, "");
assert.equal(editorSaved.currentWorkaround, "");
assert.equal(editorSaved.actions, "");
assert.equal(editorSaved.affectedRoles, "");
for (const field of ["sourceType", "limitations", "internalUseAllowed", "externalUseAllowed", "nextUse", "processPhase", "impact"]) assert.equal(editorSaved[field], editorOriginal[field], `${field}: Ein nicht bearbeitetes Feld muss erhalten bleiben.`);
assert.deepEqual(plain(editorSaved.customMetadata), editorOriginal.customMetadata);
assert.deepEqual(plain(editorSaved.communicationChannels), ["Telefon", "Papier"], "Nicht bearbeitete Kommunikationskanäle müssen als Liste erhalten bleiben.");
const [savedAgain] = editorContext.readEditor([editorCard(plain(editorSaved), { observed: combinedText })]);
assert.equal(model.observationText(savedAgain), combinedText);
const [emptyText] = editorContext.readEditor([editorCard(plain(editorSaved), { observed: "" })]);
assert.equal(model.observationText(emptyText), "", "Das Leeren der Beobachtung darf keinen historischen Textalias reaktivieren.");
const [emptyTextAgain] = editorContext.readEditor([editorCard(plain(emptyText), { problemType: "Information fehlt" })]);
assert.equal(model.observationText(emptyTextAgain), "", "Ein späterer Codewechsel darf gelöschten Text nicht wiederherstellen.");
const payloadEditor = editorContext.normalizeEditor({
  id: "payload-editor", title: "Metadaten erhalten", evidenceType: "",
  payload: { description: "Eine berichtete Szene.", evidenceType: "reported", importReference: "fixture-ref", customMetadata: { marker: "payload" } }
});
const [payloadSaved] = editorContext.readEditor([editorCard(plain(payloadEditor), { problemType: "Technik gestört" })]);
assert.equal(payloadSaved.description, "Eine berichtete Szene.");
assert.equal(payloadSaved.evidenceType, "", "Ein explizit leeres Feld hat Vorrang vor dem historischen Payload.");
assert.equal(payloadSaved.importReference, "fixture-ref");
assert.deepEqual(plain(payloadSaved.payload), plain(payloadEditor.payload));
assert.deepEqual(plain(payloadSaved.customMetadata), { marker: "payload" });
const [syntheticSaved] = editorContext.readEditor([editorCard(plain(syntheticEditor), { title: "Synthetische Quelle bleibt erkennbar", evidenceType: "directly_observed" })]);
assert.equal(syntheticSaved.originalEvidenceType, "synthetic_source_based");
assert.equal(syntheticSaved.evidenceType, "synthetic_source_based");
assert.throws(() => editorContext.readEditor([{ querySelector: () => ({ value: "ungueltiges-json" }) }]), /ursprünglichen Beobachtungsangaben/);
assert.match(appFunctionRange("      function renderHospitationObservationCard(", "      function renderHospitationQuoteCard("), /data-repeatable-original value="\$\{escapeHtml\(JSON\.stringify\(item\)\)\}"/);

console.log("Hospitations-Codebuch: aktuelle Hilfen, Altwerte, Quellen, gemeinsamer Text sowie Modell- und Editor-Roundtrip erfolgreich geprüft.");
