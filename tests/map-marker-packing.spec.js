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
  { city: "Straßburg", state: "", lat: 48.5734, lon: 7.7521, outsideGermany: true }
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

async function sendMapContacts(page, contacts) {
  await page.locator("#map").evaluate((_mapElement, payload) => {
    globalThis.__markerStressContacts = payload;
    globalThis.eval(`
      currentEntries = globalThis.__markerStressContacts.map(toMapEntry).filter(Boolean);
      selectedState = "";
      activeMapContactId = "";
      mobilePreviewContactId = "";
      query = "";
      render();
      fitMapToGermany();
    `);
    delete globalThis.__markerStressContacts;
  }, contacts);
}

async function markerPositionSnapshot(page) {
  return page.locator("#map").evaluate(() => globalThis.eval("markerIndex")
    .map(({ data, marker }) => {
      const latLng = marker.getLatLng();
      return [
        String(data.id),
        Number(latLng.lat.toFixed(7)),
        Number(latLng.lng.toFixed(7))
      ];
    })
    .sort((a, b) => a[0].localeCompare(b[0], "de")));
}

async function controlOverlapCount(page) {
  return page.locator("#map").evaluate(() => {
    const mapRect = document.querySelector("#map").getBoundingClientRect();
    const markerRects = [...document.querySelectorAll(".gematik-marker")]
      .map((marker) => marker.getBoundingClientRect())
      .filter((rect) => (
        rect.right > mapRect.left
        && rect.left < mapRect.right
        && rect.bottom > mapRect.top
        && rect.top < mapRect.bottom
      ));
    const obstacles = [...document.querySelectorAll(".leaflet-control-zoom, .map-mode-controls, .map-legend")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => element.getBoundingClientRect());
    const overlaps = (first, second) => (
      Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0.5
      && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0.5
    );
    return markerRects.reduce(
      (count, markerRect) => count + obstacles.filter((obstacle) => overlaps(markerRect, obstacle)).length,
      0
    );
  });
}

