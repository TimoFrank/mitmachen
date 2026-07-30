const BUNDESTAG_HOSTNAME = "www.bundestag.de";
const ORDINARY_MEMBERSHIP = "Ordentliche Mitglieder";
const DEFAULT_ROLE = "Ordentliches Mitglied";

export const BUNDESTAG_HEALTH_COMMITTEE_SOURCE_URL =
  "https://www.bundestag.de/ausschuesse/gesundheit/";
export const BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL =
  "https://www.bundestag.de/ajax/member/de/ausschuesse/gesundheit/1065646-1065646?limit=100";
export const BUNDESTAG_CONSTITUENCY_DATA_URL =
  "https://www.bundestag.de/static/appdata/filter/wks.json";
export const BUNDESTAG_CONSTITUENCY_SOURCE_URL =
  "https://www.bundestag.de/abgeordnete/wahlkreise/";
export const BUNDESTAG_IMAGE_USAGE_TERMS_URL =
  "https://www.bundestag.de/services/impressum";
export const BUNDESTAG_IMAGE_DATABASE_USAGE_TERMS_URL =
  "https://bilddatenbank.bundestag.de/site/nutzungsbedingungen";
export const WIKIMEDIA_COMMONS_REUSE_URL =
  "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia";
export const BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS = 24 * 60 * 60 * 1000;
export const BUNDESTAG_HEALTH_COMMITTEE_TIMEOUT_MS = 8_000;
export const BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES = 1024 * 1024;
export const BUNDESTAG_HEALTH_COMMITTEE_PARTIES = Object.freeze([
  "CDU/CSU",
  "AfD",
  "SPD",
  "Bündnis 90/Die Grünen",
  "Die Linke"
]);

