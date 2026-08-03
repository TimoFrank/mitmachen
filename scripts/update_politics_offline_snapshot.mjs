import {
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePublicPoliticsDirectoryScript
} from "./update_public_politics_directory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultDirectoryPath = resolve(
  root,
  "frontend",
  "data",
  "public-politics-directory.js"
);
const defaultOfflinePath = resolve(
  root,
  "public",
  "pages-demo",
  "politik-offline.html"
);
const offlineDataPattern =
  /(<script id="offline-data" type="application\/json">)([\s\S]+?)(<\/script>)/u;
const approvedPortraitPattern =
  /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalIsoTimestamp(value, label) {
  const timestamp = new Date(value).getTime();
  assert(
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value,
    `${label} ist kein kanonischer ISO-Zeitpunkt.`
  );
  return timestamp;
}

export function parsePoliticsOfflineDocument(source) {
  const match = String(source).match(offlineDataPattern);
  assert(match, "politik-offline.html enthält keinen eingebetteten Offline-Datenstand.");
  let payload;
  try {
    payload = JSON.parse(match[2]);
  } catch (error) {
    throw new Error(`Der Offline-Datenstand ist kein gültiges JSON (${error.message}).`);
  }
  assert(
    payload && typeof payload === "object" && Array.isArray(payload.members),
    "Der Offline-Datenstand besitzt keine Mitgliederliste."
  );
  return { match, payload };
}

function assertCompatibleOfflineMember(publicMember, offlineMember) {
  const label = publicMember.name || publicMember.id;
  assert(offlineMember, `Mitglied ${label} fehlt im Offline-Datenstand.`);
  assert(
    offlineMember.constituencyNumber === publicMember.constituencyNumber
      && offlineMember.constituencyFederalState === publicMember.constituencyFederalState,
    `Die Kartenbasis für ${label} hat sich geändert; Wahlkreisflächen und Kartenpunkt müssen neu kuratiert werden.`
  );
  assert(
    offlineMember.imageRightsStatus === publicMember.imageRightsStatus,
    `Der Bildrechte-Status für ${label} hat sich geändert; das Portrait muss neu kuratiert werden.`
  );
  if (publicMember.imageRightsStatus === "approved") {
    assert(
      approvedPortraitPattern.test(offlineMember.imageDataUri),
      `Das freigegebene Offline-Portrait für ${label} fehlt.`
    );
    for (const field of [
      "imageSourceUrl",
      "imageAttribution",
      "imageLicense",
      "imageProvider",
      "imageUsageTermsUrl"
    ]) {
      assert(
        offlineMember[field] === publicMember[field],
        `Die Bildquelle oder Nutzungserlaubnis für ${label} hat sich geändert; das Portrait muss neu kuratiert werden.`
      );
    }
  } else {
    assert(
      offlineMember.imageDataUri === "",
      `Für ${label} darf ohne bestätigte Bildrechte kein Offline-Portrait eingebettet sein.`
    );
  }
}

function synchronizedOfflineMember(publicMember, offlineMember) {
  assertCompatibleOfflineMember(publicMember, offlineMember);
  return {
    ...offlineMember,
    name: publicMember.name,
    faction: publicMember.party,
    role: publicMember.role,
    profileUrl: publicMember.profileUrl,
    constituency: publicMember.constituency,
    constituencyNumber: publicMember.constituencyNumber,
    constituencyName: publicMember.constituencyName,
    constituencyFederalState: publicMember.constituencyFederalState,
    mandateType: publicMember.mandateType,
    representativePostalCode: publicMember.representativePostalCode,
    postalCodeCoverage: publicMember.postalCodeCoverage,
    constituencySourceUrl: publicMember.constituencySourceUrl,
    imageSourceUrl: publicMember.imageSourceUrl,
    imageAttribution: publicMember.imageAttribution,
    imageLicense: publicMember.imageLicense,
    imageProvider: publicMember.imageProvider,
    imageRightsStatus: publicMember.imageRightsStatus,
    imageUsageTermsUrl: publicMember.imageUsageTermsUrl
  };
}

