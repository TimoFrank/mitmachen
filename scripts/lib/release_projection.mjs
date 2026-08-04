import { parseProductVersion } from "./release_policy.mjs";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