const ALLOWED_PARTIES = new Set(BUNDESTAG_HEALTH_COMMITTEE_PARTIES);
const COMMONS_PORTRAITS_BY_MEMBER_ID = new Map([
  ["1045922", ["Dr. Tanja Machalet (2021).jpg", "photothek.net", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"]],
  ["1046542", ["2020-02-13 Deutscher Bundestag IMG 3367 by Stepro.jpg", "Steffen Prößdorf", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1043764", ["Simone Borchardt c Ritchie Herbert.jpg", "VZukovsky", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1048714", ["Portrait Matthias Hiller.jpg", "TeamHiller", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1048984", ["MJK 67600 Axel Müller (Bundestag 2020).jpg", "Martin Kraft", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1046496", ["260326 Pauls Plenum.jpg", "CDU/CSU-Fraktion", "CC0", "https://creativecommons.org/publicdomain/zero/1.0/"]],
  ["1049274", ["Hendrik Streeck.jpg", "Frank Burkhardt", "CC BY 2.5", "https://creativecommons.org/licenses/by/2.5/"]],
  ["1048288", ["Emmi Zeulner 2013.jpg", "Wolf Heider-Sawall", "CC BY-SA 3.0 DE", "https://creativecommons.org/licenses/by-sa/3.0/de/"]],
  ["1047420", ["2018-10-12 Martin Sichert AfD 8111.jpg", "Michael Lucan", "CC BY-SA 3.0 DE", "https://creativecommons.org/licenses/by-sa/3.0/de/"]],
  ["1046124", ["Matthias Mieves (2023).jpg", "Christian Schneider", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"]],
  ["1046166", ["2020-02-14 Deutscher Bundestag IMG 3739 by Stepro.jpg", "Steffen Prößdorf", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1046474", ["Dr. Christos Pantazis (2021).jpg", "photothek.net", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"]],
  ["1047394", ["Dr. Lina Seitzl (2021).jpg", "photothek.net", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"]],
  ["1048252", ["Serdar Yüksel (2014).jpg", "LTH89", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1043990", ["Janosch Dahmen.jpg", "Turnbeutel85", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1044328", ["SF2026.jpg", "Laura Dittrich", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"]],
  ["1044850", ["Linda Heitmann (Bundestagsabgeordnete).jpg", "Mghamburg", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1045310", ["Dr. Kappert-Gonther, Kirsten-8957.jpg", "Foto-AG Melle", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1047936", ["Johannes.Wagner.Portraet.jpg", "Maloujow", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1044658", ["Ates Gürpinar 6917.jpg", "Henning Schlottmann", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]],
  ["1046072", ["2025-01-18 Außerordentlicher Bundesparteitag Die Linke 2025 in Berlin by Sandro Halank–122.jpg", "Sandro Halank", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]]
]);
const BUNDESTAG_IMAGE_DATABASE_PORTRAITS_BY_MEMBER_ID = new Map([
  ["1045200", ["file7o2ln3nzw44uqicjh0.jpg", "5013430", "Jörg Carstensen / photothek"]],
  ["1047392", ["file82xxn0vpgo0171kqpe9n.jpg", "5028033", "Thomas Trutschel / photothek"]],
  ["1049354", ["file7k6a5es8ni9193hsmh82.jpg", "5009089", "Felix Zahn / photothek"]],
  ["1043728", ["file82nup2clwhtipl7jjlp.jpg", "5027864", "Christina Czybik"]],
  ["1044132", ["file82nup2c95kh1e9hnz87j.jpg", "5027863", "Christina Czybik"]],
  ["1049402", ["file7mzntq6k0aeu4qjm8z4.jpg", "5012567", "Thomas Imo / photothek"]],
  ["1047344", ["file7c4mysrgrn518lb694dz.jpg", "2284416", "Renate Blanke"]]
]);
const NAMED_HTML_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  copy: "©",
  gt: ">",
  lt: "<",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  quot: "\"",
  shy: ""
});

export class BundestagHealthCommitteeError extends Error {
  constructor(message, { code = "bundestag_health_committee_invalid_response", cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "BundestagHealthCommitteeError";
    this.code = code;
    this.status = 502;
  }
}

function responseError(message, options) {
  return new BundestagHealthCommitteeError(message, options);
}

function decodedHtmlEntity(entity) {
  const token = entity.slice(1, -1);
  if (token[0] !== "#") {
    return Object.hasOwn(NAMED_HTML_ENTITIES, token.toLowerCase())
      ? NAMED_HTML_ENTITIES[token.toLowerCase()]
      : entity;
  }

  const hexadecimal = token[1]?.toLowerCase() === "x";
  const digits = token.slice(hexadecimal ? 2 : 1);
  if (!digits || !(hexadecimal ? /^[0-9a-f]+$/iu : /^\d+$/u).test(digits)) {
    return "";
  }
  const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
  if (
    !Number.isInteger(codePoint)
    || codePoint <= 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return "";
  }
  return String.fromCodePoint(codePoint);
}

function sanitizedHtmlText(value, { field, maxLength }) {
  const withoutExecutableMarkup = String(value || "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<[^>]*>/gu, " ");
  const decoded = withoutExecutableMarkup
    .replace(/&(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/giu, decodedHtmlEntity)
    .replace(/[<>]/gu, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();

  if (!decoded || decoded.length > maxLength) {
    throw responseError(`Das Bundestag-Feld „${field}“ ist leer oder ungültig.`);
  }
  return decoded;
}

function attributeValue(openingTag, attributeName) {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = String(openingTag || "").match(
    new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`, "iu")
  );
  return match ? (match[1] ?? match[2] ?? "") : "";
}

function hasClassToken(openingTag, classToken) {
  return attributeValue(openingTag, "class").split(/\s+/u).includes(classToken);
}

function elementInnerHtmlByClass(html, tagName, classToken) {
  const source = String(html || "");
  const openingPattern = new RegExp(`<${tagName}\\b[^>]*>`, "giu");
  for (const match of source.matchAll(openingPattern)) {
    if (!hasClassToken(match[0], classToken)) continue;
    const contentStart = match.index + match[0].length;
    const closingMatch = source.slice(contentStart).match(
      new RegExp(`<\\/${tagName}\\s*>`, "iu")
    );
    if (!closingMatch) return "";
    return source.slice(contentStart, contentStart + closingMatch.index);
  }
  return "";
}

function divBlocksByClass(html, classToken) {
  const starts = [];
  for (const match of String(html || "").matchAll(/<div\b[^>]*>/giu)) {
    if (hasClassToken(match[0], classToken)) starts.push(match.index);
  }
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function slideBlocks(html) {
  return divBlocksByClass(html, "bt-slide");
}

function expectedMemberCount(html) {
  for (const match of String(html || "").matchAll(/<[^>]+>/gu)) {
    const rawCount = attributeValue(match[0], "data-mmbrsCount");
    if (!rawCount) continue;
    if (!/^\d{1,3}$/u.test(rawCount)) break;
    const count = Number.parseInt(rawCount, 10);
    if (count < 1 || count > 100) break;
    return count;
  }
  throw responseError("Die Bundestag-Antwort enthält keinen gültigen Mitgliederzähler.");
}

function canonicalProfileUrl(rawUrl, memberId) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw responseError("Eine Bundestag-Profil-URL ist ungültig.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== BUNDESTAG_HOSTNAME
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !/^\/abgeordnete\/biografien\/[A-Z0-9%]\/[A-Za-z0-9._~%+-]+-\d{5,12}$/u.test(parsed.pathname)
    || /%2f|%5c/iu.test(parsed.pathname)
    || !parsed.pathname.endsWith(`-${memberId}`)
  ) {
    throw responseError("Eine Bundestag-Profil-URL entspricht nicht dem erlaubten Format.");
  }
  return parsed.href;
}

function canonicalPortraitUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw responseError("Eine Bundestag-Porträt-URL ist ungültig.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== BUNDESTAG_HOSTNAME
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !/^\/resource\/image\/\d{5,12}\/3x4\/\d{2,4}\/\d{2,4}\/[a-f0-9]{16,64}\/[a-f0-9]{16,64}\/[A-Za-z0-9._~+-]+\.(?:jpe?g|png|webp)$/iu.test(parsed.pathname)
    || /%2f|%5c/iu.test(parsed.pathname)
  ) {
    throw responseError("Eine Bundestag-Porträt-URL entspricht nicht dem erlaubten Format.");
  }
  return parsed.href;
}

function portraitMetadata(slide, profileUrl) {
  let portraitTag = "";
  for (const match of slide.matchAll(/<img\b[^>]*>/giu)) {
    if (attributeValue(match[0], "data-img-md-retina")) {
      portraitTag = match[0];
      break;
    }
  }
  if (!portraitTag) {
    throw responseError("Eine ordentliche Mitgliedskarte enthält kein offizielles Porträt.");
  }
  const imageUrl = canonicalPortraitUrl(attributeValue(portraitTag, "data-img-md-retina"));

  const imageDialogue = elementInnerHtmlByClass(slide, "div", "bt-bild-info-dialogue");
  const paragraphs = [...imageDialogue.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/giu)]
    .map((match) => sanitizedHtmlText(match[1], {
      field: "Bildquelle",
      maxLength: 320
    }));
  const imageAttribution = [...paragraphs].reverse().find((value) => value.startsWith("© "));
  if (!imageAttribution || imageAttribution.length > 280) {
    throw responseError("Eine ordentliche Mitgliedskarte enthält keine gültige Bildquelle.");
  }

  return Object.freeze({
    imageUrl,
    imageSourceUrl: profileUrl,
    imageAttribution,
    imageLicense: "Nutzungsbedingungen des Deutschen Bundestages",
    imageProvider: "Deutscher Bundestag",
    imageRightsStatus: "review_required",
    imageUsageTermsUrl: BUNDESTAG_IMAGE_USAGE_TERMS_URL
  });
}

function commonsFilePageUrl(fileName) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName).replace(/%20/gu, "_")}`;
}

function commonsThumbnailUrl(fileName) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}?width=360`;
}

export function publicPortraitMetadataForMember(member = {}) {
  const commonsPortrait = COMMONS_PORTRAITS_BY_MEMBER_ID.get(String(member.id || ""));
  if (commonsPortrait) {
    const [fileName, author, license, licenseUrl] = commonsPortrait;
    return Object.freeze({
      imageUrl: commonsThumbnailUrl(fileName),
      imageSourceUrl: commonsFilePageUrl(fileName),
      imageAttribution: `${author} · ${license} · Wikimedia Commons`,
      imageLicense: license,
      imageProvider: "Wikimedia Commons",
      imageRightsStatus: "approved",
      imageUsageTermsUrl: licenseUrl
    });
  }

  const bundestagDatabasePortrait = BUNDESTAG_IMAGE_DATABASE_PORTRAITS_BY_MEMBER_ID.get(
    String(member.id || "")
  );
  if (bundestagDatabasePortrait) {
    const [fileName, pictureId, author] = bundestagDatabasePortrait;
    return Object.freeze({
      imageUrl: `https://bilddatenbank.bundestag.de/fotos/${fileName}`,
      imageSourceUrl: `https://bilddatenbank.bundestag.de/site/picture-detail?id=${pictureId}`,
      imageAttribution: `Deutscher Bundestag/${author}`,
      imageLicense: "Private und kommerzielle nicht-werbliche Nutzung",
      imageProvider: "Bilddatenbank des Deutschen Bundestages",
      imageRightsStatus: "approved",
      imageUsageTermsUrl: BUNDESTAG_IMAGE_DATABASE_USAGE_TERMS_URL
    });
  }

  return Object.freeze({
    imageUrl: member.imageUrl || "",
    imageSourceUrl: member.imageSourceUrl || member.profileUrl || "",
    imageAttribution: member.imageAttribution || "",
    imageLicense: member.imageLicense || "Nutzungsbedingungen des Deutschen Bundestages",
    imageProvider: member.imageProvider || "Deutscher Bundestag",
    imageRightsStatus: "review_required",
    imageUsageTermsUrl: member.imageUsageTermsUrl || BUNDESTAG_IMAGE_USAGE_TERMS_URL
  });
}

function displayName(rawName) {
  const normalized = sanitizedHtmlText(rawName, { field: "Name", maxLength: 160 });
  const parts = normalized.split(",");
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw responseError("Ein Bundestag-Name entspricht nicht dem erwarteten Format.");
  }
  return `${parts[1].trim()} ${parts[0].trim()}`;
}

function ordinaryMemberFromSlide(slide) {
  const membershipHtml = elementInnerHtmlByClass(
    slide,
    "p",
    "bt-teaser-person-mitgliedschaft"
  );
  if (!membershipHtml) return null;
  const membership = sanitizedHtmlText(membershipHtml, {
    field: "Mitgliedschaft",
    maxLength: 80
  });
  if (membership !== ORDINARY_MEMBERSHIP) return null;

  let memberAnchor = "";
  for (const match of slide.matchAll(/<a\b[^>]*>/giu)) {
    if (hasClassToken(match[0], "bt-legacy-teaser")) {
      memberAnchor = match[0];
      break;
    }
  }
  if (!memberAnchor) {
    throw responseError("Eine ordentliche Mitgliedskarte enthält keinen gültigen Profillink.");
  }

  const memberId = attributeValue(memberAnchor, "data-id");
  if (!/^\d{5,12}$/u.test(memberId)) {
    throw responseError("Eine ordentliche Mitgliedskarte enthält keine gültige Bundestag-ID.");
  }
  const profileUrl = canonicalProfileUrl(attributeValue(memberAnchor, "href"), memberId);
  const name = displayName(elementInnerHtmlByClass(slide, "h3", "bt-person__lastname"));
  const party = sanitizedHtmlText(
    elementInnerHtmlByClass(slide, "p", "bt-person-fraktion"),
    { field: "Fraktion", maxLength: 80 }
  );
  if (!ALLOWED_PARTIES.has(party)) {
    throw responseError("Eine Bundestag-Mitgliedskarte enthält eine unbekannte Fraktion.");
  }

  const roleHtml = elementInnerHtmlByClass(slide, "p", "bt-person-funktion");
  const role = roleHtml
    ? sanitizedHtmlText(roleHtml, { field: "Funktion", maxLength: 120 })
    : DEFAULT_ROLE;
  const portrait = portraitMetadata(slide, profileUrl);

  return Object.freeze({
    id: memberId,
    name,
    party,
    role,
    profileUrl,
    ...portrait,
    constituency: "",
    constituencyNumber: "",
    constituencyName: "",
    constituencyFederalState: "",
    mandateType: "",
    constituencyPostalCodes: Object.freeze([]),
    postalCodes: Object.freeze([]),
    postalCodeCoverage: "not_applicable",
    constituencySourceUrl: BUNDESTAG_CONSTITUENCY_SOURCE_URL
  });
}

function isoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw responseError("Der Abrufzeitpunkt für die Bundestag-Daten ist ungültig.");
  }
  return date.toISOString();
}

export function parseBundestagHealthCommitteeHtml(
  html,
  { fetchedAt = new Date() } = {}
) {
  if (typeof html !== "string") {
    throw responseError("Die Bundestag-Antwort ist kein HTML-Text.");
  }
  if (Buffer.byteLength(html, "utf8") > BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES) {
    throw responseError("Die Bundestag-Antwort überschreitet das zulässige Größenlimit.", {
      code: "bundestag_health_committee_response_too_large"
    });
  }

  const expectedCount = expectedMemberCount(html);
  const members = slideBlocks(html)
    .map(ordinaryMemberFromSlide)
    .filter(Boolean);
  if (members.length !== expectedCount) {
    throw responseError(
      `Der Bundestag-Mitgliederzähler (${expectedCount}) stimmt nicht mit den gelesenen Karten (${members.length}) überein.`
    );
  }
  if (new Set(members.map((member) => member.id)).size !== members.length) {
    throw responseError("Die Bundestag-Antwort enthält doppelte Mitglieds-IDs.");
  }
  if (new Set(members.map((member) => member.profileUrl)).size !== members.length) {
    throw responseError("Die Bundestag-Antwort enthält doppelte Profil-URLs.");
  }

  return Object.freeze({
    committee: "Ausschuss für Gesundheit",
    parliamentaryTerm: "21. Wahlperiode",
    membership: ORDINARY_MEMBERSHIP,
    sourceUrl: BUNDESTAG_HEALTH_COMMITTEE_SOURCE_URL,
    sourceEndpoint: BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL,
    constituencySourceUrl: BUNDESTAG_CONSTITUENCY_SOURCE_URL,
    constituencySourceEndpoint: BUNDESTAG_CONSTITUENCY_DATA_URL,
    fetchedAt: isoTimestamp(fetchedAt),
    memberCount: members.length,
    stale: false,
    members: Object.freeze(members)
  });
}

function jsonString(value, { field, maxLength }) {
  if (typeof value !== "string") {
    throw responseError(`Das Bundestag-Feld „${field}“ ist ungültig.`);
  }
  return sanitizedHtmlText(value, { field, maxLength });
}

function memberIdFromConstituencyLink(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw responseError("Der Bundestag-Wahlkreisdatensatz enthält eine ungültige Profil-URL.");
  }
  const pathMatch = parsed.pathname.match(
    /^\/(?:de\/)?abgeordnete\/biografien\/[A-Z0-9%]\/[A-Za-z0-9._~%+-]+-(\d{5,12})$/u
  );
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== BUNDESTAG_HOSTNAME
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || /%2f|%5c/iu.test(parsed.pathname)
    || !pathMatch
  ) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz enthält eine nicht erlaubte Profil-URL.");
  }
  return pathMatch[1];
}

function constituencyNumber(value) {
  const normalized = jsonString(value, {
    field: "Wahlkreisnummer",
    maxLength: 3
  });
  const numeric = Number.parseInt(normalized, 10);
  if (!/^\d{3}$/u.test(normalized) || numeric < 1 || numeric > 299) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz enthält eine ungültige Wahlkreisnummer.");
  }
  return normalized;
}

function postalCodesFromConstituency(constituency) {
  if (!Array.isArray(constituency.counties) || constituency.counties.length > 200) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Kreisangaben.");
  }
  const postalCodes = new Set();
  function addPostalCodes(values) {
    if (!Array.isArray(values) || values.length > 500) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Postleitzahlen.");
    }
    for (const value of values) {
      if (typeof value !== "string" || !/^\d{5}$/u.test(value)) {
        throw responseError("Der Bundestag-Wahlkreisdatensatz enthält eine ungültige Postleitzahl.");
      }
      postalCodes.add(value);
    }
  }

  for (const county of constituency.counties) {
    if (!county || typeof county !== "object" || Array.isArray(county)) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Kreisangaben.");
    }
    addPostalCodes(county.zipCodes || []);
    if (!Array.isArray(county.communities) || county.communities.length > 1_000) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Gemeindeangaben.");
    }
    for (const community of county.communities) {
      if (!community || typeof community !== "object" || Array.isArray(community)) {
        throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Gemeindeangaben.");
      }
      addPostalCodes(community.zipCodes || []);
    }
  }
  return Object.freeze([...postalCodes].sort());
}

function constituencySourceUrl(number) {
  return `${BUNDESTAG_CONSTITUENCY_SOURCE_URL}?wknr=${number}`;
}

function validatedMemberPlacement(mdb, expectedMember, metadata) {
  if (!mdb || typeof mdb !== "object" || Array.isArray(mdb)) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz enthält einen ungültigen Abgeordneteneintrag.");
  }
  const memberId = memberIdFromConstituencyLink(mdb.link);
  if (!expectedMember || memberId !== expectedMember.id) return null;
  if (
    displayName(jsonString(mdb.name, { field: "Wahlkreis-Name", maxLength: 160 }))
      !== expectedMember.name
  ) {
    throw responseError("Mitgliederliste und Wahlkreisdatensatz enthalten unterschiedliche Namen.");
  }
  const party = jsonString(mdb.party, { field: "Wahlkreis-Fraktion", maxLength: 80 });
  if (!ALLOWED_PARTIES.has(party) || party !== expectedMember.party) {
    throw responseError("Mitgliederliste und Wahlkreisdatensatz enthalten unterschiedliche Fraktionen.");
  }
  if (typeof mdb.first !== "boolean") {
    throw responseError("Der Bundestag-Wahlkreisdatensatz enthält eine ungültige Mandatsart.");
  }
  return Object.freeze({
    ...metadata,
    mandateType: mdb.first ? "Wahlkreismandat" : "Landesliste"
  });
}