export function synchronizePoliticsOfflinePayload(
  directory,
  offlinePayload,
  { generatedAt = new Date().toISOString() } = {}
) {
  assert(directory.memberCount === 38, "Das öffentliche Politik-Verzeichnis muss 38 Mitglieder enthalten.");
  assert(offlinePayload.members.length === 38, "Der Offline-Datenstand muss 38 Mitglieder enthalten.");
  const offlineMembersById = new Map(
    offlinePayload.members.map((member) => [member.id, member])
  );
  assert(
    offlineMembersById.size === offlinePayload.members.length,
    "Der Offline-Datenstand enthält doppelte Mitglieds-IDs."
  );
  const publicIds = new Set(directory.members.map((member) => member.id));
  assert(
    publicIds.size === directory.members.length
      && publicIds.size === offlineMembersById.size
      && [...publicIds].every((id) => offlineMembersById.has(id)),
    "Die Ausschussbesetzung hat sich geändert; Mitglieder, Portraits und Kartenbasis müssen neu kuratiert werden."
  );
  const members = directory.members.map((member) => synchronizedOfflineMember(
    member,
    offlineMembersById.get(member.id)
  ));
  for (const member of members) {
    if (!member.constituencyNumber) continue;
    assert(
      typeof offlinePayload.map?.constituencyPaths?.[member.constituencyNumber] === "string",
      `Die Wahlkreisfläche ${member.constituencyNumber} für ${member.name} fehlt.`
    );
  }
  const snapshotTimestamp = canonicalIsoTimestamp(directory.fetchedAt, "fetchedAt");
  const generatedTimestamp = canonicalIsoTimestamp(generatedAt, "generatedAt");
  assert(
    generatedTimestamp >= snapshotTimestamp,
    "generatedAt darf nicht vor dem Bundestag-Snapshot liegen."
  );
  const approvedPortraits = members.filter(
    (member) => member.imageRightsStatus === "approved"
  ).length;
  const representativePostalCodes = members.filter(
    (member) => member.representativePostalCode
  ).length;
  return {
    ...offlinePayload,
    snapshotAt: directory.fetchedAt,
    generatedAt,
    sourceUrl: directory.sourceUrl,
    constituencySourceUrl: directory.constituencySourceUrl,
    counts: {
      members: members.length,
      approvedPortraits,
      initialFallbacks: members.length - approvedPortraits,
      representativePostalCodes,
      constituencies: Object.keys(offlinePayload.map?.constituencyPaths || {}).length
    },
    members
  };
}

function assertOfflineSnapshotIsSynchronized(directory, offlinePayload) {
  const synchronized = synchronizePoliticsOfflinePayload(
    directory,
    offlinePayload,
    { generatedAt: offlinePayload.generatedAt }
  );
  assert(
    JSON.stringify(synchronized) === JSON.stringify(offlinePayload),
    "politik-offline.html ist nicht mit dem kuratierten öffentlichen Politik-Verzeichnis synchronisiert."
  );
}

function parseArguments(argv) {
  const options = {
    checkOnly: false,
    directoryPath: defaultDirectoryPath,
    offlinePath: defaultOfflinePath
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.checkOnly = true;
      continue;
    }
    if (argument === "--directory-path" || argument === "--offline-path") {
      const value = argv[index + 1];
      assert(value && !value.startsWith("-"), `${argument} erwartet einen Pfad.`);
      options[argument === "--directory-path" ? "directoryPath" : "offlinePath"] =
        resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unbekanntes Argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const directory = parsePublicPoliticsDirectoryScript(
    readFileSync(options.directoryPath, "utf8")
  );
  const offlineSource = readFileSync(options.offlinePath, "utf8");
  const { match, payload } = parsePoliticsOfflineDocument(offlineSource);
  if (options.checkOnly) {
    assertOfflineSnapshotIsSynchronized(directory, payload);
    console.log(
      `Politics offline snapshot OK: ${payload.counts.members} Mitglieder, `
      + `${payload.counts.approvedPortraits} eingebettete Porträts.`
    );
    return;
  }
  const synchronized = synchronizePoliticsOfflinePayload(directory, payload);
  const nextSource = offlineSource.replace(
    match[0],
    `${match[1]}${JSON.stringify(synchronized)}${match[3]}`
  );
  const temporaryPath = `${options.offlinePath}.tmp`;
  try {
    writeFileSync(temporaryPath, nextSource, { encoding: "utf8", mode: 0o644 });
    renameSync(temporaryPath, options.offlinePath);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  console.log(
    `Updated ${options.offlinePath}: ${synchronized.counts.members} Mitglieder, `
    + `${synchronized.counts.approvedPortraits} eingebettete Porträts.`
  );
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await main();
}
