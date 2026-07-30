import assert from "node:assert/strict";
import {
  BUNDESTAG_CONSTITUENCY_DATA_URL,
  BUNDESTAG_CONSTITUENCY_SOURCE_URL,
  BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS,
  BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES,
  BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL,
  BUNDESTAG_HEALTH_COMMITTEE_STALE_TTL_MS,
  BUNDESTAG_IMAGE_DATABASE_USAGE_TERMS_URL,
  BUNDESTAG_IMAGE_USAGE_TERMS_URL,
  BundestagHealthCommitteeError,
  createBundestagHealthCommitteeDirectory,
  parseBundestagConstituencyDataJson,
  parseBundestagHealthCommitteeHtml,
  publicPortraitMetadataForMember
} from "../api/bundestag-health-committee.mjs";

function memberCard({
  id,
  surname,
  givenNames,
  party,
  membership = "Ordentliche Mitglieder",
  role = "",
  profileUrl = `https://www.bundestag.de/abgeordnete/biografien/B/beispiel_${id}-${id}`,
  imageUrl = `https://www.bundestag.de/resource/image/${id}/3x4/340/454/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/portrait_${id}.jpg`,
  imageAttribution = `${givenNames} ${surname} / Testfotografie`
}) {
  return `
    <div class="col-xs-4 bt-slide">
      <div class="bt-slide-content">
        <a class="bt-legacy-teaser" data-id="${id}" href="${profileUrl}">
          <p class="bt-teaser-person-mitgliedschaft">${membership}</p>
          <div class="bt-bild-standard">
            <img data-img-md-retina="${imageUrl}" alt="${givenNames} ${surname}">
            <div class="bt-bild-info-dialogue">
              <p>${givenNames} ${surname}</p>
              <p>&copy;&nbsp;${imageAttribution}</p>
            </div>
          </div>
          <h3 class="bt-person__lastname">${surname}, ${givenNames}</h3>
          <p class="bt-person-fraktion">${party}</p>
          ${role ? `<p class="bt-person-funktion">${role}</p>` : ""}
        </a>
      </div>
    </div>`;
}

const ordinaryCards = [
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
  })
];

