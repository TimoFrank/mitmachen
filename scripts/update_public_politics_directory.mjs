import {
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDESTAG_HEALTH_COMMITTEE_PARTIES,
  createBundestagHealthCommitteeDirectory
} from "../api/bundestag-health-committee.mjs";

export const PUBLIC_POLITICS_DIRECTORY_GLOBAL =
  "VERSORGUNGS_COMPASS_PUBLIC_POLITICS_DIRECTORY";
export const PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT = 38;
export const PUBLIC_POLITICS_DIRECTORY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
export const PUBLIC_POLITICS_DIRECTORY_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "frontend", "data", "public-politics-directory.js");
const payloadFields = new Set([
  "available",
  "demo",
  "publicDirectory",
  "committee",
  "parliamentaryTerm",
  "membership",
  "sourceUrl",
  "constituencySourceUrl",
  "fetchedAt",
  "memberCount",
  "stale",
  "members"
]);
const memberFields = new Set([
  "id",
  "name",
  "party",
  "role",
  "profileUrl",
  "imageUrl",
  "imageSourceUrl",
  "imageAttribution",
  "imageLicense",
  "imageProvider",
  "imageRightsStatus",
  "imageUsageTermsUrl",
  "constituency",
  "constituencyNumber",
  "constituencyName",
  "constituencyFederalState",
  "mandateType",
  "postalCodes",
  "postalCodeCoverage",
  "constituencySourceUrl",
  "representativePostalCode",
  "mapPostalCode"
]);
const approvedImageHosts = new Set([
  "bilddatenbank.bundestag.de",
  "commons.wikimedia.org"
]);
const approvedImageSourceHosts = new Set([
  "bilddatenbank.bundestag.de",
  "commons.wikimedia.org"
]);
const approvedImageTermsHosts = new Set([
  "bilddatenbank.bundestag.de",
  "creativecommons.org",
  "www.bundestag.de"
]);
const allowedParties = new Set(BUNDESTAG_HEALTH_COMMITTEE_PARTIES);
const allowedRightsStatuses = new Set(["approved", "review_required"]);
const fixedHeader = `/*
 * Kuratierter öffentlicher Amtsträger-Datensatz für GitHub Pages.
 *
 * Quelle: Deutscher Bundestag. Enthält keine CRM-Felder und höchstens eine
 * repräsentative PLZ je Mitglied. Porträts mit ausstehender Rechteprüfung
 * werden ohne Bild-URL veröffentlicht. Aktualisierung ausschließlich über
 * scripts/update_public_politics_directory.mjs.
 */
`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactFields(value, allowedFields, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} ist kein Objekt.`);
  const unexpectedFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  assert(
    unexpectedFields.length === 0,
    `${label} enthält nicht freigegebene Felder: ${unexpectedFields.join(", ")}`
  );
}

function assertString(value, label, { required = true, maxLength = 500 } = {}) {
  assert(typeof value === "string", `${label} ist kein Text.`);
  assert(!required || value.trim().length > 0, `${label} ist leer.`);
  assert(value.length <= maxLength, `${label} ist zu lang.`);
  assert(!/[\u0000-\u001f\u007f]/u.test(value), `${label} enthält Steuerzeichen.`);
}

function assertHttpsUrl(value, label, allowedHosts) {
  assertString(value, label, { maxLength: 1_000 });
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} ist keine gültige URL.`);
  }
  assert(
    url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && allowedHosts.has(url.hostname),
    `${label} verwendet keinen freigegebenen HTTPS-Host.`
  );
  return url;
}

function optionalString(value, label, maxLength = 500) {
  assertString(value, label, { required: false, maxLength });
  return value.trim();
}

function requiredString(value, label, maxLength = 500) {
  assertString(value, label, { maxLength });
  return value.trim();
}

