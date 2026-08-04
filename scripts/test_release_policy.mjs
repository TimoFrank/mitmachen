import assert from "node:assert/strict";
import {
  assertNewTechnicalTag,
  displayVersion,
  formatTechnicalTag,
  loadReleaseConfig,
  nextProductVersion,
  parseProductVersion,
  parseTechnicalTag,
  releaseMetadata,
  releaseTitle,
  validateReleaseConfig
} from "./lib/release_policy.mjs";
import {
  updateHelmProductVersionProjection,
  validateHelmProductVersionProjection,
  validateProductVersionProjection
} from "./lib/release_projection.mjs";

const config = loadReleaseConfig();
const policy = config.policy;

assert.equal(config.schemaVersion, 2);
assert.doesNotThrow(() => parseProductVersion(config.productVersion));
assert.equal(config.defaultBump, policy.cadence.weekly.bump);

assert.equal(nextProductVersion("0.22.0", "weekly", { hasChanges: false }), null);
assert.equal(nextProductVersion("0.22.0", "weekly", { hasChanges: true }), "0.23.0");
assert.equal(nextProductVersion("0.23.0", "hotfix", { hasChanges: true }), "0.23.1");
assert.equal(nextProductVersion("0.23.1", "weekly", { hasChanges: true }), "0.24.0");
assert.throws(
  () => nextProductVersion("0.22.0", "weekly", { hasChanges: "false" }),
  /hasChanges muss ein boolescher Wert sein/
);
assert.throws(
  () => nextProductVersion("0.99.0", "first-stable", { policy }),
  /ausdrückliche Zielbetriebsfreigabe/
);
assert.throws(
  () => nextProductVersion("0.99.0", "first-stable", { policy, firstStableAuthorized: "false" }),
  /ausdrückliche Zielbetriebsfreigabe/
);
assert.equal(
  nextProductVersion("0.99.0", "first-stable", { policy, firstStableAuthorized: true }),
  "1.0.0"
);
assert.throws(
  () => nextProductVersion("1.0.0", "first-stable", { policy, firstStableAuthorized: true }),
  /nur aus einer 0.x-Version/
);

for (const tag of ["v0.23.0", "v0.23.1", "v1.0.0"]) {
  assert.equal(formatTechnicalTag(parseTechnicalTag(tag)), tag);
}
for (const invalidTag of ["v1.0", "0.23.0", "v0.23.0-0", "v0.23.0-rc", "v0.23.0-rc.1", "poc-v0.1.0-rc.5"]) {
  assert.throws(() => parseTechnicalTag(invalidTag), /kein freigegebener technischer Tag/);
}

assert.deepEqual(releaseMetadata("0.22.0", { policy }), {
  phase: "legacy",
  githubPrerelease: null,
  githubLatest: null
});
assert.deepEqual(releaseMetadata("0.23.0", { policy }), {
  phase: "release-candidate",
  githubPrerelease: true,
  githubLatest: false
});
assert.throws(() => releaseMetadata("1.0.0", { policy }), /First-Stable-Zielbetriebszustand/);
assert.throws(
  () => releaseMetadata("1.0.0", { policy, firstStableDeploymentVerified: "false" }),
  /First-Stable-Zielbetriebszustand/
);
assert.throws(() => releaseMetadata("1.0.1", { policy }), /First-Stable-Zielbetriebszustand/);
assert.throws(() => releaseMetadata("1.1.0", { policy }), /First-Stable-Zielbetriebszustand/);
assert.deepEqual(releaseMetadata("1.0.0", { policy, firstStableDeploymentVerified: true }), {
  phase: "stable",
  githubPrerelease: false,
  githubLatest: true
});
assert.deepEqual(releaseMetadata("1.1.0", { policy, firstStableDeploymentVerified: true }), {
  phase: "stable",
  githubPrerelease: false,
  githubLatest: true
});

assert.equal(displayVersion("0.23.0"), "0.23.0");
assert.equal(displayVersion("1.0.0", { stable: true }), "1.0");
assert.equal(displayVersion("1.1.0", { stable: true }), "1.1");
assert.equal(displayVersion("1.0.1", { stable: true }), "1.0.1");
assert.equal(
  releaseTitle("0.23.0", "weekly", { policy, theme: "Versorgung gemeinsam gestalten" }),
  "Versorgungs-Kompass 0.23.0 — Release Candidate: Versorgung gemeinsam gestalten"
);
assert.equal(
  releaseTitle("0.23.1", "hotfix", { policy }),
  "Versorgungs-Kompass 0.23.1 — Release Candidate (Hotfix)"
);
assert.equal(
  releaseTitle("1.0.0", "weekly", { policy, theme: "Zielbetrieb" }),
  "Versorgungs-Kompass 1.0: Zielbetrieb"
);
assert.throws(() => releaseTitle("0.23.0", "weekly", { policy }), /Leitthema/);
assert.throws(() => releaseTitle("0.23.1", "hotfix", { policy, theme: "Eigenes Thema" }), /kein eigenes Leitthema/);
assert.throws(() => releaseTitle("0.22.0", "weekly", { policy, theme: "Legacy" }), /gilt erst ab/);

assert.equal(assertNewTechnicalTag("v0.23.0", { policy }), "v0.23.0");
assert.throws(() => assertNewTechnicalTag("v0.23.0", { policy, existingTags: ["v0.23.0"] }), /nicht überschrieben/);
assert.throws(() => assertNewTechnicalTag("v0.22.0", { policy }), /Legacy-Tag/);
assert.throws(() => assertNewTechnicalTag("v0.10.0", { policy }), /Legacy-Grenze/);
assert.throws(
  () => formatTechnicalTag({ major: -1, minor: 0, patch: 0 }),
  /nicht negativen ganzzahligen Feldern/
);

