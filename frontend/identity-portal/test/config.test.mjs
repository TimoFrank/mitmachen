import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeFirebaseDefaults } from "../src/config.js";

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
