#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  canonicalIdentityProvisionInput,
  identityProvisionRowsMatch
} from "../api/identity-provision.mjs";
import {
  IDENTITY_BOOTSTRAP_CLAIM_TTL_SECONDS,
  createIdentityBootstrapClaim,
  verifyIdentityBootstrapClaim
} from "../api/identity-bootstrap-claim.mjs";

const bootstrapSecret = "a".repeat(64);
const nowSeconds = 1_800_000_000;
const signedClaim = createIdentityBootstrapClaim({
  issuer: "https://accounts.google.com",
  subject: "123456789012345678901",
  email: "operator@example.org",
  emailVerified: true,
  nowSeconds,
  nonce: "abcdefghijklmnopqrstuv"
}, bootstrapSecret);

const valid = {
  schemaVersion: 2,
  profile: {
    id: "operator-1",
    email: "operator@example.org",
    displayName: "Operator Eins",
    initials: "OE",
    role: "admin"
  },
  identity: {
    bootstrapClaim: signedClaim.bootstrapClaim,
    accessScope: "standard",
    scopeRef: null
  }
};

const canonical = canonicalIdentityProvisionInput(valid, { bootstrapSecret, nowSeconds });
assert.deepEqual(canonical, {
  schemaVersion: 2,
  profile: valid.profile,
  identity: {
    issuer: "https://accounts.google.com",
    subject: "123456789012345678901",
    accessScope: "standard",
    scopeRef: null
  }
});

const verified = verifyIdentityBootstrapClaim(signedClaim.bootstrapClaim, bootstrapSecret, { nowSeconds });
assert.equal(verified.email, valid.profile.email);
assert.equal(verified.subject, canonical.identity.subject);
assert.throws(() => verifyIdentityBootstrapClaim(
  signedClaim.bootstrapClaim,
  bootstrapSecret,
  { nowSeconds: nowSeconds + IDENTITY_BOOTSTRAP_CLAIM_TTL_SECONDS }
), /abgelaufen/u);
const tamperedClaim = signedClaim.bootstrapClaim.slice(0, -1)
  + (signedClaim.bootstrapClaim.endsWith("A") ? "B" : "A");
assert.throws(() => verifyIdentityBootstrapClaim(tamperedClaim, bootstrapSecret, { nowSeconds }), /Signatur/u);

for (const mutate of [
  (value) => { value.identity.bootstrapClaim = tamperedClaim; },
  (value) => { value.profile.email = "different@example.org"; },
  (value) => { value.profile.email = "*@example.org"; },
  (value) => { value.profile.email = "Operator@example.org"; },
  (value) => { value.identity.accessScope = "standard"; value.identity.scopeRef = "test-1"; },
  (value) => { value.identity.accessScope = "test_only"; value.identity.scopeRef = null; },
  (value) => { value.profile.role = "owner"; },
  (value) => { value.extra = true; }
]) {
  const candidate = structuredClone(valid);
  mutate(candidate);
  assert.throws(() => canonicalIdentityProvisionInput(candidate, { bootstrapSecret, nowSeconds }));
}

const profileRow = {
  id: valid.profile.id,
  email: valid.profile.email,
  display_name: valid.profile.displayName,
  initials: valid.profile.initials,
  role: valid.profile.role,
  active: true
};
const bindingRow = {
  issuer: canonical.identity.issuer,
  subject: canonical.identity.subject,
  profile_id: valid.profile.id,
  active: true,
  access_scope: canonical.identity.accessScope,
  scope_ref: canonical.identity.scopeRef
};
assert.equal(identityProvisionRowsMatch(canonical, [profileRow], [bindingRow]), true);
for (const [target, field, value] of [
  ["profile", "id", "other-profile"],
  ["profile", "email", "OPERATOR@example.org"],
  ["profile", "display_name", "Anderer Name"],
  ["profile", "initials", "AN"],
  ["profile", "role", "viewer"],
  ["profile", "active", false],
  ["binding", "issuer", "https://example.invalid"],
  ["binding", "subject", "987654321012345678901"],
  ["binding", "profile_id", "other-profile"],
  ["binding", "active", false],
  ["binding", "access_scope", "test_only"],
  ["binding", "scope_ref", "test-1"]
]) {
  const candidateProfile = structuredClone(profileRow);
  const candidateBinding = structuredClone(bindingRow);
  if (target === "profile") candidateProfile[field] = value;
  else candidateBinding[field] = value;
  assert.equal(
    identityProvisionRowsMatch(canonical, [candidateProfile], [candidateBinding]),
    false,
    `Readback-Abweichung muss erkannt werden: ${target}.${field}`
  );
}
assert.equal(identityProvisionRowsMatch(canonical, [], [bindingRow]), false);
assert.equal(identityProvisionRowsMatch(canonical, [profileRow], []), false);

console.log("Single-server identity contract OK: input and persisted profile/binding readback must match exactly.");
