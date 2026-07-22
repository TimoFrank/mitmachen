export const CONTACT_DUPLICATE_LOCK_KEY = "versorgungs-kompass:duplicate-guard:contacts:v1";
export const HOSPITATION_DUPLICATE_LOCK_KEY = "versorgungs-kompass:duplicate-guard:hospitations:v1";

const PERSON_HONORIFIC_TOKENS = new Set([
  "dipl", "diplom", "doz", "doktor", "dr", "ing", "med", "pd", "priv",
  "privatdozent", "prof", "professor"
]);

const ORGANIZATION_GENERIC_TOKENS = new Set([
  "ag", "apotheke", "apotheken", "arztpraxis", "eg", "ev", "gemeinschaftspraxis",
  "gbr", "gmbh", "hausarzt", "hausarztpraxis", "kg", "mbh", "mit", "mvz", "ohg",
  "praxis", "ug", "und"
]);

export function normalizeDuplicateIdentityText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .replace(/ß/gu, "ss")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/&/gu, " und ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function canonicalDuplicatePersonName(value) {
  return normalizeDuplicateIdentityText(value)
    .split(" ")
    .filter((token) => token && !PERSON_HONORIFIC_TOKENS.has(token))
    .join(" ");
}

function organizationIdentityTokens(value) {
  return [...new Set(normalizeDuplicateIdentityText(value)
    .split(" ")
    .filter((token) => token && !PERSON_HONORIFIC_TOKENS.has(token) && !ORGANIZATION_GENERIC_TOKENS.has(token)))]
    .sort();
}

export function canonicalDuplicateOrganizationName(value) {
  return organizationIdentityTokens(value).join(" ");
}

function organizationKind(value) {
  const tokens = new Set(normalizeDuplicateIdentityText(value).split(" ").filter(Boolean));
  if (["apotheke", "apotheken"].some((token) => tokens.has(token))) return "pharmacy";
  if (["arztpraxis", "gemeinschaftspraxis", "hausarzt", "hausarztpraxis", "mvz", "praxis"].some((token) => tokens.has(token))) return "practice";
  if (["klinik", "klinikum", "krankenhaus"].some((token) => tokens.has(token))) return "hospital";
  if (["krankenkasse", "versicherung"].some((token) => tokens.has(token))) return "insurer";
  if (["pflegeheim", "pflegezentrum", "seniorenheim"].some((token) => tokens.has(token))) return "care";
  return "";
}

function organizationNamesLikelyVariant(left, right) {
  const leftFull = normalizeDuplicateIdentityText(left);
  const rightFull = normalizeDuplicateIdentityText(right);
  if (!leftFull || !rightFull) return false;
  if (leftFull === rightFull) return true;
  const leftKind = organizationKind(left);
  const rightKind = organizationKind(right);
  if (leftKind && rightKind && leftKind !== rightKind) return false;
  const leftTokens = organizationIdentityTokens(left);
  const rightTokens = organizationIdentityTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  if (canonicalDuplicateOrganizationName(left) === canonicalDuplicateOrganizationName(right)) return true;
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token));
  return shared.length === Math.min(leftTokens.length, rightTokens.length)
    && shared.some((token) => token.length >= 5);
}

