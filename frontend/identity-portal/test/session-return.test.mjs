import assert from "node:assert/strict";
import test from "node:test";
import { safeSessionReturnPath } from "../src/session-return.js";

const origin = "https://app.example.invalid";

test("behält Hospitationskontext, Profil und Fragebogen nach der Anmeldung", () => {
  for (const path of [
    "/hospitationskompass", "/hospitationskompass/termine",
    "/hospitationskompass/fragebogen", "/hospitationskompass/beobachtungen",
    "/hospitationskompass/muster", "/hospitationskompass/dashboard",
    "/hospitationskompass/framework", "/hospitationskompass/profil",
    "/hospitationskompass/personen/versorgung/test-person?view=details#notes",
    "/versorgung/kontakte", "/profil", "/hospitationen", "/start"
  ]) assert.equal(safeSessionReturnPath(path, origin), path);
});

test("behält den Mac-Kopplungscode beim Rücksprung nach der Anmeldung", () => {
  const path = "/mac-abgleich?code=synthetic-pairing-code";
  assert.equal(safeSessionReturnPath(path, origin), path);
});

test("fällt für fremde, ungültige und nicht freigegebene Ziele sicher zurück", () => {
  for (const path of [
    undefined, null, "", {}, "https://other.example.invalid/hospitationskompass",
    "//other.example.invalid/hospitationskompass", "/\\other.example.invalid",
    "/hospitationskompass\n", "/hospitationskompass\u0000", "/anmelden",
    "/api/export", "/mac-abgleich-unbekannt", "/mac-abgleich/anderer-pfad",
    "/hospitationskompass-unbekannt", "/hospitationskompass/../../api/export"
  ]) assert.equal(safeSessionReturnPath(path, origin), "/start");
  assert.equal(safeSessionReturnPath("/hospitationskompass", "invalid origin"), "/start");
});