export function parseBundestagConstituencyDataJson(
  json,
  { members } = {}
) {
  if (typeof json !== "string") {
    throw responseError("Der Bundestag-Wahlkreisdatensatz ist kein JSON-Text.");
  }
  if (Buffer.byteLength(json, "utf8") > BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz überschreitet das zulässige Größenlimit.", {
      code: "bundestag_health_committee_response_too_large"
    });
  }
  if (
    !Array.isArray(members)
    || members.length < 1
    || members.length > 100
    || members.some((member) => !member || typeof member !== "object")
  ) {
    throw responseError("Für den Wahlkreisabgleich fehlt eine gültige Mitgliederliste.");
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz ist kein gültiges JSON.", {
      code: "bundestag_health_committee_invalid_json",
      cause: error
    });
  }
  if (
    !parsed
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || !Array.isArray(parsed.federalStates)
    || parsed.federalStates.length < 1
    || parsed.federalStates.length > 20
  ) {
    throw responseError("Der Bundestag-Wahlkreisdatensatz hat eine ungültige Struktur.");
  }

  const expectedMembers = new Map(members.map((member) => [member.id, member]));
  if (expectedMembers.size !== members.length) {
    throw responseError("Für den Wahlkreisabgleich wurden doppelte Mitglieds-IDs übergeben.");
  }
  const placements = new Map();

  function recordPlacement(mdb, metadata) {
    const rawLink = mdb && typeof mdb === "object" && !Array.isArray(mdb)
      ? mdb.link
      : "";
    const memberId = memberIdFromConstituencyLink(rawLink);
    const expectedMember = expectedMembers.get(memberId);
    if (!expectedMember) return;
    const placement = validatedMemberPlacement(mdb, expectedMember, metadata);
    if (placements.has(memberId)) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ein Ausschussmitglied mehrfach.");
    }
    placements.set(memberId, placement);
  }

  const seenConstituencies = new Set();
  for (const federalState of parsed.federalStates) {
    if (!federalState || typeof federalState !== "object" || Array.isArray(federalState)) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ein ungültiges Bundesland.");
    }
    const constituencyFederalState = jsonString(federalState.name, {
      field: "Bundesland",
      maxLength: 100
    });
    if (!Array.isArray(federalState.mdbs) || federalState.mdbs.length > 1_000) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Landeslisten.");
    }
    for (const mdb of federalState.mdbs) {
      recordPlacement(mdb, Object.freeze({
        constituency: "",
        constituencyNumber: "",
        constituencyName: "",
        constituencyFederalState,
        constituencyPostalCodes: Object.freeze([]),
        postalCodes: Object.freeze([]),
        postalCodeCoverage: "not_applicable",
        constituencySourceUrl: BUNDESTAG_CONSTITUENCY_SOURCE_URL
      }));
    }

    if (
      !Array.isArray(federalState.constituencies)
      || federalState.constituencies.length > 299
    ) {
      throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Wahlkreise.");
    }
    for (const constituency of federalState.constituencies) {
      if (!constituency || typeof constituency !== "object" || Array.isArray(constituency)) {
        throw responseError("Der Bundestag-Wahlkreisdatensatz enthält einen ungültigen Wahlkreis.");
      }
      const number = constituencyNumber(constituency.number);
      if (seenConstituencies.has(number)) {
        throw responseError("Der Bundestag-Wahlkreisdatensatz enthält eine Wahlkreisnummer mehrfach.");
      }
      seenConstituencies.add(number);
      const name = jsonString(constituency.name, {
        field: "Wahlkreisname",
        maxLength: 220
      });
      const constituencyPostalCodes = postalCodesFromConstituency(constituency);
      if (!Array.isArray(constituency.mdbs) || constituency.mdbs.length > 100) {
        throw responseError("Der Bundestag-Wahlkreisdatensatz enthält ungültige Wahlkreisabgeordnete.");
      }
      const metadata = Object.freeze({
        constituency: `Wahlkreis ${number}: ${name}`,
        constituencyNumber: number,
        constituencyName: name,
        constituencyFederalState,
        constituencyPostalCodes,
        postalCodes: constituencyPostalCodes,
        postalCodeCoverage: constituencyPostalCodes.length ? "complete" : "not_provided",
        constituencySourceUrl: constituencySourceUrl(number)
      });
      for (const mdb of constituency.mdbs) {
        recordPlacement(mdb, metadata);
      }
    }
  }

  if (placements.size !== members.length) {
    const missingIds = members
      .filter((member) => !placements.has(member.id))
      .map((member) => member.id)
      .join(", ");
    throw responseError(
      `Der Bundestag-Wahlkreisdatensatz enthält nicht alle Ausschussmitglieder (${missingIds}).`
    );
  }

  return Object.freeze(members.map((member) => placements.get(member.id)));
}

