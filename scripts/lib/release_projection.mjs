import { parseProductVersion } from "./release_policy.mjs";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function yamlValue(source, key) {
  const matches = [...source.matchAll(new RegExp(`^${escapeRegExp(key)}:[ \\t]*(?:\"([^\"]+)\"|'([^']+)'|([^#\\s]+))[ \\t]*$`, "gm"))];
  if (matches.length !== 1) return null;
  return matches[0][1] ?? matches[0][2] ?? matches[0][3];
}

function replaceYamlValue(source, key, value, { quoted = false } = {}) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:[^\\r\\n]*$`, "gm");
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${key} muss in der Helm-Projektion genau einmal vorkommen.`);
  }
  return source.replace(pattern, `${key}: ${quoted ? `\"${value}\"` : value}`);
}

export function validateHelmProductVersionProjection({ productVersion, chart, values }) {
  const failures = [];
  const chartVersion = yamlValue(chart, "version");
  const appVersion = yamlValue(chart, "appVersion");
  const valuesVersion = yamlValue(values, "productVersion");
  for (const [label, actual] of [
    ["Chart.version", chartVersion],
    ["Chart.appVersion", appVersion],
    ["values.productVersion", valuesVersion]
  ]) {
    if (actual !== productVersion) {
      failures.push(`Helm ${label} nennt ${actual ?? "keine eindeutige Version"} statt ${productVersion}.`);
    }
  }
  return failures;
}

export function updateHelmProductVersionProjection({ productVersion, chart, values }) {
  return {
    chart: replaceYamlValue(
      replaceYamlValue(chart, "version", productVersion),
      "appVersion",
      productVersion,
      { quoted: true }
    ),
    values: replaceYamlValue(values, "productVersion", productVersion, { quoted: true })
  };
}

export function validateProductVersionProjection({
  productVersion,
  readme,
  changelog,
  appHistory,
  releaseNotesExists
}) {
  const failures = [];
  const parsed = parseProductVersion(productVersion);
  const compactVersion = `${parsed.major}.${parsed.minor}`;
  const weeklyVersion = `${parsed.major}.${parsed.minor}.0`;
  const escapedProductVersion = escapeRegExp(productVersion);
  const escapedCompactVersion = escapeRegExp(compactVersion);
  const escapedWeeklyVersion = escapeRegExp(weeklyVersion);

  if (!new RegExp(`/releases/tag/v${escapedProductVersion}(?=[)\\s]|$)`).test(readme)) {
    failures.push(`README.md: zentrale Produktversion v${productVersion} fehlt.`);
  }

  const changelogHeader = new RegExp(`^## Version ${escapedCompactVersion} -`, "m");
  const headerMatch = changelog.match(changelogHeader);
  if (!headerMatch) {
    failures.push(`CHANGELOG.md: Produktversion ${compactVersion} fehlt.`);
  } else if (parsed.patch > 0) {
    const sectionStart = headerMatch.index ?? 0;
    const followingSection = changelog.slice(sectionStart + headerMatch[0].length).search(/^## Version /m);
    const sectionEnd = followingSection === -1
      ? changelog.length
      : sectionStart + headerMatch[0].length + followingSection;
    const currentMinorSection = changelog.slice(sectionStart, sectionEnd);
    if (!new RegExp(`Hotfix v${escapedProductVersion}(?=[:;,.)!?\\s]|$)`).test(currentMinorSection)) {
      failures.push(`CHANGELOG.md: kompakter Eintrag Hotfix v${productVersion} fehlt unter Version ${compactVersion}.`);
    }
  }

  if (!new RegExp(`version: "${escapedWeeklyVersion}"`).test(appHistory)) {
    failures.push(`frontend/app/versorgungs-kompass.js: Wochenversion ${weeklyVersion} fehlt in der In-App-Historie.`);
  }
  if (parsed.patch > 0 && new RegExp(`version: "${escapedProductVersion}"`).test(appHistory)) {
    failures.push(`frontend/app/versorgungs-kompass.js: Hotfix ${productVersion} darf keinen eigenen In-App-Haupteintrag erhalten.`);
  }
  if (!releaseNotesExists) {
    failures.push(`dokumentation/release-notes/v${productVersion}.md fehlt für die zentrale Produktversion.`);
  }

  return failures;
}
