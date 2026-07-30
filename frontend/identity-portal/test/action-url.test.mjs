import test from "node:test";
import assert from "node:assert/strict";
import {
  isPasswordValid,
  parseActionUrl,
  validatePassword
} from "../src/action-url.js";

const config = {
  firebase: {
    apiKey: "AIzaSyExampleKey"
  },
  allowedContinueOrigins: ["https://pilot.example.org"]
};
const code = "AbcdEFGHijklMNOPqrst_123456";

test("accepts a minimal reset-password action", () => {
  const parsed = parseActionUrl(
    `https://auth.example.org/konto/passwort-festlegen?mode=resetPassword&oobCode=${code}&apiKey=AIzaSyExampleKey&lang=de`,
    config
  );
  assert.equal(parsed.mode, "resetPassword");
  assert.equal(parsed.continueUrl, null);
});

test("accepts a path on an explicitly allowed HTTPS origin", () => {
  const continueUrl = encodeURIComponent("https://pilot.example.org/arbeitsbereich?aus=mail");
  const parsed = parseActionUrl(
    `https://auth.example.org/konto/passwort-festlegen?mode=resetPassword&oobCode=${code}&apiKey=AIzaSyExampleKey&continueUrl=${continueUrl}`,
    config
  );
  assert.equal(
    parsed.continueUrl,
    "https://pilot.example.org/arbeitsbereich?aus=mail"
  );
});

test("rejects a different API key", () => {
  assert.throws(
    () =>
      parseActionUrl(
        `https://auth.example.org/konto/passwort-festlegen?mode=resetPassword&oobCode=${code}&apiKey=other`,
        config
      ),
    /Umgebung/
  );
});

test("rejects duplicate and unknown parameters", () => {
  assert.throws(
    () =>
      parseActionUrl(
        `https://auth.example.org/konto/passwort-festlegen?mode=resetPassword&mode=verifyEmail&oobCode=${code}&apiKey=AIzaSyExampleKey`,
        config
      ),
    /mehrfach/
  );
  assert.throws(
    () =>
      parseActionUrl(
        `https://auth.example.org/konto/passwort-festlegen?mode=resetPassword&oobCode=${code}&apiKey=AIzaSyExampleKey&tenantId=unexpected`,
        config
      ),
    /nicht unterstützte/
  );
});

test("rejects unsafe continue URLs", () => {
  for (const continueUrl of [
    "javascript:alert(1)",
    "http://pilot.example.org/",
    "https://pilot.example.org.attacker.invalid/",
    "https://user:password@pilot.example.org/"
  ]) {
    assert.throws(
      () =>
        parseActionUrl(
          `https://auth.example.org/konto/passwort-festlegen?mode=resetPassword&oobCode=${code}&apiKey=AIzaSyExampleKey&continueUrl=${encodeURIComponent(continueUrl)}`,
          config
        ),
      /Weiterleitungsziel/
    );
  }
});

test("rejects non-reset account actions", () => {
  assert.throws(
    () =>
      parseActionUrl(
        `https://auth.example.org/konto/passwort-festlegen?mode=verifyEmail&oobCode=${code}&apiKey=AIzaSyExampleKey`,
        config
      ),
    /nicht unterstützt/
  );
});

test("enforces the documented password policy", () => {
  const validPassword = "Versorgung!2026";
  assert.equal(isPasswordValid(validPassword), true);
  assert.deepEqual(validatePassword(validPassword), {
    length: true,
    lowercase: true,
    uppercase: true,
    number: true,
    symbol: true
  });
  assert.equal(isPasswordValid("nurkleinbuchstaben"), false);
  assert.equal(isPasswordValid("NoSymbolOrNumberLong"), false);
});