function committeeHtml({
  count = 3,
  cards = [
    ...ordinaryCards,
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

function constituencyMdb({
  id,
  name,
  party,
  first,
  link = `https://www.bundestag.de/de/abgeordnete/biografien/B/beispiel_${id}-${id}`
}) {
  return {
    name,
    party,
    first,
    picture: `https://www.bundestag.de/resource/image/${id}/portrait.jpg`,
    link
  };
}

function constituencyData({
  states = [
    {
      key: "RP",
      name: "Rheinland-Pfalz",
      mdbs: [
        constituencyMdb({
          id: "9000003",
          name: "Probe, Cem",
          party: "Bündnis 90/Die Grünen",
          first: false
        })
      ],
      constituencies: [
        {
          name: "Montabaur",
          number: "203",
          mdbs: [
            constituencyMdb({
              id: "9000001",
              name: "Beispiel, Dr. Ada",
              party: "SPD",
              first: true
            })
          ],
          counties: [
            {
              headline: "Westerwaldkreis",
              zipCodes: ["57627", "56422"],
              communities: [
                {
                  name: "Nassau",
                  zipCodes: ["56377", "56422"]
                }
              ]
            }
          ]
        },
        {
          name: "Teststadt",
          number: "204",
          mdbs: [
            constituencyMdb({
              id: "9000002",
              name: "Muster, Ben",
              party: "CDU/CSU",
              first: false
            })
          ],
          counties: [
            {
              headline: "Teststadt, Stadt",
              zipCodes: ["01067", "01069"],
              communities: []
            }
          ]
        }
      ]
    }
  ]
} = {}) {
  return JSON.stringify({
    settings: {},
    name: "Bundesweit",
    federalStates: states
  });
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

function jsonResponse(json, extraHeaders = {}) {
  return new Response(json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...extraHeaders
    }
  });
}

const syntheticHtml = committeeHtml();
const syntheticConstituencies = constituencyData();
const parsed = parseBundestagHealthCommitteeHtml(syntheticHtml, {
  fetchedAt: "2026-07-30T08:00:00.000Z"
});
assert.equal(parsed.committee, "Ausschuss für Gesundheit");
assert.equal(parsed.parliamentaryTerm, "21. Wahlperiode");
assert.equal(parsed.memberCount, 3);
assert.equal(parsed.members.length, 3);
assert.equal(parsed.members[0].name, "Dr. Ada Beispiel");
assert.equal(
  parsed.members[0].imageUrl,
  "https://www.bundestag.de/resource/image/9000001/3x4/340/454/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/portrait_9000001.jpg"
);
assert.equal(parsed.members[0].imageSourceUrl, parsed.members[0].profileUrl);
assert.equal(parsed.members[0].imageAttribution, "© Dr. Ada Beispiel / Testfotografie");
assert.equal(parsed.members[0].imageRightsStatus, "review_required");
assert.equal(parsed.members[0].imageUsageTermsUrl, BUNDESTAG_IMAGE_USAGE_TERMS_URL);
const commonsPortrait = publicPortraitMetadataForMember({
  profileUrl: parsed.members[0].profileUrl,
  ...parsed.members[0],
  id: "1045922"
});
assert.equal(commonsPortrait.imageProvider, "Wikimedia Commons");
assert.equal(commonsPortrait.imageRightsStatus, "approved");
assert.equal(commonsPortrait.imageLicense, "CC BY 4.0");
assert.match(commonsPortrait.imageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:Redirect\/file\//u);
assert.match(commonsPortrait.imageSourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
const bundestagDatabasePortrait = publicPortraitMetadataForMember({
  ...parsed.members[0],
  id: "1045200"
});
assert.equal(
  bundestagDatabasePortrait.imageProvider,
  "Bilddatenbank des Deutschen Bundestages"
);
assert.equal(bundestagDatabasePortrait.imageRightsStatus, "approved");
assert.equal(
  bundestagDatabasePortrait.imageLicense,
  "Private und kommerzielle nicht-werbliche Nutzung"
);
assert.match(
  bundestagDatabasePortrait.imageUrl,
  /^https:\/\/bilddatenbank\.bundestag\.de\/fotos\/file[a-z0-9]+\.jpg$/u
);
assert.equal(
  bundestagDatabasePortrait.imageSourceUrl,
  "https://bilddatenbank.bundestag.de/site/picture-detail?id=5013430"
);
assert.equal(
  bundestagDatabasePortrait.imageUsageTermsUrl,
  BUNDESTAG_IMAGE_DATABASE_USAGE_TERMS_URL
);
const officialPortrait = publicPortraitMetadataForMember(parsed.members[0]);
assert.equal(officialPortrait.imageProvider, "Deutscher Bundestag");
assert.equal(officialPortrait.imageRightsStatus, "review_required");
assert.equal(parsed.members[0].constituency, "");
assert.equal(parsed.members[0].constituencyNumber, "");
assert.equal(parsed.members[0].postalCodeCoverage, "not_applicable");
assert.deepEqual(parsed.members[0].postalCodes, []);
assert.equal(parsed.members[1].name, "Ben Muster");
assert.equal(parsed.members[1].role, "Ordentliches Mitglied");
assert.equal(parsed.members[2].role, "Sprecher");
assert.equal(parsed.members.some((member) => member.id === "9000004"), false);
assert.equal(parsed.fetchedAt, "2026-07-30T08:00:00.000Z");
assert.equal(parsed.stale, false);
assert.equal(Object.isFrozen(parsed), true);
assert.equal(Object.isFrozen(parsed.members), true);

const constituencyMetadata = parseBundestagConstituencyDataJson(
  syntheticConstituencies,
  { members: parsed.members }
);
assert.equal(constituencyMetadata.length, 3);
assert.deepEqual(constituencyMetadata[0], {
  constituency: "Wahlkreis 203: Montabaur",
  constituencyNumber: "203",
  constituencyName: "Montabaur",
  constituencyFederalState: "Rheinland-Pfalz",
  constituencyPostalCodes: ["56377", "56422", "57627"],
  postalCodes: ["56377", "56422", "57627"],
  postalCodeCoverage: "complete",
  constituencySourceUrl: `${BUNDESTAG_CONSTITUENCY_SOURCE_URL}?wknr=203`,
  mandateType: "Wahlkreismandat"
});
assert.deepEqual(
  constituencyMetadata[1].constituencyPostalCodes,
  ["01067", "01069"],
  "Stadtwahlkreis-PLZ auf county-Ebene müssen ebenfalls übernommen werden."
);
assert.equal(constituencyMetadata[1].mandateType, "Landesliste");
assert.equal(constituencyMetadata[2].constituency, "");
assert.equal(constituencyMetadata[2].constituencyFederalState, "Rheinland-Pfalz");
assert.equal(constituencyMetadata[2].mandateType, "Landesliste");
assert.equal(constituencyMetadata[2].postalCodeCoverage, "not_applicable");
assert.deepEqual(constituencyMetadata[2].constituencyPostalCodes, []);
assert.equal(Object.isFrozen(constituencyMetadata), true);
assert.equal(Object.isFrozen(constituencyMetadata[0]), true);
assert.equal(Object.isFrozen(constituencyMetadata[0].constituencyPostalCodes), true);
assert.equal(constituencyMetadata[0].constituencyPostalCodes, constituencyMetadata[0].postalCodes);

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
  () => parseBundestagHealthCommitteeHtml(committeeHtml({
    count: 1,
    cards: [memberCard({
      id: "9000013",
      surname: "Bild",
      givenNames: "Hanna",
      party: "SPD",
      imageUrl: "https://example.invalid/resource/image/9000013/3x4/340/454/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/portrait.jpg"
    })]
  })),
  /Porträt-URL.*erlaubten Format/iu
);
assert.throws(
  () => parseBundestagHealthCommitteeHtml(committeeHtml({
    count: 1,
    cards: [memberCard({
      id: "9000014",
      surname: "Quelle",
      givenNames: "Ida",
      party: "Die Linke",
      imageAttribution: ""
    })]
  })),
  /keine gültige Bildquelle/iu
);
assert.throws(
  () => parseBundestagHealthCommitteeHtml("x".repeat(
    BUNDESTAG_HEALTH_COMMITTEE_MAX_RESPONSE_BYTES + 1
  )),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_response_too_large"
);

const missingMemberData = JSON.parse(syntheticConstituencies);
missingMemberData.federalStates[0].mdbs = [];
assert.throws(
  () => parseBundestagConstituencyDataJson(JSON.stringify(missingMemberData), {
    members: parsed.members
  }),
  /nicht alle Ausschussmitglieder/iu
);

const duplicateMemberData = JSON.parse(syntheticConstituencies);
duplicateMemberData.federalStates[0].mdbs.push(
  constituencyMdb({
    id: "9000001",
    name: "Beispiel, Dr. Ada",
    party: "SPD",
    first: false
  })
);
assert.throws(
  () => parseBundestagConstituencyDataJson(JSON.stringify(duplicateMemberData), {
    members: parsed.members
  }),
  /Ausschussmitglied mehrfach/iu
);

const invalidPostalCodeData = JSON.parse(syntheticConstituencies);
invalidPostalCodeData.federalStates[0].constituencies[0].counties[0]
  .communities[0].zipCodes.push("ABCDE");
assert.throws(
  () => parseBundestagConstituencyDataJson(JSON.stringify(invalidPostalCodeData), {
    members: parsed.members
  }),
  /ungültige Postleitzahl/iu
);

const externalLinkData = JSON.parse(syntheticConstituencies);
externalLinkData.federalStates[0].constituencies[0].mdbs[0].link =
  "https://example.invalid/de/abgeordnete/biografien/B/beispiel-9000001";
assert.throws(
  () => parseBundestagConstituencyDataJson(JSON.stringify(externalLinkData), {
    members: parsed.members
  }),
  /nicht erlaubte Profil-URL/iu
);
assert.throws(
  () => parseBundestagConstituencyDataJson("{", { members: parsed.members }),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_invalid_json"
);

let currentTime = Date.parse("2026-07-30T08:00:00.000Z");
const fetchCalls = new Map();
let releaseInitialFetch;
const initialFetchGate = new Promise((resolve) => {
  releaseInitialFetch = resolve;
});
const directory = createBundestagHealthCommitteeDirectory({
  now: () => currentTime,
  fetchImpl: async (url, options) => {
    fetchCalls.set(url, (fetchCalls.get(url) || 0) + 1);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    if (url === BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL) {
      assert.equal(options.headers.accept, "text/html; charset=utf-8");
      await initialFetchGate;
      return htmlResponse(syntheticHtml);
    }
    assert.equal(url, BUNDESTAG_CONSTITUENCY_DATA_URL);
    assert.equal(options.headers.accept, "application/json; charset=utf-8");
    return jsonResponse(syntheticConstituencies);
  }
});
const firstLoad = directory.load();
const parallelLoad = directory.load();
assert.equal(fetchCalls.get(BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL), 1);
assert.equal(fetchCalls.get(BUNDESTAG_CONSTITUENCY_DATA_URL), 1);
releaseInitialFetch();
const [firstPayload, parallelPayload] = await Promise.all([firstLoad, parallelLoad]);
assert.equal(firstPayload, parallelPayload);
assert.equal(firstPayload.stale, false);
assert.equal(firstPayload.members[0].constituency, "Wahlkreis 203: Montabaur");
assert.deepEqual(firstPayload.members[0].postalCodes, ["56377", "56422", "57627"]);
assert.equal(firstPayload.members[1].constituencyName, "Teststadt");
assert.equal(firstPayload.members[2].postalCodeCoverage, "not_applicable");
assert.equal(Object.isFrozen(firstPayload.members[0]), true);
assert.equal(await directory.load(), firstPayload);
assert.equal(fetchCalls.get(BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL), 1);
assert.equal(fetchCalls.get(BUNDESTAG_CONSTITUENCY_DATA_URL), 1);

currentTime += BUNDESTAG_HEALTH_COMMITTEE_CACHE_TTL_MS - 1;
assert.equal(await directory.load(), firstPayload);
assert.equal(fetchCalls.get(BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL), 1);

currentTime += 2;
let staleListFetchCalls = 0;
const staleDirectory = createBundestagHealthCommitteeDirectory({
  now: () => currentTime,
  cacheTtlMs: 25,
  staleTtlMs: 50,
  fetchImpl: async (url) => {
    if (url === BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL) {
      staleListFetchCalls += 1;
      if (staleListFetchCalls === 1) return htmlResponse(syntheticHtml);
      throw new Error("synthetischer Upstream-Ausfall");
    }
    return jsonResponse(syntheticConstituencies);
  }
});
const staleSeed = await staleDirectory.load();
currentTime += 26;
const stalePayload = await staleDirectory.load();
assert.equal(staleListFetchCalls, 2);
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
  fetchImpl: async (url) => (
    url === BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL
      ? htmlResponse("x".repeat(65))
      : jsonResponse("{}")
  )
});
await assert.rejects(
  tooLargeDirectory.load(),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_response_too_large"
);

const timeoutSignals = [];
const timeoutDirectory = createBundestagHealthCommitteeDirectory({
  timeoutMs: 10,
  fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    timeoutSignals.push(options.signal);
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  })
});
await assert.rejects(
  timeoutDirectory.load(),
  (error) => error instanceof BundestagHealthCommitteeError
    && error.code === "bundestag_health_committee_timeout"
);
assert.equal(timeoutSignals.length, 2);
assert.equal(timeoutSignals.every((signal) => signal.aborted), true);