function curatedMember(member, index) {
  const label = `Mitglied ${index + 1}`;
  const id = requiredString(member.id, `${label}.id`, 12);
  assert(/^\d{5,12}$/u.test(id), `${label}.id ist keine Bundestag-ID.`);
  const party = requiredString(member.party, `${label}.party`, 80);
  assert(allowedParties.has(party), `${label}.party ist nicht freigegeben.`);

  const profileUrl = requiredString(member.profileUrl, `${label}.profileUrl`, 1_000);
  const parsedProfileUrl = assertHttpsUrl(
    profileUrl,
    `${label}.profileUrl`,
    new Set(["www.bundestag.de"])
  );
  assert(
    parsedProfileUrl.pathname.endsWith(`-${id}`),
    `${label}.profileUrl passt nicht zur Bundestag-ID.`
  );

  const imageRightsStatus = requiredString(
    member.imageRightsStatus,
    `${label}.imageRightsStatus`,
    40
  );
  assert(
    allowedRightsStatuses.has(imageRightsStatus),
    `${label}.imageRightsStatus ist nicht freigegeben.`
  );

  const representativePostalCode = optionalString(
    member.representativePostalCode || member.mapPostalCode || "",
    `${label}.representativePostalCode`,
    5
  );
  assert(
    !representativePostalCode || /^\d{5}$/u.test(representativePostalCode),
    `${label}.representativePostalCode ist ungültig.`
  );

  const curated = {
    id,
    name: requiredString(member.name, `${label}.name`, 160),
    party,
    role: requiredString(member.role, `${label}.role`, 120),
    profileUrl,
    imageSourceUrl: requiredString(
      member.imageSourceUrl || profileUrl,
      `${label}.imageSourceUrl`,
      1_000
    ),
    imageAttribution: requiredString(
      member.imageAttribution,
      `${label}.imageAttribution`,
      320
    ),
    imageLicense: requiredString(member.imageLicense, `${label}.imageLicense`, 180),
    imageProvider: requiredString(member.imageProvider, `${label}.imageProvider`, 120),
    imageRightsStatus,
    imageUsageTermsUrl: requiredString(
      member.imageUsageTermsUrl,
      `${label}.imageUsageTermsUrl`,
      1_000
    ),
    constituency: optionalString(member.constituency || "", `${label}.constituency`, 260),
    constituencyNumber: optionalString(
      member.constituencyNumber || "",
      `${label}.constituencyNumber`,
      3
    ),
    constituencyName: optionalString(
      member.constituencyName || "",
      `${label}.constituencyName`,
      220
    ),
    constituencyFederalState: requiredString(
      member.constituencyFederalState,
      `${label}.constituencyFederalState`,
      100
    ),
    mandateType: requiredString(member.mandateType, `${label}.mandateType`, 80),
    postalCodes: representativePostalCode ? [representativePostalCode] : [],
    postalCodeCoverage: representativePostalCode ? "representative" : "not_applicable",
    constituencySourceUrl: requiredString(
      member.constituencySourceUrl,
      `${label}.constituencySourceUrl`,
      1_000
    ),
    representativePostalCode,
    mapPostalCode: representativePostalCode
  };

  if (imageRightsStatus === "approved") {
    curated.imageUrl = requiredString(member.imageUrl, `${label}.imageUrl`, 1_000);
  }
  return curated;
}

export function curatePublicPoliticsDirectory(sourcePayload) {
  assert(
    sourcePayload?.memberCount === PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT
      && sourcePayload.members?.length === PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT,
    `Der Bundestag-Datensatz muss genau ${PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT} Mitglieder enthalten.`
  );
  const members = sourcePayload.members.map(curatedMember);
  const payload = {
    available: true,
    demo: true,
    publicDirectory: true,
    committee: requiredString(sourcePayload.committee, "committee", 120),
    parliamentaryTerm: requiredString(
      sourcePayload.parliamentaryTerm,
      "parliamentaryTerm",
      80
    ),
    membership: requiredString(sourcePayload.membership, "membership", 80),
    sourceUrl: requiredString(sourcePayload.sourceUrl, "sourceUrl", 1_000),
    constituencySourceUrl: requiredString(
      sourcePayload.constituencySourceUrl,
      "constituencySourceUrl",
      1_000
    ),
    fetchedAt: requiredString(sourcePayload.fetchedAt, "fetchedAt", 40),
    memberCount: members.length,
    stale: false,
    members
  };
  assertPublicPoliticsDirectoryPayload(payload);
  return payload;
}