function boundedPositiveInteger(value, { fallback, maximum }) {
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

async function responseBodyWithinLimit(response, maxResponseBytes) {
  const declaredLength = Number.parseInt(response.headers?.get?.("content-length") || "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw responseError("Die Bundestag-Antwort überschreitet das zulässige Größenlimit.", {
      code: "bundestag_health_committee_response_too_large"
    });
  }

  if (!response.body?.getReader) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxResponseBytes) {
      throw responseError("Die Bundestag-Antwort überschreitet das zulässige Größenlimit.", {
        code: "bundestag_health_committee_response_too_large"
      });
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxResponseBytes) {
        await reader.cancel();
        throw responseError("Die Bundestag-Antwort überschreitet das zulässige Größenlimit.", {
          code: "bundestag_health_committee_response_too_large"
        });
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    return html;
  } catch (error) {
    if (error instanceof BundestagHealthCommitteeError) throw error;
    throw responseError("Die Bundestag-Antwort ist kein gültiger UTF-8-Text.", {
      code: "bundestag_health_committee_invalid_encoding",
      cause: error
    });
  } finally {
    reader.releaseLock();
  }
}

function assertOfficialResponse(response, expectedUrl, expectedContentType) {
  if (!response || typeof response !== "object") {
    throw responseError("Der Bundestag-Abruf lieferte keine gültige HTTP-Antwort.");
  }
  if (!response.ok) {
    throw responseError(`Der Bundestag-Abruf ist mit HTTP ${response.status || 502} fehlgeschlagen.`, {
      code: "bundestag_health_committee_upstream_error"
    });
  }
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  // Der feste Bundestag-AJAX-Endpunkt liefert gelegentlich keinen
  // Content-Type-Header. Wenn er gesetzt ist, muss er zum festen Ziel passen.
  if (
    contentType
    && (
      expectedContentType === "html"
        ? !/^text\/html(?:\s*;|$)/u.test(contentType)
        : !/^(?:application\/json|text\/json)(?:\s*;|$)/u.test(contentType)
    )
  ) {
    throw responseError(
      expectedContentType === "html"
        ? "Der Bundestag-Abruf lieferte keinen HTML-Inhalt."
        : "Der Bundestag-Abruf lieferte keinen JSON-Inhalt."
    );
  }
  if (response.url) {
    let responseUrl;
    try {
      responseUrl = new URL(response.url);
    } catch {
      throw responseError("Der Bundestag-Abruf meldete eine ungültige Zieladresse.");
    }
    if (
      responseUrl.protocol !== "https:"
      || responseUrl.hostname !== BUNDESTAG_HOSTNAME
      || responseUrl.href !== expectedUrl
    ) {
      throw responseError("Der Bundestag-Abruf wurde auf eine nicht erlaubte Zieladresse umgeleitet.");
    }
  }
}

