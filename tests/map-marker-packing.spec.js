import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const MARKER_STRESS_LOCATIONS = [
  { city: "Berlin", state: "Berlin", lat: 52.52, lon: 13.405 },
  { city: "Hamburg", state: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { city: "München", state: "Bayern", lat: 48.1374, lon: 11.5755 },
  { city: "Köln", state: "Nordrhein-Westfalen", lat: 50.9375, lon: 6.9603 },
  { city: "Frankfurt am Main", state: "Hessen", lat: 50.1109, lon: 8.6821 },
  { city: "Stuttgart", state: "Baden-Württemberg", lat: 48.7758, lon: 9.1829 },
  { city: "Leipzig", state: "Sachsen", lat: 51.3397, lon: 12.3731 },
  { city: "Hannover", state: "Niedersachsen", lat: 52.3759, lon: 9.732 },
  { city: "Kiel", state: "Schleswig-Holstein", lat: 54.3233, lon: 10.1228 },
  { city: "Dresden", state: "Sachsen", lat: 51.0504, lon: 13.7373 },
  { city: "Aachen", state: "Nordrhein-Westfalen", lat: 50.7753, lon: 6.0839 },
  { city: "Konstanz", state: "Baden-Württemberg", lat: 47.6779, lon: 9.1732 },
  { city: "Straßburg", state: "", lat: 48.5734, lon: 7.7521 }
];

function markerStressContacts(count = 600) {
  return Array.from({ length: count }, (_, index) => {
    const location = MARKER_STRESS_LOCATIONS[index % MARKER_STRESS_LOCATIONS.length];
    return {
      id: `marker-stress-${String(index).padStart(4, "0")}`,
      name: `Marker-Stresskontakt ${index + 1}`,
      organization: `Versorgungsnetz ${location.city}`,
      category: index % 2 === 0 ? "Praxis" : "Pflege",
      city: location.city,
      state: location.state,
      location: location.city,
      lat: location.lat,
      lon: location.lon
    };
  });
}

function orientationContacts() {
  return [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `orientation-berlin-${index}`,
      name: `Berlin Kontakt ${index + 1}`,
      organization: "Versorgungsnetz Berlin",
      category: "Praxis",
      city: "Berlin",
      state: "Berlin",
      lat: 52.52,
      lon: 13.405
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `orientation-bayern-${index}`,
      name: `Bayern Kontakt ${index + 1}`,
      organization: "Versorgungsnetz Bayern",
      category: "Pflege",
      city: "München",
      state: "Bayern",
      lat: 48.1374,
      lon: 11.5755
    })),
    {
      id: "orientation-hamburg",
      name: "Hamburg Kontakt",
      organization: "Versorgungsnetz Hamburg",
      category: "Apotheke",
      city: "Hamburg",
      state: "Hamburg",
      lat: 53.5511,
      lon: 9.9937
    }
  ];
}

async function openMap(page) {
  await page.route("https://**.basemaps.cartocdn.com/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av0GAAAAAElFTkSuQmCC",
        "base64"
      )
    });
  });
  await gotoAuthenticated(page, "/frontend/map/versorgungs-kompass-map.html?embed=1&channel=contacts");
  await expect(page.locator("#map")).toBeVisible();
}

async function sendMapContacts(page, contacts) {
  await page.locator("#map").evaluate((_mapElement, payload) => {
    globalThis.__mapContractContacts = payload;
    globalThis.eval(`
      currentEntries = globalThis.__mapContractContacts.map(toMapEntry).filter(Boolean);
      selectedState = "";
      activeMapContactId = "";
      mobilePreviewContactId = "";
      query = "";
      render();
      map.stop();
      fitMapToGermany();
    `);
    delete globalThis.__mapContractContacts;
  }, contacts);
}

function expectedPositionSnapshot(contacts) {
  return contacts
    .map((contact) => [contact.id, contact.lat, contact.lon])
    .sort((first, second) => first[0].localeCompare(second[0], "de"));
}

async function markerPositionSnapshot(page) {
  return page.locator("#map").evaluate(() => globalThis.eval("markerIndex")
    .map(({ data, marker }) => {
      const latLng = marker.getLatLng();
      return [String(data.id), latLng.lat, latLng.lng];
    })
    .sort((first, second) => first[0].localeCompare(second[0], "de")));
}