export function assertPublicPoliticsDirectoryPayload(payload, { now = Date.now() } = {}) {
  assertExactFields(payload, payloadFields, "Politik-Verzeichnis");
  assert(payload.available === true, "Das Politik-Verzeichnis ist nicht verfügbar.");
  assert(payload.demo === true, "Das Politik-Verzeichnis ist nicht als Pages-Demo markiert.");
  assert(
    payload.publicDirectory === true,
    "Das Politik-Verzeichnis ist nicht als öffentlicher Amtsträger-Datensatz markiert."
  );
  assert(payload.stale === false, "Ein veralteter Politik-Snapshot darf nicht veröffentlicht werden.");
  assert(
    payload.memberCount === PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT
      && Array.isArray(payload.members)
      && payload.members.length === PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT,
    `Der Politik-Snapshot muss genau ${PUBLIC_POLITICS_DIRECTORY_MEMBER_COUNT} Mitglieder enthalten.`
  );
  assert(
    payload.committee === "Ausschuss für Gesundheit",
    "Der Politik-Snapshot enthält nicht den Ausschuss für Gesundheit."
  );
  assert(
    payload.parliamentaryTerm === "21. Wahlperiode"
      && payload.membership === "Ordentliche Mitglieder",
    "Wahlperiode oder Mitgliedschaft des Politik-Snapshots ist ungültig."
  );
  assertHttpsUrl(payload.sourceUrl, "sourceUrl", new Set(["www.bundestag.de"]));
  assertHttpsUrl(
    payload.constituencySourceUrl,
    "constituencySourceUrl",
    new Set(["www.bundestag.de"])
  );
  assertString(payload.fetchedAt, "fetchedAt", { maxLength: 40 });
  const fetchedAt = new Date(payload.fetchedAt).getTime();
  assert(
    Number.isFinite(fetchedAt)
      && new Date(fetchedAt).toISOString() === payload.fetchedAt,
    "fetchedAt ist kein kanonischer ISO-Zeitpunkt."
  );
  const checkedAt = typeof now === "function" ? Number(now()) : Number(now);
  assert(Number.isFinite(checkedAt), "Der Prüfzeitpunkt für den Politik-Snapshot ist ungültig.");
  assert(
    fetchedAt <= checkedAt + PUBLIC_POLITICS_DIRECTORY_MAX_FUTURE_SKEW_MS,
    "fetchedAt liegt unzulässig in der Zukunft."
  );
  assert(
    checkedAt - fetchedAt <= PUBLIC_POLITICS_DIRECTORY_MAX_AGE_MS,
    "Der Politik-Snapshot ist älter als 14 Tage."
  );

  const ids = new Set();
  const profileUrls = new Set();
  const seenParties = new Set();
  for (const [index, member] of payload.members.entries()) {
    const label = `Mitglied ${index + 1}`;
    assertExactFields(member, memberFields, label);
    assert(/^\d{5,12}$/u.test(member.id), `${label}.id ist ungültig.`);
    assert(!ids.has(member.id), `${label}.id ist doppelt.`);
    ids.add(member.id);
    assertString(member.name, `${label}.name`, { maxLength: 160 });
    assertString(member.role, `${label}.role`, { maxLength: 120 });
    assert(allowedParties.has(member.party), `${label}.party ist nicht freigegeben.`);
    seenParties.add(member.party);
    const profileUrl = assertHttpsUrl(
      member.profileUrl,
      `${label}.profileUrl`,
      new Set(["www.bundestag.de"])
    );
    assert(
      profileUrl.pathname.endsWith(`-${member.id}`),
      `${label}.profileUrl passt nicht zur Bundestag-ID.`
    );
    assert(!profileUrls.has(member.profileUrl), `${label}.profileUrl ist doppelt.`);
    profileUrls.add(member.profileUrl);

    assert(
      allowedRightsStatuses.has(member.imageRightsStatus),
      `${label}.imageRightsStatus ist nicht freigegeben.`
    );
    assertHttpsUrl(
      member.imageSourceUrl,
      `${label}.imageSourceUrl`,
      member.imageRightsStatus === "approved"
        ? approvedImageSourceHosts
        : new Set(["www.bundestag.de"])
    );
    assertHttpsUrl(
      member.imageUsageTermsUrl,
      `${label}.imageUsageTermsUrl`,
      approvedImageTermsHosts
    );
    for (const field of ["imageAttribution", "imageLicense", "imageProvider"]) {
      assertString(member[field], `${label}.${field}`, { maxLength: 320 });
    }
    if (member.imageRightsStatus === "approved") {
      assert(
        Object.hasOwn(member, "imageUrl"),
        `${label} hat ein freigegebenes Porträt ohne imageUrl.`
      );
      assertHttpsUrl(member.imageUrl, `${label}.imageUrl`, approvedImageHosts);
    } else {
      assert(
        !Object.hasOwn(member, "imageUrl"),
        `${label} veröffentlicht trotz ausstehender Rechteprüfung eine imageUrl.`
      );
    }

    for (const [field, maxLength] of [
      ["constituency", 260],
      ["constituencyNumber", 3],
      ["constituencyName", 220],
      ["constituencyFederalState", 100],
      ["mandateType", 80],
      ["representativePostalCode", 5],
      ["mapPostalCode", 5]
    ]) {
      assertString(member[field], `${label}.${field}`, {
        required: !["constituency", "constituencyNumber", "constituencyName", "representativePostalCode", "mapPostalCode"].includes(field),
        maxLength
      });
    }
    assertHttpsUrl(
      member.constituencySourceUrl,
      `${label}.constituencySourceUrl`,
      new Set(["www.bundestag.de"])
    );
    assert(
      Array.isArray(member.postalCodes) && member.postalCodes.length <= 1,
      `${label}.postalCodes enthält mehr als eine PLZ.`
    );
    assert(
      member.postalCodes.every((postalCode) => /^\d{5}$/u.test(postalCode)),
      `${label}.postalCodes enthält eine ungültige PLZ.`
    );
    assert(
      member.representativePostalCode === member.mapPostalCode
        && (
          member.representativePostalCode
            ? member.postalCodes.length === 1
              && member.postalCodes[0] === member.representativePostalCode
              && member.postalCodeCoverage === "representative"
            : member.postalCodes.length === 0
              && member.postalCodeCoverage === "not_applicable"
        ),
      `${label} verletzt den Vertrag für die repräsentative Karten-PLZ.`
    );
  }
  assert(
    seenParties.size === allowedParties.size
      && [...allowedParties].every((party) => seenParties.has(party)),
    "Der Politik-Snapshot enthält nicht alle erwarteten Fraktionen."
  );
  return payload;
}

