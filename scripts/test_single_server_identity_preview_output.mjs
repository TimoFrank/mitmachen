#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const validator = fileURLToPath(new URL(
  "../deploy/single-server/identity/validate-preview-output.sh",
  import.meta.url
));
const valid = [
  "mode=preview",
  "profileAction=keep",
  "bindingAction=insert",
  "legacyBindingAction=deactivate-iap-on-target",
  ""
].join("\n");

function run(input) {
  return spawnSync(validator, { input, encoding: "utf8" });
}

const positive = run(valid);
assert.equal(positive.status, 0);
assert.equal(positive.stdout, valid);

for (const invalid of [
  valid.replace("mode=preview", "mode=apply"),
  valid.replace("profileAction=keep", "profileAction=update"),
  valid.replace("bindingAction=insert", "bindingAction=delete"),
  valid.replace("deactivate-iap-on-target", "reactivate-iap"),
  valid + "unexpected=value\n",
  valid.replace("bindingAction=insert\n", "")
]) {
  assert.notEqual(run(invalid).status, 0, "Unerwartete Preview-Ausgabe muss fail-closed abgelehnt werden.");
}

console.log("Single-server identity preview output OK: exactly four allowlisted lines are accepted.");
