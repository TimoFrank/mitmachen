import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const TRANSPARENT_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av0GAAAAAElFTkSuQmCC",
  "base64"
);

const MAP_CONTACTS = [
  {
    id: "map-ada",
    name: "Ada Karte",
    organization: "Praxis Mitte",
    category: "Praxis",
    city: "Berlin",
    state: "Berlin",
    lat: 52.52,
    lon: 13.405
  },
  {
    id: "map-berta",
    name: "Berta Karte",
    organization: "Pflege Mitte",
    category: "Pflege",
    city: "Berlin",
    state: "Berlin",
    lat: 52.52,
    lon: 13.405
  }
];

async function stubMapTiles(page) {
  await page.route("https://**.basemaps.cartocdn.com/**", async (route) => {
    await route.fulfill({ contentType: "image/png", body: TRANSPARENT_TILE });
  });
}

async function openMap(page, { embedded = true } = {}) {
  await stubMapTiles(page);
  const suffix = embedded ? "?embed=1&channel=contacts" : "";
  await gotoAuthenticated(page, `/frontend/map/versorgungs-kompass-map.html${suffix}`);
  await expect(page.locator("#map")).toBeVisible();
}

async function sendMapContacts(page, contacts = MAP_CONTACTS) {
  await page.locator("#map").evaluate((_mapElement, payload) => {
    globalThis.__mapAccessibilityContacts = payload;
    globalThis.eval(`
      const nextEntries = globalThis.__mapAccessibilityContacts.map(toMapEntry).filter(Boolean);
      if (EMBED_MODE) currentEntries = nextEntries;
      else BASE_DATA.splice(0, BASE_DATA.length, ...nextEntries);
      selectedState = "";
      activeMapContactId = "";
      mobilePreviewContactId = "";
      activeCategoryFilter = "";
      activeOwnerFilter = "";
      activePriorityFilter = "";
      query = "";
      elSearch.value = "";
      syncSearchClearButton();
      render();
      map.stop();
      fitMapToGermany();
    `);
    delete globalThis.__mapAccessibilityContacts;
  }, contacts);
}

test("Karte: eingebettete Ansicht meldet ihre Bereitschaft auch nach einem Reload", async ({ page }) => {
  await stubMapTiles(page);
  await gotoAuthenticated(page, "/");

  await page.evaluate((contact) => {
    globalThis.__mapReadyMessages = 0;
    window.addEventListener("message", (event) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== "versorgungs-kompass-map-ready" ||
        event.data?.version !== 1 ||
        event.data?.channel !== "contacts"
      ) return;
      globalThis.__mapReadyMessages += 1;
      event.source.postMessage({
        type: "versorgungs-kompass-map-data",
        version: 1,
        channel: "contacts",
        context: "contacts",
        contacts: [contact]
      }, window.location.origin);
    });

    document.body.innerHTML = "";
    const frame = document.createElement("iframe");
    frame.id = "map-ready-frame";
    frame.title = "Karte für Ready-Handshake-Test";
    frame.src = "/frontend/map/versorgungs-kompass-map.html?embed=1&channel=contacts";
    document.body.appendChild(frame);
  }, MAP_CONTACTS[0]);

  await expect.poll(() => page.evaluate(() => globalThis.__mapReadyMessages)).toBeGreaterThan(0);
  const frame = page.frameLocator("#map-ready-frame");
  await expect(frame.locator("#list").getByRole("button", { name: /Ada Karte/ })).toHaveCount(1);

  const initialReadyMessages = await page.evaluate(() => globalThis.__mapReadyMessages);
  await page.locator("#map-ready-frame").evaluate((element) => {
    const nextUrl = new URL(element.src);
    nextUrl.searchParams.set("reload", String(Date.now()));
    element.src = nextUrl.href;
  });

  await expect.poll(() => page.evaluate(() => globalThis.__mapReadyMessages))
    .toBeGreaterThan(initialReadyMessages);
  await expect(frame.locator("#list").getByRole("button", { name: /Ada Karte/ })).toHaveCount(1);
});

test("Karte: Suche, Kontaktliste und Detailtabs behalten den Tastaturfokus", async ({ page }) => {
  await openMap(page, { embedded: false });
  await sendMapContacts(page);

  const search = page.getByRole("searchbox", { name: "Kontakte auf der Karte durchsuchen" });
  const clearSearch = page.getByRole("button", { name: "Kartensuche löschen" });
  await expect(clearSearch).toBeHidden();
  await search.fill("Ada");
  await expect(page.locator("#count")).toHaveText("1 / 2");
  await expect(clearSearch).toBeVisible();
  await clearSearch.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.locator("#count")).toHaveText("2 / 2");

  const adaListItem = page.getByRole("button", { name: /Ada Karte.*Details öffnen/ });
  await adaListItem.focus();
  await expect(adaListItem).toBeFocused();
  await adaListItem.press("Enter");
  await expect(page.locator("#map-detail-title")).toHaveText("Ada Karte");
  await expect(page.locator("#map-detail-title")).toBeFocused();

  const overviewTab = page.getByRole("tab", { name: "Überblick" });
  await expect(overviewTab).toHaveAttribute("aria-controls", "map-detail-overview");
  await expect(page.locator("#map-detail-overview")).toHaveAttribute("role", "tabpanel");
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  const contactTab = page.getByRole("tab", { name: "Kontakt" });
  await expect(contactTab).toHaveAttribute("aria-selected", "true");
  await expect(contactTab).toBeFocused();
  await contactTab.press("End");
  await expect(page.getByRole("tab", { name: "Aktivitäten" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Überblick" })).toBeFocused();

  await page.getByRole("button", { name: "Details schließen" }).click();
  await expect(page.locator("#map-detail-title")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ada Karte.*Details öffnen/ })).toBeFocused();
});

test("Karte: Einzelmarker und Gruppenmarker haben eindeutige Tastaturbeschriftungen", async ({ page }) => {
  await openMap(page);
  await sendMapContacts(page);

  const adaMarker = page.locator('[data-map-marker-contact-id="map-ada"]');
  await expect(adaMarker).toHaveAttribute("role", "button");
  await expect(adaMarker).toHaveAttribute("tabindex", "0");
  await expect(adaMarker).toHaveAttribute("aria-label", /Standort von Ada Karte, Praxis Mitte, Berlin, Berlin/);
  await adaMarker.press("Space");
  await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("activeMapContactId")))
    .toBe("map-ada");

  await page.locator("#map").evaluate(() => {
    globalThis.eval(`
      activeMapContactId = "";
      gematikMarkerModeActive = false;
      heatMapActive = false;
      clusterModeActive = true;
      map.setView([51.1, 10.2], 6, { animate: false });
      render();
      map.stop();
    `);
  });
  const clusterMarker = page.locator(".map-cluster-marker").locator("..");
  await expect(clusterMarker).toHaveAttribute("role", "button");
  await expect(clusterMarker).toHaveAttribute("tabindex", "0");
  await expect(clusterMarker).toHaveAttribute(
    "aria-label",
    "Gruppe mit 2 Kontakten in Berlin. Aktivieren, um die Karte zu vergrößern."
  );
  const zoomBeforeActivation = await page.locator("#map").evaluate(() => globalThis.eval("map").getZoom());
  await clusterMarker.press("Space");
  await expect.poll(() => page.locator("#map").evaluate(() => globalThis.eval("map").getZoom()))
    .toBeGreaterThan(zoomBeforeActivation);
});
