import assert from "node:assert/strict";
import { careSectorForRead, careSectorForWrite, careSectorRegistry } from "../api/care-sector-model.mjs";

const labels = careSectorRegistry.labels();
const requiredLabels = ["Notfallversorgung", "Reha", "Physio / Heilmittel", "Hilfsmittel"];

requiredLabels.forEach((label) => {
  assert.ok(labels.includes(label), `${label} fehlt im kanonischen Sektorkatalog.`);
});
assert.ok(!labels.includes("Digital Health"), "Digital Health darf kein Versorgungssektor sein.");
assert.equal(careSectorRegistry.normalizeSector("Rettungsdienst"), "Notfallversorgung");
assert.equal(careSectorRegistry.normalizeSector("Physio/Heilmittel"), "Physio / Heilmittel");
assert.equal(careSectorRegistry.normalizeSector("Therapie"), "Physio / Heilmittel");
assert.equal(careSectorRegistry.normalizeSector("Rehabilitation"), "Reha");
assert.equal(careSectorRegistry.normalizeSector("Homecare"), "Hilfsmittel");
assert.equal(careSectorRegistry.find("Hilfsmittel")?.coverageTarget, true);
assert.equal(careSectorRegistry.isExcludedSector("Digital-Health"), true);
assert.equal(careSectorRegistry.normalizeSector("Digital Health", ""), "");
assert.equal(careSectorForRead("Digital Health"), "");
assert.equal(careSectorForRead("historischer Freitext"), "historischer Freitext");
assert.equal(careSectorForWrite("Rettungsdienst"), "Notfallversorgung");
assert.equal(careSectorForWrite("Therapie"), "Physio / Heilmittel");
assert.equal(careSectorForWrite(""), null);
assert.throws(() => careSectorForWrite("Digital Health"), (error) => error.status === 400 && /kein Versorgungssektor/.test(error.message));
assert.throws(() => careSectorForWrite("Neuer Fantasiesektor"), (error) => error.status === 400 && /Unbekannter Versorgungssektor/.test(error.message));

console.log(`Sektormodell geprueft: ${labels.length} kanonische Sektoren, ${careSectorRegistry.labels({ coverageOnly: true }).length} Abdeckungsziele.`);