assert.equal(policy.documentation.weekly.changelog, "themed-release-section");
assert.equal(policy.documentation.hotfix.releaseNotes, "compact");
assert.equal(policy.documentation.hotfix.changelog, "compact-item-under-current-minor");
assert.equal(policy.documentation.hotfix.inAppHistory, false);
assert.equal(policy.documentation.hotfix.carryIntoNextWeekly, true);
assert.equal(policy.tag.signed, true);
assert.equal(policy.tag.annotated, true);
assert.equal(policy.tag.verifyBeforePublish, true);
assert.equal(policy.tag.immutable, true);

const weeklyProjection = validateProductVersionProjection({
  productVersion: "0.23.0",
  readme: "- Version: [v0.23.0](/releases/tag/v0.23.0)",
  changelog: "## Version 0.23 - Leitthema\n",
  appHistory: '{ version: "0.23.0" }',
  releaseNotesExists: true
});
assert.deepEqual(weeklyProjection, []);

const helmProjection = updateHelmProductVersionProjection({
  productVersion: "0.23.0",
  chart: "apiVersion: v2\nversion: 0.22.0\nappVersion: \"0.22.0\"\n",
  values: "productVersion: \"0.22.0\"\nreplicaCount: 2\n"
});
assert.deepEqual(validateHelmProductVersionProjection({
  productVersion: "0.23.0",
  chart: helmProjection.chart,
  values: helmProjection.values
}), []);
for (const [chart, values, expected] of [
  [helmProjection.chart.replace("version: 0.23.0", "version: 0.24.0"), helmProjection.values, /Chart\.version/u],
  [helmProjection.chart.replace('appVersion: "0.23.0"', 'appVersion: "0.24.0"'), helmProjection.values, /Chart\.appVersion/u],
  [helmProjection.chart, helmProjection.values.replace('productVersion: "0.23.0"', 'productVersion: "0.24.0"'), /values\.productVersion/u]
]) {
  assert.match(validateHelmProductVersionProjection({
    productVersion: "0.23.0",
    chart,
    values
  }).join("\n"), expected);
}

const hotfixProjection = validateProductVersionProjection({
  productVersion: "0.23.1",
  readme: "- Version: [v0.23.1](/releases/tag/v0.23.1)",
  changelog: "## Version 0.23 - Leitthema\n\n- **Hotfix v0.23.1:** Anmeldung korrigiert.\n\n## Version 0.22 - Alt\n",
  appHistory: '{ version: "0.23.0" }',
  releaseNotesExists: true
});
assert.deepEqual(hotfixProjection, []);

const undocumentedHotfix = validateProductVersionProjection({
  productVersion: "0.23.1",
  readme: "- Version: [v0.23.1](/releases/tag/v0.23.1)",
  changelog: "## Version 0.23 - Leitthema\n",
  appHistory: '{ version: "0.23.0" }',
  releaseNotesExists: true
});
assert.match(undocumentedHotfix.join("\n"), /Hotfix v0\.23\.1 fehlt/);

const prefixCollision = validateProductVersionProjection({
  productVersion: "0.23.1",
  readme: "- Version: [v0.23.10](/releases/tag/v0.23.10)",
  changelog: "## Version 0.23 - Leitthema\n\n- **Hotfix v0.23.10:** Andere Version.\n",
  appHistory: '{ version: "0.23.0" }',
  releaseNotesExists: true
});
assert.match(prefixCollision.join("\n"), /zentrale Produktversion v0\.23\.1 fehlt/);
assert.match(prefixCollision.join("\n"), /Hotfix v0\.23\.1 fehlt/);

const tagSuffixCollision = validateProductVersionProjection({
  productVersion: "0.23.1",
  readme: "- Version: [v0.23.1_bad](/releases/tag/v0.23.1_bad)",
  changelog: "## Version 0.23 - Leitthema\n\n- **Hotfix v0.23.1_bad:** Andere Version.\n",
  appHistory: '{ version: "0.23.0" }',
  releaseNotesExists: true
});
assert.match(tagSuffixCollision.join("\n"), /zentrale Produktversion v0\.23\.1 fehlt/);
assert.match(tagSuffixCollision.join("\n"), /Hotfix v0\.23\.1 fehlt/);

const hotfixWithOwnHistory = validateProductVersionProjection({
  productVersion: "0.23.1",
  readme: "- Version: [v0.23.1](/releases/tag/v0.23.1)",
  changelog: "## Version 0.23 - Leitthema\n\n- **Hotfix v0.23.1:** Anmeldung korrigiert.\n",
  appHistory: '{ version: "0.23.1" }, { version: "0.23.0" }',
  releaseNotesExists: true
});
assert.match(hotfixWithOwnHistory.join("\n"), /keinen eigenen In-App-Haupteintrag/);

const unknownField = structuredClone(config);
unknownField.policy.cadence.weekly.unplanned = true;
assert.throws(() => validateReleaseConfig(unknownField), /unbekannt: unplanned/);

const conflictingBump = structuredClone(config);
conflictingBump.policy.cadence.weekly.bump = "patch";
assert.throws(() => validateReleaseConfig(conflictingBump), /Wochen-\/Standard-Sprung/);

const unsigned = structuredClone(config);
unsigned.policy.tag.signed = false;
assert.throws(() => validateReleaseConfig(unsigned), /policy.tag.signed/);

console.log("Release policy tests passed.");
