import assert from "node:assert/strict";
import {
  BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS,
  BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES,
  BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL,
  BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS,
  BundestagHealthCommitteeError,
  createBundestagHealthCommitteeDirectory,
  parseBundestagHealthCommitteeHtml
} from "../api/bundestag-health-committee.mjs";

function memberCard({
  id,
  surname,
  givenNames,
  party,
  membership = "Ordentliche Mitglieder",
  role = "",
  profileUrl = `https://www.bundestag.de/abgeordnete/biografien/B/beispiel_${id}-${id}`
}) {
  return `
    <div class="col-xs-4 bt-slide">
      <div class="bt-slide-content">
        <a class="bt-legacy-teaser" data-id="${id}" href="${profileUrl}">
          <p class="bt-teaser-person-mitgliedschaft">${membership}</p>
          <h3 class="bt-person__lastname">${surname}, ${givenNames}</h3>
          <p class="bt-person-fraktion">${party}</p>
          ${role ? `<p class="bt-person-funktion">${role}</p>` : ""}
        </a>
      </div>
    </div>`;
}

function committeeHtml({
  count = 3,
  cards = [
    memberCard({
      id: "9000001",
      surname: "Beispiel",
      givenNames: "Dr. Ada",
      party: "SPD",
      role: "Vorsitzende"
    }),
    memberCard({
      id: "9000002",
      surname: "Muster",
      givenNames: "Ben",
      party: "CDU/CSU"
    }),
    memberCard({
      id: "9000003",
      surname: "Probe",
      givenNames: "Cem",
      party: "Bündnis 90/Die Grünen",
      role: "<span>Sprecher</span><script>nicht übernehmen</script>"
    }),
    memberCard({
      id: "9000004",
      surname: "Vertretung",
      givenNames: "Dora",
      party: "Die Linke",
      membership: "Stellvertretende Mitglieder"
    })
  ]
} = {}) {
  return `
    <div class="meta-slider" data-hits="4" data-mmbrsCount="${count}"></div>
    ${cards.join("\n")}`;
}

function htmlResponse(html, extraHeaders = {}) {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      ...extraHeaders
    }
  });
}

const syntheticHtml = committeeHtml();
const parsed = parseBundestagHealthCommitteeHtml(syntheticHtml, {
  fetchedAt: "2026-07-30T08:00:00.000Z"
});
assert.equal(parsed.committee, "Ausschuss für Gesundheit");
assert.equal(parsed.parliamentaryTerm, "21. Wahlperiode");
assert.equal(parsed.memberCount, 3);
assert.equal(parsed.members.length, 3);
assert.equal(parsed.members[0].name, "Dr. Ada Beispiel");
assert.equal(parsed.members[1].name, "Ben Muster");
assert.equal(parsed.members[1].role, "Ordentliches Mitglied");
assert.equal(parsed.members[2].role, "Sprecher");
assert.equal(parsed.members.some((member) => member.id === "9000004"), false);
assert.equal(parsed.fetchedAt, "2026-07-30T08:00:00.000Z");
assert.equal(parsed.stale, false);
assert.equal(Object.isFrozen(parsed), true);
assert.equal(Object.isFrozen(parsed.members), true);

assert.throws(
  () => parseBundestagHealthCommitteeHtml(committeeHtml({ count: 4 })),
  /Mitgliederzähler.*stimmt nicht/iu
);
assert.throws(
  () => parseBundestagHealthCommitteeHtml(committeeHtml({
    count: 1,
    cards: [memberCard({
      id: "9000010",
      surname: "Unbekannt",
      givenNames: "Eli",
      party: "Nicht zugelassen"
    })]
  })),
  /unbekannte Fraktion/iu
);
assert.throws(
  () => parseBundestagHealthCommitteeHtml(committeeHtml({
    count: 1,
    cards: [memberCard({
      id: "9000011",
      surname: "Extern",
      givenNames: "Fina",
      party: "AfD",
      profileUrl: "https://example.invalid/abgeordnete/biografien/E/extern_fina-9000011"
    })]
  })),
  /Profil-URL.*erlaubten Format/iu
);
assert.throws(
  () => parseBundestagHealthCommitteeHtml(committeeHtml({
    count: 1,
    cards: [memberCard({
      id: "9000012",
      surname: "Abweichend",
      givenNames: "Gino",
      party: "Die Linke",
      profileUrl: "https://www.bundestag.de/abgeordnete/biografien/A/abweichend_gino-9000099"
    })]
  })),
  /Profil-URL.*erlaubten Format/iu
);
assert.throws(
  () => parseBundestagHealthCommitteeHtml("x".repeat(
    BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES + 1
  )),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_response_too_large"
);