test("Karte: Standortmarker behalten auch bei identischen Adressen exakt ihre Quellkoordinaten", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name.includes("mobile");
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await openMap(page);

  const contacts = markerStressContacts();
  const expectedPositions = expectedPositionSnapshot(contacts);
  await sendMapContacts(page, contacts);

  const markers = page.locator(".gematik-marker");
  await expect(markers).toHaveCount(contacts.length, { timeout: 20_000 });
  await expect(page.locator(".map-cluster-marker")).toHaveCount(0);
  await expect(page.locator("#marker-toggle")).toHaveAttribute("aria-pressed", "true");
  expect(await markerPositionSnapshot(page)).toEqual(expectedPositions);

  const addressability = await page.locator("#map").evaluate(() => globalThis.eval("markerIndex").map(({ data, marker }) => {
    const element = marker.getElement();
    return {
      id: String(data.id),
      domId: element?.querySelector("[data-map-marker-id]")?.dataset.mapMarkerId || "",
      focusable: element?.tabIndex === 0,
      hasTitle: Boolean(element?.getAttribute("title")),
      handlesClick: marker.listens("click")
    };
  }));
  expect(new Set(addressability.map(({ domId }) => domId)).size).toBe(contacts.length);
  expect(addressability.every(({ id, domId }) => id === domId)).toBe(true);
  expect(addressability.every(({ focusable, hasTitle, handlesClick }) => focusable && hasTitle && handlesClick)).toBe(true);

  await markers.first().click();
  await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("activeMapContactId")))
    .toBe(contacts[0].id);

  const coveredDuplicateId = contacts[MARKER_STRESS_LOCATIONS.length].id;
  const coveredDuplicateMarker = page.locator(`[data-map-marker-id="${coveredDuplicateId}"]`).locator("..");
  await coveredDuplicateMarker.press("Enter");
  await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("activeMapContactId")))
    .toBe(coveredDuplicateId);
  expect(await markerPositionSnapshot(page)).toEqual(expectedPositions);

  await page.locator("#map").evaluate(() => globalThis.eval("render()"));
  await expect(markers).toHaveCount(contacts.length);
  expect(await markerPositionSnapshot(page)).toEqual(expectedPositions);

  await sendMapContacts(page, [...contacts].reverse());
  await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("currentEntries")[0]?.id))
    .toBe(contacts.at(-1).id);
  await expect(markers).toHaveCount(contacts.length);
  expect(await markerPositionSnapshot(page)).toEqual(expectedPositions);

  await page.locator("#map").evaluate(() => {
    const leafletMap = globalThis.eval("map");
    leafletMap.stop();
    leafletMap.setView([51.1, 10.2], 8, { animate: false });
    leafletMap.panBy([300, 0], { animate: false });
  });
  await expect(markers).toHaveCount(contacts.length);
  expect(await markerPositionSnapshot(page)).toEqual(expectedPositions);

  const duplicateCoordinateIds = [contacts[0].id, contacts[MARKER_STRESS_LOCATIONS.length].id];
  const duplicatePositions = (await markerPositionSnapshot(page))
    .filter(([id]) => duplicateCoordinateIds.includes(id))
    .map(([, lat, lon]) => [lat, lon]);
  expect(duplicatePositions).toEqual([
    [MARKER_STRESS_LOCATIONS[0].lat, MARKER_STRESS_LOCATIONS[0].lon],
    [MARKER_STRESS_LOCATIONS[0].lat, MARKER_STRESS_LOCATIONS[0].lon]
  ]);
  expect(browserErrors).toEqual([]);
});

test("Karte: Desktop zeigt dezente Bundesland-Orientierung und die tatsächliche Dichteskala", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name.includes("mobile");
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await openMap(page);
  await sendMapContacts(page, orientationContacts());

  await page.locator("#map").evaluate(() => {
    const leafletMap = globalThis.eval("map");
    leafletMap.stop();
    leafletMap.setView([51.2, 10.4], 6, { animate: false });
    globalThis.eval("updateLabelVisibility()");
  });

  const densityLegend = page.locator(".map-density-legend");
  await expect(densityLegend).toContainText("Kontakte je Bundesland");
  await expect(densityLegend.locator(".map-distribution-legend"))
    .toHaveAttribute("aria-label", "Verteilung je Bundesland: 0 bis 5 Kontakte");

  if (isMobile) {
    await expect(page.locator(".state-label")).toHaveCount(0);
    await expect(page.locator(".map-legend")).toBeHidden();
    return;
  }

  await expect(page.locator(".map-legend")).toBeVisible();
  await expect(densityLegend).toBeVisible();
  await expect(page.locator(".state-label")).toHaveCount(16);

  await page.locator("#map").evaluate(() => {
    globalThis.eval("map").setZoom(7, { animate: false });
    globalThis.eval("updateLabelVisibility()");
  });
  await expect(page.locator(".state-label")).toHaveCount(0);
});