function enrichedPayload(payload, constituencyMetadata) {
  if (constituencyMetadata.length !== payload.members.length) {
    throw responseError("Die Anzahl der Bundestag-Wahlkreise stimmt nicht mit der Mitgliederliste überein.");
  }
  const members = payload.members.map((member, index) => {
    const constituency = constituencyMetadata[index];
    return Object.freeze({
      ...member,
      ...publicPortraitMetadataForMember(member),
      ...constituency,
      representativePostalCode: constituency.postalCodes[0] || "",
      mapPostalCode: constituency.postalCodes[0] || ""
    });
  });
  return Object.freeze({
    ...payload,
    members: Object.freeze(members)
  });
}

function stalePayload(cachedPayload) {
  return Object.freeze({
    ...cachedPayload,
    stale: true
  });
}

export function createBundestagHealthCommitteeDirectory({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = BUNDESTAG_HEALTH_COMMITTEE_TIMEOUT_MS,
  cacheTtlMs = BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS,
  staleTtlMs = BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS,
  maxResponseBytes = BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Für den Bundestag-Abruf ist eine Fetch-Funktion erforderlich.");
  }
  if (typeof now !== "function") {
    throw new TypeError("Für den Bundestag-Abruf ist eine Zeitfunktion erforderlich.");
  }

  const effectiveTimeoutMs = boundedPositiveInteger(timeoutMs, {
    fallback: BUNDESTAG_HEALTH_COMMITTEE_TIMEOUT_MS,
    maximum: BUNDESTAG_HEALTH_COMMITTEE_TIMEOUT_MS
  });
  const effectiveCacheTtlMs = boundedPositiveInteger(cacheTtlMs, {
    fallback: BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS,
    maximum: BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS
  });
  const effectiveStaleTtlMs = Math.max(
    effectiveCacheTtlMs,
    boundedPositiveInteger(staleTtlMs, {
      fallback: BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS,
      maximum: BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS
    })
  );
  const effectiveMaxResponseBytes = boundedPositiveInteger(maxResponseBytes, {
    fallback: BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES,
    maximum: BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES
  });
  let cached = null;
  let inFlight = null;

  async function fetchCurrentPayload() {
    const controller = new AbortController();
    let timeoutHandle;
    let timedOut = false;
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        const timeoutError = responseError("Der Bundestag-Abruf hat das Zeitlimit überschritten.", {
          code: "bundestag_health_committee_timeout"
        });
        reject(timeoutError);
        controller.abort(timeoutError);
      }, effectiveTimeoutMs);
    });

    async function fetchOfficialText(url, expectedContentType) {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: expectedContentType === "html"
            ? "text/html; charset=utf-8"
            : "application/json; charset=utf-8"
        },
        redirect: "error",
        signal: controller.signal
      });
      assertOfficialResponse(response, url, expectedContentType);
      return responseBodyWithinLimit(response, effectiveMaxResponseBytes);
    }

    async function fetchAndEnrich() {
      // Beide Ziele sind fest konfiguriert; maximal zwei gleichzeitige
      // Bundestag-Abrufe, ohne nutzergesteuerte URL oder rekursive Folgeabrufe.
      const [html, constituencyJson] = await Promise.all([
        fetchOfficialText(BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL, "html"),
        fetchOfficialText(BUNDESTAG_CONSTITUENCY_DATA_URL, "json")
      ]);
      const payload = parseBundestagHealthCommitteeHtml(html, {
        fetchedAt: new Date(now())
      });
      const constituencyMetadata = parseBundestagConstituencyDataJson(
        constituencyJson,
        { members: payload.members }
      );
      return enrichedPayload(payload, constituencyMetadata);
    }

    try {
      return await Promise.race([
        fetchAndEnrich(),
        timeout
      ]);
    } catch (error) {
      if (timedOut) {
        throw responseError("Der Bundestag-Abruf hat das Zeitlimit überschritten.", {
          code: "bundestag_health_committee_timeout",
          cause: error
        });
      }
      if (!controller.signal.aborted) controller.abort(error);
      if (error instanceof BundestagHealthCommitteeError) throw error;
      throw responseError("Der Bundestag-Abruf ist fehlgeschlagen.", {
        code: "bundestag_health_committee_upstream_error",
        cause: error
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function refresh() {
    try {
      const payload = await fetchCurrentPayload();
      const cachedAt = now();
      if (!Number.isFinite(cachedAt)) {
        throw responseError("Die Cache-Zeit für die Bundestag-Daten ist ungültig.");
      }
      cached = {
        payload,
        expiresAt: cachedAt + effectiveCacheTtlMs,
        staleUntil: cachedAt + effectiveStaleTtlMs
      };
      return payload;
    } catch (error) {
      const fallbackTime = now();
      if (cached && Number.isFinite(fallbackTime) && fallbackTime <= cached.staleUntil) {
        return stalePayload(cached.payload);
      }
      throw error;
    }
  }

  return Object.freeze({
    async load() {
      const currentTime = now();
      if (!Number.isFinite(currentTime)) {
        throw responseError("Die Cache-Zeit für die Bundestag-Daten ist ungültig.");
      }
      if (cached && currentTime < cached.expiresAt) return cached.payload;
      if (!inFlight) {
        inFlight = refresh().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    }
  });
}
