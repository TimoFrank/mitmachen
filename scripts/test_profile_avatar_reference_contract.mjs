#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { policyForRequest, WRITE_CLASSES } from "../api/security-policy.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverSource = readFileSync(path.join(projectRoot, "api", "server.mjs"), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = serverSource.indexOf(startMarker);
  const end = serverSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `API-Quellbereich fehlt: ${startMarker}`);
  return serverSource.slice(start, end);
}

const mapperSource = sourceBetween(
  "function profileAvatarUrl(",
  "\nfunction currentProfileToClient("
);
const referenceParserSource = sourceBetween(
  "function profileAvatarObjectName(",
  "\nfunction profileAvatarVersionFilter("
);
const sandbox = {
  PROFILE_IMAGE_BUCKET: "legacy-profile-images",
  encodeURIComponent
};
vm.runInNewContext([
  mapperSource,
  referenceParserSource,
  "globalThis.profileRowToClientForTest = profileRowToClient;"
].join("\n"), sandbox, { filename: "profile-avatar-reference-contract.js" });

const profileRowToClient = sandbox.profileRowToClientForTest;
const profileId = "11111111-1111-4111-8111-111111111111";
const expectedRoute = `/api/profile-avatar/${profileId}`;
const internalReferences = [
  `gs://legacy-profile-images/profile-images/${profileId}/avatar-22222222-2222-4222-8222-222222222222.png`,
  `private://profile-images/${profileId}/avatar-33333333-3333-4333-8333-333333333333.webp`,
  `private://profile-images/${profileId}/avatar.jpg`
];

for (const avatarUrl of internalReferences) {
  const row = Object.freeze({
    id: profileId,
    email: "synthetic@example.invalid",
    avatar_url: avatarUrl,
    access_scope: "standard",
    scope_ref: null
  });
  const clientProfile = profileRowToClient(row);
  assert.equal(clientProfile.avatar_url, expectedRoute,
    `Interne Profilbildreferenz darf nicht an den Client gelangen: ${avatarUrl}`);
  assert.doesNotMatch(JSON.stringify(clientProfile), /(?:gs|private):\/\//u,
    "Die Client-Darstellung darf kein internes Storage-Schema enthalten.");
  assert.equal(row.avatar_url, avatarUrl, "Die Datenbankzeile darf beim Mapping nicht veraendert werden.");
}

for (const invalidInternalReference of [
  `gs://unexpected-bucket/profile-images/${profileId}/avatar-22222222-2222-4222-8222-222222222222.png`,
  "private://profile-images/44444444-4444-4444-8444-444444444444/avatar.jpg",
  `private://profile-images/${profileId}/not-an-avatar.txt`,
  "PRIVATE://unexpected/internal-reference"
]) {
  const clientProfile = profileRowToClient({ id: profileId, avatar_url: invalidInternalReference });
  assert.equal(clientProfile.avatar_url, "",
    `Ungueltige interne Profilbildreferenz muss fail-closed redigiert werden: ${invalidInternalReference}`);
  assert.doesNotMatch(JSON.stringify(clientProfile), /(?:gs|private):\/\//iu,
    "Auch nichtkanonische interne Storage-Referenzen duerfen nicht im Profil-JSON erscheinen.");
}

const externalAvatar = "https://cdn.example.invalid/avatar.png";
assert.equal(
  profileRowToClient({ id: profileId, avatar_url: externalAvatar }).avatar_url,
  externalAvatar,
  "Nicht-interne Legacy-URLs bleiben ausserhalb dieses Migrationsvertrags unveraendert."
);

const routePolicy = policyForRequest("GET", expectedRoute);
assert.ok(routePolicy, "Die kanonische Profilbildroute muss in der API-Allowlist stehen.");
assert.equal(routePolicy.role, "viewer", "Profilbilder duerfen nicht als oeffentliche Route freigegeben sein.");
assert.equal(routePolicy.writeClass, WRITE_CLASSES.READ);
assert.equal(policyForRequest("POST", expectedRoute), null, "Die Auslieferungsroute darf keinen Schreibzugriff erlauben.");

const avatarReader = sourceBetween(
  "async function readProfileAvatar(",
  "\nfunction contactImageObjectName("
);
assertBefore(
  avatarReader,
  "await authorizeRequest(",
  "await rawProfileAvatarRow(",
  "Die Profilbildroute muss autorisieren, bevor sie die Profilreferenz liest."
);
assertBefore(
  avatarReader,
  "await authorizeRequest(",
  "await readStorageObject(",
  "Die Profilbildroute muss autorisieren, bevor sie den privaten Object Storage liest."
);

function assertBefore(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0 && secondIndex > firstIndex, message);
}

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["dist", "node_modules"].includes(entry.name)) return [];
      return filesRecursively(absolute);
    }
    return entry.isFile() ? [absolute] : [];
  });
}

for (const file of filesRecursively(path.join(projectRoot, "frontend"))
  .filter((entry) => /\.(?:css|html|js|mjs)$/u.test(entry))) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(source, /(?:gs|private):\/\//u,
    `${path.relative(projectRoot, file)} darf kein internes Storage-Schema in den Browsercode einbetten.`);
}

console.log("Profile avatar reference test OK: gs:// und private:// werden nur ueber die authentisierte API-Route ausgeliefert.");
