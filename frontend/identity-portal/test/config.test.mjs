import test from "node:test";
import assert from "node:assert/strict";
import {
  assertProductionConfig,
  assertSafeFirebaseDefaults
} from "../src/config.js";

test("accepts a browser state without injected Firebase defaults", () => {
  assert.doesNotThrow(() => assertSafeFirebaseDefaults("", undefined));
});

test("rejects Firebase defaults injected by cookie or global", () => {
  assert.throws(
    () => assertSafeFirebaseDefaults("__FIREBASE_DEFAULTS__=attacker-value", undefined),
    /Standardkonfiguration/
  );
  assert.throws(
    () => assertSafeFirebaseDefaults("", { _authTokenSyncURL: "https://attacker.invalid" }),
    /Standardkonfiguration/
  );
});

test("accepts only the canonical same-origin Firebase Auth helper domain", () => {
  const config = {
    firebase: {
      apiKey: `AIza${"A".repeat(35)}`,
      authDomain: "versorgungs-kompass.de",
      projectId: "steam-capsule-341212"
    },
    allowedContinueOrigins: ["https://versorgungs-kompass.de"]
  };

  assert.equal(assertProductionConfig(config), config);
  assert.throws(
    () => assertProductionConfig({
      ...config,
      firebase: {
        ...config.firebase,
        authDomain: "steam-capsule-341212.firebaseapp.com"
      }
    }),
    /kanonischen Portal/
  );
});