function valueFrom(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function organizationId(row) {
  return String(valueFrom(row, "organization_id", "organizationId") || "").trim();
}

function organizationName(row) {
  return valueFrom(
    row,
    "resolved_organization_name",
    "resolvedOrganizationName",
    "organization_name",
    "organizationName",
    "organization"
  );
}

function contactCity(row) {
  return valueFrom(row, "city", "resolved_organization_city", "resolvedOrganizationCity", "organization_city");
}

function contactPostalCode(row) {
  return valueFrom(row, "postal_code", "postalCode", "resolved_organization_postal_code", "resolvedOrganizationPostalCode");
}

function sameKnownValue(left, right, normalize = normalizeDuplicateIdentityText) {
  const leftValue = normalize(left);
  const rightValue = normalize(right);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function normalizedEmail(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("de-DE");
  return normalized.includes("@") ? normalized : "";
}

function normalizedPhone(value) {
  let normalized = String(value || "").replace(/\D+/gu, "");
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  return normalized.length >= 6 ? normalized : "";
}

function normalizedLinkedIn(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/^https?:\/\//u, "")
    .replace(/^www\./u, "")
    .split(/[?#]/u, 1)[0]
    .replace(/\/+$/u, "");
}

function organizationsMatch(left, right) {
  const leftId = organizationId(left);
  const rightId = organizationId(right);
  if (leftId && rightId && leftId === rightId) return true;
  return organizationNamesLikelyVariant(organizationName(left), organizationName(right));
}

export function organizationsAreSameCanonicalIdentity(left, right) {
  return organizationsMatch(left, right);
}

function organizationsConflict(left, right) {
  const leftId = organizationId(left);
  const rightId = organizationId(right);
  const leftName = organizationName(left);
  const rightName = organizationName(right);
  if (organizationsMatch(left, right)) return false;
  return Boolean((leftId && rightId) || (leftName && rightName));
}

function locationsMatch(left, right) {
  return sameKnownValue(contactCity(left), contactCity(right))
    || sameKnownValue(contactPostalCode(left), contactPostalCode(right), (value) => String(value || "").replace(/\s+/gu, "").toLocaleLowerCase("de-DE"));
}

function contactChannelsMatch(left, right) {
  return sameKnownValue(left?.email, right?.email, normalizedEmail)
    || sameKnownValue(left?.phone, right?.phone, normalizedPhone)
    || sameKnownValue(left?.linkedin, right?.linkedin, normalizedLinkedIn);
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (!left || !right || Math.abs(left.length - right.length) > 1) return false;
  let longer = left;
  let shorter = right;
  if (shorter.length > longer.length) [longer, shorter] = [shorter, longer];
  let differences = 0;
  for (let longIndex = 0, shortIndex = 0; longIndex < longer.length; longIndex += 1) {
    if (longer[longIndex] === shorter[shortIndex]) {
      shortIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (longer.length === shorter.length) shortIndex += 1;
  }
  return true;
}

export function contactsAreDefiniteDuplicates(left, right) {
  const leftPerson = canonicalDuplicatePersonName(left?.name);
  const rightPerson = canonicalDuplicatePersonName(right?.name);
  if (!leftPerson || leftPerson !== rightPerson) return false;
  return organizationsMatch(left, right)
    || contactChannelsMatch(left, right)
    || (!organizationsConflict(left, right) && locationsMatch(left, right));
}

export function contactsArePotentialDuplicates(left, right) {
  const leftPerson = canonicalDuplicatePersonName(left?.name);
  const rightPerson = canonicalDuplicatePersonName(right?.name);
  if (!leftPerson || !rightPerson) return false;
  if (leftPerson === rightPerson) {
    return !contactsAreDefiniteDuplicates(left, right)
      && contactsAreSameCanonicalIdentity(left, right);
  }
  if (!organizationsMatch(left, right) || !locationsMatch(left, right)) return false;
  return editDistanceAtMostOne(leftPerson, rightPerson);
}

export function contactsAreSameCanonicalIdentity(left, right) {
  const leftId = String(valueFrom(left, "id", "contact_id", "contactId") || "").trim();
  const rightId = String(valueFrom(right, "id", "contact_id", "contactId") || "").trim();
  if (leftId && rightId && leftId === rightId) return true;
  if (contactsAreDefiniteDuplicates(left, right)) return true;
  const leftPerson = canonicalDuplicatePersonName(left?.name);
  const rightPerson = canonicalDuplicatePersonName(right?.name);
  if (!leftPerson || leftPerson !== rightPerson) return false;
  if (organizationsConflict(left, right)) return false;
  const leftCity = normalizeDuplicateIdentityText(contactCity(left));
  const rightCity = normalizeDuplicateIdentityText(contactCity(right));
  if (leftCity && rightCity && leftCity !== rightCity) return false;
  const leftPostalCode = String(contactPostalCode(left) || "").replace(/\s+/gu, "").toLocaleLowerCase("de-DE");
  const rightPostalCode = String(contactPostalCode(right) || "").replace(/\s+/gu, "").toLocaleLowerCase("de-DE");
  if (!leftCity && !rightCity && leftPostalCode && rightPostalCode && leftPostalCode !== rightPostalCode) return false;
  return true;
}