let peerAbortSignal;
const peerAbortDirectory = createBundestagHealthCommitteeDirectory({
  fetchImpl: (url, options) => {
    if (url === BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL) {
      return Promise.reject(new Error("synthetischer Sofortfehler"));
    }
    peerAbortSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  }
});
await assert.rejects(peerAbortDirectory.load(), /Bundestag-Abruf ist fehlgeschlagen/iu);
assert.equal(peerAbortSignal.aborted, true);

const wrongJsonContentTypeDirectory = createBundestagHealthCommitteeDirectory({
  fetchImpl: async (url) => (
    url === BUNDESTAG_HEALTH_COMMITTEE_MEMBERS_URL
      ? htmlResponse(syntheticHtml)
      : new Response(syntheticConstituencies, {
        status: 200,
        headers: { "content-type": "text/html" }
      })
  )
});
await assert.rejects(wrongJsonContentTypeDirectory.load(), /keinen JSON-Inhalt/iu);

console.log(
  "Bundestag-Gesundheitsausschuss OK: Ausschuss-, Porträt-, Bildquellen- und Wahlkreis-Parsing, vollständige Kreis-/Gemeinde-PLZ, feste offizielle Ziele, maximal zwei Parallelabrufe, Validierung, Größenlimit, Timeout, Promise-Deduplizierung, 6h-Cache und begrenzter Stale-Fallback."
);