export function serializePublicPoliticsDirectory(payload) {
  assertPublicPoliticsDirectoryPayload(payload);
  return `${fixedHeader}window.${PUBLIC_POLITICS_DIRECTORY_GLOBAL} = Object.freeze(${
    JSON.stringify(payload, null, 2)
  });\n`;
}

export function parsePublicPoliticsDirectoryScript(source) {
  const escapedGlobal = PUBLIC_POLITICS_DIRECTORY_GLOBAL.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = String(source).match(
    new RegExp(`^${fixedHeader.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}window\\.${escapedGlobal} = Object\\.freeze\\(([\\s\\S]+)\\);\\n$`, "u")
  );
  assert(match, "Der Politik-Snapshot entspricht nicht dem ausschließlich datenhaltenden JS-Wrapper.");
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Der Politik-Snapshot enthält kein gültiges JSON (${error.message}).`);
  }
  return assertPublicPoliticsDirectoryPayload(payload);
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");
  assert(unknownArguments.length === 0, `Unbekannte Argumente: ${unknownArguments.join(", ")}`);

  if (checkOnly) {
    const payload = parsePublicPoliticsDirectoryScript(readFileSync(outputPath, "utf8"));
    console.log(
      `Public politics directory OK: ${payload.memberCount} Mitglieder, `
      + `${payload.members.filter((member) => member.imageRightsStatus === "approved").length} freigegebene Porträts.`
    );
    return;
  }

  const sourcePayload = await createBundestagHealthCommitteeDirectory().load();
  const payload = curatePublicPoliticsDirectory(sourcePayload);
  const temporaryPath = `${outputPath}.tmp`;
  try {
    writeFileSync(temporaryPath, serializePublicPoliticsDirectory(payload), {
      encoding: "utf8",
      mode: 0o644
    });
    renameSync(temporaryPath, outputPath);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  console.log(
    `Updated ${outputPath}: ${payload.memberCount} Mitglieder, `
    + `${payload.members.filter((member) => member.imageRightsStatus === "approved").length} freigegebene Porträts.`
  );
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await main();
}