let currentTime = Date.parse("2026-07-30T08:00:00.000Z");
let fetchCalls = 0;
let releaseInitialFetch;
const initialFetchGate = new Promise((resolve) => {
  releaseInitialFetch = resolve;
});
const directory = createBundestagHealthCommitteeDirectory({
  now: () => currentTime,
  fetchImpl: async (url, options) => {
    fetchCalls += 1;
    assert.equal(url, BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.accept, "text/html; charset=utf-8");
    assert.ok(options.signal instanceof AbortSignal);
    await initialFetchGate;
    return htmlResponse(syntheticHtml);
  }
});
const firstLoad = directory.load();
const parallelLoad = directory.load();
assert.equal(fetchCalls, 1, "Parallele Abrufe müssen dasselbe laufende Promise verwenden.");
releaseInitialFetch();
const [firstPayload, parallelPayload] = await Promise.all([firstLoad, parallelLoad]);
assert.equal(firstPayload, parallelPayload);
assert.equal(firstPayload.stale, false);
assert.equal(await directory.load(), firstPayload);
assert.equal(fetchCalls, 1, "Der erfolgreiche Abruf muss sechs Stunden gecacht werden.");

currentTime += BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS - 1;
assert.equal(await directory.load(), firstPayload);
assert.equal(fetchCalls, 1);

currentTime += 2;
let staleFetchCalls = 0;
const staleDirectory = createBundestagHealthCommitteeDirectory({
  now: () => currentTime,
  cacheTtlMs: 25,
  staleTtlMs: 50,
  fetchImpl: async () => {
    staleFetchCalls += 1;
    if (staleFetchCalls === 1) return htmlResponse(syntheticHtml);
    throw new Error("synthetischer Upstream-Ausfall");
  }
});
const staleSeed = await staleDirectory.load();
currentTime += 26;
const stalePayload = await staleDirectory.load();
assert.equal(staleFetchCalls, 2);
assert.equal(stalePayload.stale, true);
assert.equal(stalePayload.fetchedAt, staleSeed.fetchedAt);
assert.deepEqual(stalePayload.members, staleSeed.members);
currentTime += 25;
await assert.rejects(
  staleDirectory.load(),
  /synthetischer Upstream-Ausfall|Bundestag-Abruf ist fehlgeschlagen/iu,
  "Ein validierter Stand darf nach Ablauf des maximalen Stale-Fensters nicht weiter ausgeliefert werden."
);
assert.equal(BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS, 24 * 60 * 60 * 1000);

const tooLargeDirectory = createBundestagHealthCommitteeDirectory({
  maxResponseBytes: 64,
  fetchImpl: async () => htmlResponse("x".repeat(65))
});
await assert.rejects(
  tooLargeDirectory.load(),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_response_too_large"
);

let timeoutSignal;
const timeoutDirectory = createBundestagHealthCommitteeDirectory({
  timeoutMs: 10,
  fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    timeoutSignal = options.signal;
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  })
});
await assert.rejects(
  timeoutDirectory.load(),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_timeout"
);
assert.equal(timeoutSignal.aborted, true);

const wrongContentTypeDirectory = createBundestagHealthCommitteeDirectory({
  fetchImpl: async () => new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" }
  })
});
await assert.rejects(wrongContentTypeDirectory.load(), /keinen HTML-Inhalt/iu);

console.log(
  "Bundestag-Gesundheitsausschuss OK: synthetisches Parsing, Validierung, Größenlimit, Timeout, Promise-Deduplizierung, 6h-Cache und begrenzter Stale-Fallback."
);
