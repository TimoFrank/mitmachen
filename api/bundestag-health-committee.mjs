const BUNDESTAG_HOSTNAME = "www.bundestag.de";
const ORDINARY_MEMBERSHIP = "Ordentliche Mitglieder";
const DEFAULT_ROLE = "Ordentliches Mitglied";

export const BUNDESTAG_HEALTH_COMMITTEE_SOURCE_URL =
  "https://www.bundestag.de/ausschuesse/gesundheit/";
export const BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL =
  "https://www.bundestag.de/ajax/member/de/ausschuesse/gesundheit/1065646-1065646?limit=100";
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
const NAMED_HTML_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
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
  const elementPattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, "giu");
  for (const match of String(html || "").matchAll(elementPattern)) {
    const openingTag = match[0].match(new RegExp(`^<${tagName}\\b[^>]*>`, "iu"))?.[0] || "";
    if (!hasClassToken(openingTag, classToken)) continue;
    return match[0]
      .replace(new RegExp(`^<${tagName}\\b[^>]*>`, "iu"), "")
      .replace(new RegExp(`<\\/${tagName}\\s*>$`, "iu"), "");
  }
  return "";
}

function slideBlocks(html) {
  const starts = [];
  for (const match of String(html || "").matchAll(/<div\b[^>]*>/giu)) {
    if (hasClassToken(match[0], "bt-slide")) starts.push(match.index);
  }
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
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

  return Object.freeze({
    id: memberId,
    name,
    party,
    role,
    profileUrl
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
    fetchedAt: isoTimestamp(fetchedAt),
    memberCount: members.length,
    stale: false,
    members: Object.freeze(members)
  });
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

function assertOfficialResponse(response) {
  if (!response || typeof response !== "object") {
    throw responseError("Der Bundestag-Abruf lieferte keine gültige HTTP-Antwort.");
  }
  if (!response.ok) {
    throw responseError(`Der Bundestag-Abruf ist mit HTTP ${response.status || 502} fehlgeschlagen.`, {
      code: "bundestag_health_committee_upstream_error"
    });
  }
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  // Der feste Bundestag-AJAX-Endpunkt liefert derzeit trotz HTML und
  // X-Content-Type-Options gelegentlich keinen Content-Type-Header.
  if (contentType && !/^text\/html(?:\s*;|$)/u.test(contentType)) {
    throw responseError("Der Bundestag-Abruf lieferte keinen HTML-Inhalt.");
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
      || responseUrl.href !== BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL
    ) {
      throw responseError("Der Bundestag-Abruf wurde auf eine nicht erlaubte Zieladresse umgeleitet.");
    }
  }
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

    try {
      const response = await Promise.race([
        Promise.resolve(fetchImpl(BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL, {
          method: "GET",
          headers: {
            accept: "text/html; charset=utf-8"
          },
          redirect: "error",
          signal: controller.signal
        })),
        timeout
      ]);
      assertOfficialResponse(response);
      const html = await responseBodyWithinLimit(response, effectiveMaxResponseBytes);
      return parseBundestagHealthCommitteeHtml(html, {
        fetchedAt: new Date(now())
      });
    } catch (error) {
      if (timedOut) {
        throw responseError("Der Bundestag-Abruf hat das Zeitlimit überschritten.", {
          code: "bundestag_health_committee_timeout",
          cause: error
        });
      }
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
