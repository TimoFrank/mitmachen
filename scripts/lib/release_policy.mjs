import { readFileSync } from "node:fs";
import path from "node:path";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TECHNICAL_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(`Release-Policy: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} muss ein Objekt sein.`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  const unexpected = actualKeys.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actualKeys.includes(key));
  if (unexpected.length || missing.length) {
    const details = [
      unexpected.length ? `unbekannt: ${unexpected.join(", ")}` : "",
      missing.length ? `fehlend: ${missing.join(", ")}` : ""
    ].filter(Boolean).join("; ");
    fail(`${label} hat nicht den freigegebenen Aufbau (${details}).`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} muss ${JSON.stringify(expected)} sein.`);
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} muss eine nicht leere Zeichenfolge sein.`);
}

function assertStringList(value, expected, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    fail(`${label} muss eine Liste nicht leerer Zeichenfolgen sein.`);
  }
  if (new Set(value).size !== value.length) fail(`${label} darf keine Duplikate enthalten.`);
  if (expected && JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(`${label} weicht vom freigegebenen Vertrag ab.`);
  }
}

export function parseProductVersion(value) {
  const match = String(value ?? "").match(VERSION_PATTERN);
  if (!match) fail(`${JSON.stringify(value)} ist keine vollständige semantische Version X.Y.Z.`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function formatProductVersion(version) {
  const parsed = typeof version === "string" ? parseProductVersion(version) : version;
  if (!parsed
      || !Number.isInteger(parsed.major)
      || !Number.isInteger(parsed.minor)
      || !Number.isInteger(parsed.patch)
      || parsed.major < 0
      || parsed.minor < 0
      || parsed.patch < 0) {
    fail("Eine Version muss aus den nicht negativen ganzzahligen Feldern major, minor und patch bestehen.");
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function compareProductVersions(left, right) {
  const a = parseProductVersion(formatProductVersion(left));
  const b = parseProductVersion(formatProductVersion(right));
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return 0;
}

export function formatTechnicalTag(version) {
  return `v${formatProductVersion(version)}`;
}

export function parseTechnicalTag(tag) {
  const match = String(tag ?? "").match(TECHNICAL_TAG_PATTERN);
  if (!match) fail(`${JSON.stringify(tag)} ist kein freigegebener technischer Tag vX.Y.Z.`);
  return parseProductVersion(`${match[1]}.${match[2]}.${match[3]}`);
}

export function nextProductVersion(
  currentVersion,
  releaseType,
  { hasChanges = true, firstStableAuthorized = false, policy } = {}
) {
  const current = parseProductVersion(currentVersion);
  if (typeof hasChanges !== "boolean") fail("hasChanges muss ein boolescher Wert sein.");
  if (releaseType === "weekly") {
    if (!hasChanges) return null;
    return `${current.major}.${current.minor + 1}.0`;
  }
  if (releaseType === "hotfix") {
    if (!hasChanges) return null;
    return `${current.major}.${current.minor}.${current.patch + 1}`;
  }
  if (releaseType === "first-stable") {
    const activePolicy = policy ?? loadReleaseConfig().policy;
    if (firstStableAuthorized !== true || !activePolicy.stable.requiresExplicitAuthorization) {
      fail("Die erste stabile Version benötigt eine ausdrückliche Zielbetriebsfreigabe.");
    }
    if (current.major >= 1) fail("Die erste stabile Version kann nur aus einer 0.x-Version entstehen.");
    return activePolicy.stable.firstVersion;
  }
  fail(`Unbekannter Release-Anlass ${JSON.stringify(releaseType)}.`);
}

export function displayVersion(version, { stable = false, compactWhenPatchZero = true } = {}) {
  const parsed = parseProductVersion(version);
  if (stable && compactWhenPatchZero && parsed.patch === 0) return `${parsed.major}.${parsed.minor}`;
  return formatProductVersion(parsed);
}

export function releaseMetadata(version, { firstStableDeploymentVerified = false, policy } = {}) {
  const parsed = parseProductVersion(version);
  const activePolicy = policy ?? loadReleaseConfig().policy;
  const formatted = formatProductVersion(parsed);
  if (compareProductVersions(formatted, activePolicy.effectiveFromVersion) < 0) {
    return {
      phase: "legacy",
      githubPrerelease: null,
      githubLatest: null
    };
  }
  const stable = compareProductVersions(formatted, activePolicy.stable.firstVersion) >= 0;
  if (stable && activePolicy.stable.requiresVerifiedDeployment && firstStableDeploymentVerified !== true) {
    fail(`Stabile Releases ab ${activePolicy.stable.firstVersion} benötigen den nachgewiesenen First-Stable-Zielbetriebszustand des Profils ${activePolicy.stable.requiresDeploymentProfile}.`);
  }
  return stable
    ? {
        phase: "stable",
        githubPrerelease: activePolicy.stable.githubPrerelease,
        githubLatest: activePolicy.stable.githubLatest
      }
    : {
        phase: "release-candidate",
        githubPrerelease: activePolicy.releaseCandidate.githubPrerelease,
        githubLatest: activePolicy.releaseCandidate.githubLatest
      };
}

export function releaseTitle(version, releaseType, { theme = "", policy } = {}) {
  const parsed = parseProductVersion(version);
  const activePolicy = policy ?? loadReleaseConfig().policy;
  const formatted = formatProductVersion(parsed);
  if (compareProductVersions(formatted, activePolicy.effectiveFromVersion) < 0) {
    fail(`Die neue Titelregel gilt erst ab ${activePolicy.effectiveFromVersion}.`);
  }
  const stable = compareProductVersions(formatted, activePolicy.stable.firstVersion) >= 0;
  if (releaseType === "weekly" && !theme.trim()) fail("Ein Wochenrelease benötigt ein Leitthema.");
  if (releaseType === "hotfix" && theme.trim()) fail("Ein Hotfix erhält kein eigenes Leitthema.");
  if (!["weekly", "hotfix"].includes(releaseType)) fail(`Unbekannter Release-Anlass ${JSON.stringify(releaseType)}.`);

  const contract = stable ? activePolicy.stable : activePolicy.releaseCandidate;
  const pattern = releaseType === "weekly" ? contract.titlePattern : contract.hotfixTitlePattern;
  return pattern
    .replaceAll("{version}", formatProductVersion(parsed))
    .replaceAll(
      "{displayVersion}",
      displayVersion(formatProductVersion(parsed), {
        stable,
        compactWhenPatchZero: activePolicy.stable.compactDisplayWhenPatchZero
      })
    )
    .replaceAll("{theme}", theme.trim());
}

export function assertNewTechnicalTag(tag, { existingTags = [], policy } = {}) {
  const parsed = parseTechnicalTag(tag);
  const activePolicy = policy ?? loadReleaseConfig().policy;
  if (activePolicy.legacyTags.includes(tag)) fail(`Der Legacy-Tag ${tag} bleibt unverändert und darf nicht neu erzeugt werden.`);
  if (compareProductVersions(formatProductVersion(parsed), activePolicy.effectiveFromVersion) < 0) {
    fail(`Neue Tags vor ${formatTechnicalTag(activePolicy.effectiveFromVersion)} sind durch die Legacy-Grenze gesperrt.`);
  }
  if (existingTags.includes(tag)) fail(`Der vorhandene Tag ${tag} darf nicht überschrieben werden.`);
  return tag;
}

export function validateReleaseConfig(config) {
  assertExactKeys(config, [
    "$schema",
    "schemaVersion",
    "productVersion",
    "baselineVersion",
    "baselineRef",
    "defaultBump",
    "policy"
  ], "config/release.json");
  assertEqual(config.$schema, "./release.schema.json", "config/release.json.$schema");
  assertEqual(config.schemaVersion, 2, "config/release.json.schemaVersion");
  parseProductVersion(config.productVersion);
  parseProductVersion(config.baselineVersion);
  assertString(config.baselineRef, "config/release.json.baselineRef");
  assertEqual(config.defaultBump, "minor", "config/release.json.defaultBump");

  const policy = config.policy;
  assertExactKeys(policy, [
    "policyVersion",
    "effectiveFromVersion",
    "tag",
    "releaseCandidate",
    "stable",
    "cadence",
    "documentation",
    "deliveryChannels",
    "handoff",
    "legacyTags"
  ], "policy");
  assertEqual(policy.policyVersion, 1, "policy.policyVersion");
  parseProductVersion(policy.effectiveFromVersion);
  if (compareProductVersions(config.baselineVersion, config.productVersion) > 0) {
    fail("baselineVersion darf nicht nach productVersion liegen.");
  }

  assertExactKeys(policy.tag, ["format", "signed", "annotated", "verifyBeforePublish", "immutable"], "policy.tag");
  assertEqual(policy.tag.format, "vX.Y.Z", "policy.tag.format");
  assertEqual(policy.tag.signed, true, "policy.tag.signed");
  assertEqual(policy.tag.annotated, true, "policy.tag.annotated");
  assertEqual(policy.tag.verifyBeforePublish, true, "policy.tag.verifyBeforePublish");
  assertEqual(policy.tag.immutable, true, "policy.tag.immutable");

  assertExactKeys(policy.releaseCandidate, [
    "untilVersion",
    "preferredLabel",
    "allowedAlternateLabel",
    "githubPrerelease",
    "githubLatest",
    "titlePattern",
    "hotfixTitlePattern"
  ], "policy.releaseCandidate");
  assertEqual(policy.releaseCandidate.untilVersion, "1.0.0", "policy.releaseCandidate.untilVersion");
  assertEqual(policy.releaseCandidate.preferredLabel, "Release Candidate", "policy.releaseCandidate.preferredLabel");
  assertEqual(policy.releaseCandidate.allowedAlternateLabel, "Proof of Concept", "policy.releaseCandidate.allowedAlternateLabel");
  assertEqual(policy.releaseCandidate.githubPrerelease, true, "policy.releaseCandidate.githubPrerelease");
  assertEqual(policy.releaseCandidate.githubLatest, false, "policy.releaseCandidate.githubLatest");
  assertEqual(policy.releaseCandidate.titlePattern, "{version}-0 Release Candidate", "policy.releaseCandidate.titlePattern");
  assertEqual(policy.releaseCandidate.hotfixTitlePattern, "{version} Release Candidate", "policy.releaseCandidate.hotfixTitlePattern");

  assertExactKeys(policy.stable, [
    "firstVersion",
    "automatic",
    "requiresExplicitAuthorization",
    "requiresDeploymentProfile",
    "requiresVerifiedDeployment",
    "tagBeforeTargetBuild",
    "githubReleaseAfterVerifiedDeployment",
    "githubPrerelease",
    "githubLatest",
    "compactDisplayWhenPatchZero",
    "titlePattern",
    "hotfixTitlePattern"
  ], "policy.stable");
  assertEqual(policy.stable.firstVersion, "1.0.0", "policy.stable.firstVersion");
  assertEqual(policy.stable.firstVersion, policy.releaseCandidate.untilVersion, "RC-/Stable-Grenze");
  assertEqual(policy.stable.automatic, false, "policy.stable.automatic");
  assertEqual(policy.stable.requiresExplicitAuthorization, true, "policy.stable.requiresExplicitAuthorization");
  assertEqual(policy.stable.requiresDeploymentProfile, "target", "policy.stable.requiresDeploymentProfile");
  assertEqual(policy.stable.requiresVerifiedDeployment, true, "policy.stable.requiresVerifiedDeployment");
  assertEqual(policy.stable.tagBeforeTargetBuild, true, "policy.stable.tagBeforeTargetBuild");
  assertEqual(policy.stable.githubReleaseAfterVerifiedDeployment, true, "policy.stable.githubReleaseAfterVerifiedDeployment");
  assertEqual(policy.stable.githubPrerelease, false, "policy.stable.githubPrerelease");
  assertEqual(policy.stable.githubLatest, true, "policy.stable.githubLatest");
  assertEqual(policy.stable.compactDisplayWhenPatchZero, true, "policy.stable.compactDisplayWhenPatchZero");
  assertString(policy.stable.titlePattern, "policy.stable.titlePattern");
  assertString(policy.stable.hotfixTitlePattern, "policy.stable.hotfixTitlePattern");

  assertExactKeys(policy.cadence, ["weekly", "hotfix"], "policy.cadence");
  assertExactKeys(policy.cadence.weekly, ["weekday", "time", "timeZone", "bump", "skipWithoutChanges"], "policy.cadence.weekly");
  assertEqual(policy.cadence.weekly.weekday, "friday", "policy.cadence.weekly.weekday");
  assertEqual(policy.cadence.weekly.time, "09:17", "policy.cadence.weekly.time");
  assertEqual(policy.cadence.weekly.timeZone, "Europe/Berlin", "policy.cadence.weekly.timeZone");
  assertEqual(policy.cadence.weekly.bump, config.defaultBump, "Wochen-/Standard-Sprung");
  assertEqual(policy.cadence.weekly.skipWithoutChanges, true, "policy.cadence.weekly.skipWithoutChanges");
  assertExactKeys(policy.cadence.hotfix, ["bump", "scheduled"], "policy.cadence.hotfix");
  assertEqual(policy.cadence.hotfix.bump, "patch", "policy.cadence.hotfix.bump");
  assertEqual(policy.cadence.hotfix.scheduled, false, "policy.cadence.hotfix.scheduled");

  assertExactKeys(policy.documentation, ["weekly", "hotfix"], "policy.documentation");
  assertExactKeys(policy.documentation.weekly, ["theme", "releaseNotes", "changelog", "inAppHistory"], "policy.documentation.weekly");
  assertEqual(policy.documentation.weekly.theme, "required", "policy.documentation.weekly.theme");
  assertEqual(policy.documentation.weekly.releaseNotes, "full", "policy.documentation.weekly.releaseNotes");
  assertEqual(policy.documentation.weekly.changelog, "themed-release-section", "policy.documentation.weekly.changelog");
  assertEqual(policy.documentation.weekly.inAppHistory, true, "policy.documentation.weekly.inAppHistory");
  assertExactKeys(policy.documentation.hotfix, ["theme", "releaseNotes", "changelog", "inAppHistory", "carryIntoNextWeekly"], "policy.documentation.hotfix");
  assertEqual(policy.documentation.hotfix.theme, "forbidden", "policy.documentation.hotfix.theme");
  assertEqual(policy.documentation.hotfix.releaseNotes, "compact", "policy.documentation.hotfix.releaseNotes");
  assertEqual(policy.documentation.hotfix.changelog, "compact-item-under-current-minor", "policy.documentation.hotfix.changelog");
  assertEqual(policy.documentation.hotfix.inAppHistory, false, "policy.documentation.hotfix.inAppHistory");
  assertEqual(policy.documentation.hotfix.carryIntoNextWeekly, true, "policy.documentation.hotfix.carryIntoNextWeekly");

  if (!Array.isArray(policy.deliveryChannels) || policy.deliveryChannels.length !== 3) {
    fail("policy.deliveryChannels muss genau drei Auslieferungskanäle enthalten.");
  }
  const channelContracts = {
    "pages-demo": ["pages-demo", "anonymous-demo", "github-actions", "product-release"],
    "private-gke": ["pre-gematik", "iap", "github-actions-gke", "manual-approval"],
    "gematik-target": ["target", "oidc", "software-factory", "controlled-release"]
  };
  const seenChannels = new Set();
  for (const channel of policy.deliveryChannels) {
    assertExactKeys(channel, [
      "id",
      "deploymentProfile",
      "authMode",
      "buildAuthority",
      "releaseTrigger",
      "crossChannelPromotion"
    ], "policy.deliveryChannels[]");
    if (!channelContracts[channel.id]) fail(`Unbekannter Auslieferungskanal ${JSON.stringify(channel.id)}.`);
    if (seenChannels.has(channel.id)) fail(`Auslieferungskanal ${channel.id} ist doppelt definiert.`);
    seenChannels.add(channel.id);
    const [profile, authMode, authority, trigger] = channelContracts[channel.id];
    assertEqual(channel.deploymentProfile, profile, `${channel.id}.deploymentProfile`);
    assertEqual(channel.authMode, authMode, `${channel.id}.authMode`);
    assertEqual(channel.buildAuthority, authority, `${channel.id}.buildAuthority`);
    assertEqual(channel.releaseTrigger, trigger, `${channel.id}.releaseTrigger`);
    assertEqual(channel.crossChannelPromotion, false, `${channel.id}.crossChannelPromotion`);
  }

  assertExactKeys(policy.handoff, ["source", "destination", "targetBuild", "requiredProof", "forbiddenInputs"], "policy.handoff");
  assertEqual(policy.handoff.source, "signed-git-tag", "policy.handoff.source");
  assertEqual(policy.handoff.destination, "gitlab-software-factory", "policy.handoff.destination");
  assertEqual(policy.handoff.targetBuild, "fresh-from-tag", "policy.handoff.targetBuild");
  assertStringList(policy.handoff.requiredProof, [
    "tag-object-sha",
    "commit-sha",
    "signer-fingerprint",
    "tag-signature-verification",
    "target-artifact-digests"
  ], "policy.handoff.requiredProof");
  assertStringList(policy.handoff.forbiddenInputs, [
    "workspace-archive",
    "pages-artifacts",
    "private-gke-artifacts",
    "personal-values",
    "secrets",
    "data",
    "oidc-subjects"
  ], "policy.handoff.forbiddenInputs");
  assertStringList(policy.legacyTags, null, "policy.legacyTags");
  for (const requiredLegacyTag of [
    "v0.21.0",
    "v0.22.0",
    "poc-v0.1.0-rc.2",
    "poc-v0.1.0-rc.3",
    "poc-v0.1.0-rc.4",
    "poc-v0.1.0-rc.5"
  ]) {
    if (!policy.legacyTags.includes(requiredLegacyTag)) fail(`Legacy-Tag ${requiredLegacyTag} fehlt.`);
  }

  return config;
}

export function loadReleaseConfig(root = process.cwd()) {
  const configPath = path.join(root, "config/release.json");
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`config/release.json konnte nicht geladen werden (${error.message}).`);
  }
  return validateReleaseConfig(config);
}