test("Karte: 600 einzelne Standortmarker bleiben kollisionsfrei in Deutschland", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name.includes("mobile");
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.route("https://**.basemaps.cartocdn.com/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av0GAAAAAElFTkSuQmCC", "base64")
    });
  });

  await gotoAuthenticated(page, "/frontend/map/versorgungs-kompass-map.html?embed=1&channel=contacts");
  await expect(page.locator("#map")).toBeVisible();
  const contacts = markerStressContacts();
  await sendMapContacts(page, contacts);

  const markers = page.locator(".gematik-marker");
  await expect(markers).toHaveCount(contacts.length, { timeout: 20_000 });
  await expect(page.locator(".map-cluster-marker")).toHaveCount(0);
  await expect(page.locator("#marker-toggle")).toHaveAttribute("aria-pressed", "true");

  const geometry = await page.locator("#map").evaluate(() => {
    const leafletMap = globalThis.eval("map");
    const diagnostics = globalThis.eval("markerLayoutDiagnostics");
    const mapRect = document.querySelector("#map").getBoundingClientRect();
    const markerElements = [...document.querySelectorAll(".gematik-marker")];
    const markerRects = markerElements.map((marker) => {
      const rect = marker.getBoundingClientRect();
      return {
        id: marker.dataset.mapMarkerId,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
    });
    const obstacles = [...document.querySelectorAll(".leaflet-control-zoom, .map-mode-controls, .map-legend")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
    const overlapArea = (a, b) => {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return width > 0.5 && height > 0.5 ? width * height : 0;
    };
    let markerOverlaps = 0;
    let obstacleOverlaps = 0;
    for (let first = 0; first < markerRects.length; first += 1) {
      const rect = markerRects[first];
      if (rect.left < mapRect.left - 0.5
        || rect.right > mapRect.right + 0.5
        || rect.top < mapRect.top - 0.5
        || rect.bottom > mapRect.bottom + 0.5) {
        markerOverlaps += 1;
      }
      obstacleOverlaps += obstacles.filter((obstacle) => overlapArea(rect, obstacle) > 0).length;
      for (let second = first + 1; second < markerRects.length; second += 1) {
        if (overlapArea(rect, markerRects[second]) > 0) markerOverlaps += 1;
      }
    }
    const germanyPath = new Path2D();
    const germanyGeoJson = globalThis.eval("DE_GEOJSON");
    const geometries = germanyGeoJson.features.map((feature) => feature.geometry);
    const polygons = geometries.flatMap((geometry) => (
      geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
    ));
    polygons.forEach((polygon) => polygon.forEach((ring) => {
      ring.forEach(([longitude, latitude], index) => {
        const point = leafletMap.latLngToContainerPoint([latitude, longitude]);
        if (index === 0) germanyPath.moveTo(point.x, point.y);
        else germanyPath.lineTo(point.x, point.y);
      });
      germanyPath.closePath();
    }));
    const geometryContext = document.createElement("canvas").getContext("2d");
    const outsideFootprints = markerRects.filter((rect) => {
      const relativeRect = {
        left: rect.left - mapRect.left,
        right: rect.right - mapRect.left,
        top: rect.top - mapRect.top,
        bottom: rect.bottom - mapRect.top
      };
      const columns = Math.max(4, Math.ceil((relativeRect.right - relativeRect.left) * 4));
      const rows = Math.max(4, Math.ceil((relativeRect.bottom - relativeRect.top) * 4));
      for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
          const x = relativeRect.left + ((relativeRect.right - relativeRect.left) * column / columns);
          const y = relativeRect.top + ((relativeRect.bottom - relativeRect.top) * row / rows);
          if (!geometryContext.isPointInPath(germanyPath, x, y, "evenodd")) return true;
        }
      }
      return false;
    });
    return {
      diagnostics,
      outsideFootprints: outsideFootprints.map((rect) => rect.id),
      markerOverlaps,
      obstacleOverlaps
    };
  });

  expect(geometry.diagnostics.complete).toBe(true);
  expect(geometry.diagnostics.count).toBe(contacts.length);
  expect(geometry.diagnostics.durationMs).toBeLessThan(isMobile ? 2_500 : 2_000);
  expect(geometry.outsideFootprints).toEqual([]);
  expect(geometry.markerOverlaps).toBe(0);
  expect(geometry.obstacleOverlaps).toBe(0);

  const initialPositions = await markerPositionSnapshot(page);
  await page.locator("#map").evaluate(() => globalThis.eval("render()"));
  await expect(markers).toHaveCount(contacts.length);
  expect(await markerPositionSnapshot(page)).toEqual(initialPositions);

  await sendMapContacts(page, [...contacts].reverse());
  await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("currentEntries")[0]?.id))
    .toBe(contacts.at(-1).id);
  await expect(markers).toHaveCount(contacts.length);
  expect(await markerPositionSnapshot(page)).toEqual(initialPositions);

  if (!isMobile) {
    await markers.first().hover();
    const tooltip = page.locator(".map-point-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Marker-Stresskontakt");
    await expect(tooltip).toContainText("Versorgungsnetz");

    const outsideLocationIndex = MARKER_STRESS_LOCATIONS.findIndex((location) => location.outsideGermany);
    const outsideMarkerId = `marker-stress-${String(outsideLocationIndex).padStart(4, "0")}`;
    await page.locator(`[data-map-marker-id="${outsideMarkerId}"]`).hover();
    expect(await page.locator("#map").evaluate(() => globalThis.eval("markerGuideLayer").getLayers().length)).toBe(0);

    await page.locator("#map").evaluate(() => {
      const leafletMap = globalThis.eval("map");
      leafletMap.setView([51.1, 10.2], 8, { animate: false });
    });
    await expect.poll(() => controlOverlapCount(page)).toBe(0);
    const packingKeyBeforePan = await page.locator("#map").evaluate(() => globalThis.eval("markerPackingCache").key);
    await page.locator("#map").evaluate(() => globalThis.eval("map").panBy([300, 0], { animate: false }));
    await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("markerPackingCache").key))
      .not.toBe(packingKeyBeforePan);
    await expect.poll(() => controlOverlapCount(page)).toBe(0);
  }
  expect(browserErrors).toEqual([]);
});
