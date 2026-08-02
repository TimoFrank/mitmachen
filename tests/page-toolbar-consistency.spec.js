import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const appPath = (route) => `/frontend/app/versorgungs-kompass.html#${route}`;

const searchableRoutes = [
  { route: "contacts", title: "Kontakte", primary: "#new-contact-button" },
  { route: "organizations", title: "Organisationen", primary: "#new-organization-button" },
  { route: "map", title: "Karte" },
  { route: "activities", title: "Aktivitäten" },
  { route: "patients", title: "Patienten", primary: "#new-patient-contact-button", patientMode: "people" },
  { route: "politics", title: "Politik" },
  { route: "press", title: "Presse" },
  { route: "stakeholders/kv", title: "Kassenärztliche Vereinigungen" },
  { route: "experts", title: "Expertenkreis", primary: "#new-expert-contact-button" },
  { route: "formats", title: "Formate", primary: "#new-format-button" },
  { route: "hospitations", title: "Hospitationen", primary: "#new-hospitation-request-button" }
];

async function expectSearchGeometry(page, route, primarySelector = "") {
  const controls = page.locator(".crm-shell > .controls");
  const search = controls.locator(".controls-stack > .search-shell");
  await expect(controls).toBeVisible();
  await expect(search).toBeVisible();
  await expect(search).toHaveCount(1);
  await expect(search.locator("svg")).toHaveCount(1);
  await expect(controls.locator(".workspace-primary-actions ~ .search-shell")).toHaveCount(1);

  const primary = primarySelector ? controls.locator(primarySelector) : null;
  if (primary) await expect(primary).toBeVisible();
  else await expect(controls.locator(".workspace-primary-actions > :visible")).toHaveCount(0);

  const geometry = await controls.evaluate((root, selector) => {
    const searchElement = root.querySelector(":scope .controls-stack > .search-shell");
    const inputElement = searchElement?.querySelector("input");
    const iconElement = searchElement?.querySelector("svg");
    const primaryElement = selector ? root.querySelector(selector) : null;
    const controlsStack = root.querySelector(":scope > .controls-stack");
    const searchRect = searchElement?.getBoundingClientRect();
    const inputRect = inputElement?.getBoundingClientRect();
    const iconRect = iconElement?.getBoundingClientRect();
    const primaryRect = primaryElement?.getBoundingClientRect();
    const controlsRect = controlsStack?.getBoundingClientRect();
    return {
      mobile: matchMedia("(max-width: 760px)").matches,
      search: searchRect && { left: searchRect.left, right: searchRect.right, top: searchRect.top, bottom: searchRect.bottom, width: searchRect.width, height: searchRect.height },
      input: inputRect && { left: inputRect.left, top: inputRect.top, height: inputRect.height },
      icon: iconRect && { left: iconRect.left, right: iconRect.right, top: iconRect.top, height: iconRect.height },
      primary: primaryRect && { left: primaryRect.left, right: primaryRect.right, top: primaryRect.top, bottom: primaryRect.bottom, width: primaryRect.width, height: primaryRect.height },
      controls: controlsRect && { left: controlsRect.left, right: controlsRect.right },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  }, primarySelector);

  expect(geometry.search, `Suchzeile auf #${route}`).not.toBeNull();
  expect(geometry.search.height).toBeGreaterThanOrEqual(46);
  expect(geometry.search.height).toBeLessThanOrEqual(58);
  expect(geometry.icon.right, `Lupe links im Feld auf #${route}`).toBeLessThan(geometry.input.left);
  expect(Math.abs((geometry.icon.top + geometry.icon.height / 2) - (geometry.input.top + geometry.input.height / 2))).toBeLessThanOrEqual(2);
  expect(geometry.overflow, `kein Seitenüberlauf auf #${route}`).toBeLessThanOrEqual(1);

  if (!geometry.primary) {
    expect(Math.abs(geometry.controls.left - geometry.search.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.controls.right - geometry.search.right)).toBeLessThanOrEqual(1);
    return;
  }

  expect(geometry.primary.height).toBeGreaterThanOrEqual(46);
  if (geometry.mobile) {
    expect(geometry.search.top).toBeGreaterThanOrEqual(geometry.primary.bottom + 7);
    expect(Math.abs(geometry.primary.left - geometry.search.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.primary.right - geometry.search.right)).toBeLessThanOrEqual(1);
  } else {
    expect(geometry.search.left).toBeGreaterThanOrEqual(geometry.primary.right + 9);
    expect(Math.abs(geometry.primary.left - geometry.controls.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.search.right - geometry.controls.right)).toBeLessThanOrEqual(1);
    expect(Math.abs((geometry.primary.top + geometry.primary.height / 2) - (geometry.search.top + geometry.search.height / 2))).toBeLessThanOrEqual(1);
  }
}

async function prepareSearchableRoute(page, item) {
  if (!item.patientMode) return;
  const modeButton = page.locator(`button[data-patient-mode="${item.patientMode}"]`);
  await modeButton.click();
  await expect(modeButton).toHaveAttribute("aria-selected", "true");
}

test("Suchzeilen und primäre Aktionen folgen auf allen Listenansichten demselben Raster", async ({ page }) => {
  test.setTimeout(120_000);
  const [first, ...rest] = searchableRoutes;
  await gotoAuthenticated(page, appPath(first.route), { role: "admin" });
  await expect(page.locator("#workspace-view-title")).toHaveText(first.title);
  await prepareSearchableRoute(page, first);
  await expectSearchGeometry(page, first.route, first.primary);

  for (const item of rest) {
    await page.goto(appPath(item.route), { waitUntil: "load" });
    await expect(page.locator("#workspace-view-title")).toHaveText(item.title);
    await prepareSearchableRoute(page, item);
    await expectSearchGeometry(page, item.route, item.primary);
  }
});

test("Kontakte bündeln Filter, Owner und Spalten in der Tabellenzeile", async ({ page }) => {
  await gotoAuthenticated(page, appPath("contacts"), { role: "admin" });
  const toolbar = page.locator("#contact-table-toolbar");
  const filterToolbar = toolbar.locator(":scope > .filter-toolbar");
  const filterButton = filterToolbar.locator("#filter-panel-button");
  const ownerButton = toolbar.locator("#view-select-button");
  const columnsButton = toolbar.locator("#columns-button");
  const listSwitcher = toolbar.locator("#contact-list-switcher");

  await expect(toolbar).toBeVisible();
  await expect(filterToolbar).toHaveCount(1);
  await expect(page.locator(".controls-stack > .filter-toolbar")).toHaveCount(0);
  await expect(filterButton).toBeVisible();
  await expect(ownerButton).toBeVisible();
  await expect(listSwitcher).toBeVisible();

  const geometry = await toolbar.evaluate((element) => {
    const rectFor = (selector) => {
      const node = element.querySelector(selector);
      if (!node || getComputedStyle(node).display === "none") return null;
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    const rect = element.getBoundingClientRect();
    return {
      mobile: matchMedia("(max-width: 760px)").matches,
      toolbar: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      list: rectFor("#contact-list-switcher"),
      filter: rectFor("#filter-panel-button"),
      owner: rectFor("#view-select-button"),
      columns: rectFor("#columns-button"),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  for (const control of [geometry.list, geometry.filter, geometry.owner].filter(Boolean)) {
    expect(control.left).toBeGreaterThanOrEqual(geometry.toolbar.left - 1);
    expect(control.right).toBeLessThanOrEqual(geometry.toolbar.right + 1);
  }
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  if (geometry.mobile) {
    await expect(columnsButton).toBeHidden();
    expect(geometry.filter.top).toBeGreaterThanOrEqual(geometry.list.bottom + 7);
    expect(Math.abs((geometry.filter.top + geometry.filter.height / 2) - (geometry.owner.top + geometry.owner.height / 2))).toBeLessThanOrEqual(2);
    expect(geometry.owner.left - geometry.filter.right).toBeGreaterThanOrEqual(6);
    expect(geometry.filter.right).toBeLessThanOrEqual(geometry.toolbar.right + 1);
  } else {
    await expect(columnsButton).toBeVisible();
    expect(geometry.filter.left).toBeGreaterThanOrEqual(geometry.list.right + 8);
    expect(Math.abs((geometry.filter.top + geometry.filter.height / 2) - (geometry.owner.top + geometry.owner.height / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs((geometry.filter.top + geometry.filter.height / 2) - (geometry.columns.top + geometry.columns.height / 2))).toBeLessThanOrEqual(2);
  }

  await filterButton.click();
  await expect(page.locator("#filter-panel")).toBeVisible();
  await expect(page.locator("#view-contacts .view-card")).toHaveCSS("overflow", "visible");
  await expect(filterButton).toHaveAttribute("aria-expanded", "true");

  await page.goto(appPath("organizations"), { waitUntil: "load" });
  await expect(page.locator("#organization-column-actions > .filter-toolbar")).toHaveCount(1);
  await expect(page.locator("#organization-column-actions #filter-panel-button")).toBeVisible();
  await expect(page.locator(".controls-stack > .filter-toolbar")).toHaveCount(0);
  await expect(page.locator("#filter-panel-button")).toHaveCount(1);
  await page.goto(appPath("contacts"), { waitUntil: "load" });
  await expect(page.locator("#contact-table-toolbar > .filter-toolbar")).toHaveCount(1);
  await expect(page.locator("#contact-table-toolbar #filter-panel-button")).toBeVisible();
  await expect(page.locator("#filter-panel-button")).toHaveCount(1);
});

test("Organisationen, Expertenkreis und Patienten integrieren den Filter in ihre Tabellenwerkzeuge", async ({ page }) => {
  const routes = [
    {
      route: "organizations",
      toolbar: "#organization-table-toolbar",
      actions: "#organization-column-actions"
    },
    {
      route: "experts",
      toolbar: "#expert-table-toolbar",
      actions: "#expert-column-actions"
    },
    {
      route: "patients?view=people",
      toolbar: "#patient-table-toolbar",
      actions: "#patient-column-actions"
    }
  ];

  await gotoAuthenticated(page, appPath(routes[0].route), { role: "admin" });
  for (const [index, item] of routes.entries()) {
    if (index > 0) await page.goto(appPath(item.route), { waitUntil: "load" });
    const toolbar = page.locator(item.toolbar);
    const actions = page.locator(item.actions);
    const filterToolbar = actions.locator(":scope > .filter-toolbar");

    await expect(toolbar).toBeVisible();
    await expect(filterToolbar).toHaveCount(1);
    await expect(filterToolbar.locator("#filter-panel-button")).toBeVisible();
    await expect(page.locator(".controls-stack > .filter-toolbar")).toHaveCount(0);
    await expect(toolbar.locator("#filter-panel-button")).toHaveCount(1);

    const geometry = await toolbar.evaluate((element) => {
      const toolbarRect = element.getBoundingClientRect();
      const filterRect = element.querySelector("#filter-panel-button")?.getBoundingClientRect();
      const ownerRect = element.querySelector("#view-select-button")?.getBoundingClientRect();
      return {
        toolbar: { left: toolbarRect.left, right: toolbarRect.right, top: toolbarRect.top, bottom: toolbarRect.bottom },
        filter: filterRect && { left: filterRect.left, right: filterRect.right, top: filterRect.top, bottom: filterRect.bottom },
        owner: ownerRect && { left: ownerRect.left, right: ownerRect.right, top: ownerRect.top, bottom: ownerRect.bottom, height: ownerRect.height },
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(geometry.filter).not.toBeNull();
    expect(geometry.filter.left).toBeGreaterThanOrEqual(geometry.toolbar.left - 1);
    expect(geometry.filter.right).toBeLessThanOrEqual(geometry.toolbar.right + 1);
    expect(geometry.filter.top).toBeGreaterThanOrEqual(geometry.toolbar.top - 1);
    expect(geometry.filter.bottom).toBeLessThanOrEqual(geometry.toolbar.bottom + 1);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    if (item.route === "organizations") {
      expect(geometry.owner).not.toBeNull();
      expect(Math.abs((geometry.filter.top + (geometry.filter.bottom - geometry.filter.top) / 2) - (geometry.owner.top + geometry.owner.height / 2))).toBeLessThanOrEqual(2);
      expect(geometry.owner.left - geometry.filter.right).toBeGreaterThanOrEqual(6);
    }
  }
});

test("Experten-, Patienten- und Auswertungsmodi erscheinen als kompakte Switcher im Inhaltsbereich", async ({ page }, testInfo) => {
  await gotoAuthenticated(page, appPath("experts"), { role: "admin" });

  const assertCompactSwitcher = async ({ toolbar, switcher, count }) => {
    const toolbarNode = page.locator(toolbar);
    const switcherNode = toolbarNode.locator(`:scope > ${switcher}`);
    await expect(toolbarNode).toBeVisible();
    await expect(switcherNode).toBeVisible();
    await expect(page.locator(`.workspace-header ${switcher}`)).toHaveCount(0);
    const navDisplay = await switcherNode.locator(".experts-mode-nav--header").evaluate((node) => getComputedStyle(node).display);
    expect(["flex", "inline-flex", "grid"]).toContain(navDisplay);
    if (count) {
      await expect(switcherNode.locator(".experts-mode-count")).toHaveCount(count);
      await expect(switcherNode.locator(".experts-mode-count")).toHaveText(Array.from({ length: count }, () => /\d+/));
      const countDisplays = await switcherNode.locator(".experts-mode-count").evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).display)
      );
      expect(countDisplays.every((display) => display !== "none")).toBe(true);
    }
    const geometry = await toolbarNode.evaluate((element, selector) => {
      const toolbarRect = element.getBoundingClientRect();
      const switcherRect = element.querySelector(`:scope > ${selector}`)?.getBoundingClientRect();
      return {
        toolbar: { left: toolbarRect.left, right: toolbarRect.right, top: toolbarRect.top, bottom: toolbarRect.bottom, width: toolbarRect.width },
        switcher: switcherRect && { left: switcherRect.left, right: switcherRect.right, top: switcherRect.top, bottom: switcherRect.bottom, width: switcherRect.width }
      };
    }, switcher);
    expect(geometry.switcher).not.toBeNull();
    expect(geometry.switcher.left).toBeGreaterThanOrEqual(geometry.toolbar.left - 1);
    expect(geometry.switcher.right).toBeLessThanOrEqual(geometry.toolbar.right + 1);
    expect(geometry.switcher.top).toBeGreaterThanOrEqual(geometry.toolbar.top - 1);
    expect(geometry.switcher.bottom).toBeLessThanOrEqual(geometry.toolbar.bottom + 1);
    expect(geometry.switcher.width).toBeLessThanOrEqual(geometry.toolbar.width + 1);
  };

  await assertCompactSwitcher({
    toolbar: "#expert-table-toolbar",
    switcher: "#expert-mode-actions",
    count: 2
  });

  await page.goto(appPath("patients?view=people"), { waitUntil: "load" });
  await assertCompactSwitcher({
    toolbar: "#patient-table-toolbar",
    switcher: "#patient-mode-actions",
    count: 3
  });
  await expect(page.locator('#patient-mode-actions [data-patient-mode="organizations"] .experts-mode-label')).toHaveText("Organisationen");
  if (testInfo.project.name.includes("mobile")) {
    await page.setViewportSize({ width: 320, height: 780 });
    const tabsStayInsideSwitcher = await page.locator("#patient-mode-actions .experts-mode-nav--header").evaluate((switcher) => {
      const switcherBounds = switcher.getBoundingClientRect();
      return [...switcher.querySelectorAll("[data-patient-mode]")].every((tab) => {
        const tabBounds = tab.getBoundingClientRect();
        return tabBounds.left >= switcherBounds.left - 1 && tabBounds.right <= switcherBounds.right + 1;
      });
    });
    expect(tabsStayInsideSwitcher).toBe(true);
  }

  await page.goto(appPath("analytics"), { waitUntil: "load" });
  await assertCompactSwitcher({
    toolbar: "#analytics-view-mode-toolbar",
    switcher: "#analytics-mode-actions",
    count: 0
  });
  await expect(page.locator('[data-analytics-mode="analytics"]')).toHaveAttribute("aria-selected", "true");

  await page.locator('[data-analytics-mode="quality"]').click();
  await expect(page).toHaveURL(/#quality$/);
  await assertCompactSwitcher({
    toolbar: "#quality-view-mode-toolbar",
    switcher: "#analytics-mode-actions",
    count: 0
  });
  await expect(page.locator('[data-analytics-mode="quality"]')).toHaveAttribute("aria-selected", "true");
});

test("Hospitationen bündeln Ergebniszahl, Export und Ansicht in einer Tabellenzeile", async ({ page }) => {
  await gotoAuthenticated(page, appPath("hospitations"), { role: "admin" });
  const toolbar = page.locator("#hospitation-table-toolbar");
  const meta = toolbar.locator("#hospitation-table-toolbar-meta");
  const word = toolbar.getByRole("button", { name: "Word" });
  const pdf = toolbar.getByRole("button", { name: "PDF" });
  const list = toolbar.getByRole("button", { name: "Liste" });
  const calendar = toolbar.getByRole("button", { name: "Kalender" });

  await expect(toolbar).toBeVisible();
  await expect(meta).toHaveText(/^\d+ von \d+ Termin(?:en)?$/);
  await expect(word).toBeVisible();
  await expect(pdf).toBeVisible();
  await expect(list).toHaveAttribute("aria-pressed", "true");
  await expect(calendar).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".controls-stack > .filter-toolbar")).toBeHidden();
  await expect(page.locator(".controls-stack .workspace-secondary-actions")).toHaveCount(0);

  const geometry = await toolbar.evaluate((element) => {
    const rectFor = (selector) => {
      const rect = element.querySelector(selector)?.getBoundingClientRect();
      return rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    const rect = element.getBoundingClientRect();
    return {
      mobile: matchMedia("(max-width: 760px)").matches,
      toolbar: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      meta: rectFor("#hospitation-table-toolbar-meta"),
      actions: rectFor(".workspace-secondary-actions"),
      controlHeights: [...element.querySelectorAll("[data-hospitation-export], [data-hospitation-schedule-view]")]
        .map((control) => control.getBoundingClientRect().height),
      list: document.querySelector("#hospitation-list")?.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  expect(geometry.meta.left).toBeGreaterThanOrEqual(geometry.toolbar.left - 1);
  expect(geometry.actions.right).toBeLessThanOrEqual(geometry.toolbar.right + 1);
  expect(geometry.list).toBeGreaterThanOrEqual(geometry.toolbar.bottom + 7);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  if (geometry.mobile) {
    expect(geometry.actions.top).toBeGreaterThanOrEqual(geometry.meta.bottom + 7);
    geometry.controlHeights.forEach((height) => expect(height).toBeGreaterThanOrEqual(44));
  } else {
    expect(geometry.actions.left).toBeGreaterThanOrEqual(geometry.meta.right + 8);
    expect(Math.abs((geometry.meta.top + geometry.meta.height / 2) - (geometry.actions.top + geometry.actions.height / 2))).toBeLessThanOrEqual(2);
  }

  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-pressed", "true");
  await expect(list).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(geometry.mobile
    ? "#hospitation-list .hospitation-mobile-agenda"
    : "#hospitation-list .hospitation-calendar"
  )).toBeVisible();
});

test("Ohne Schreibrecht nutzt die Suche die volle Werkzeugbreite", async ({ page }) => {
  await gotoAuthenticated(page, appPath("experts"), { role: "viewer" });
  const controls = page.locator(".crm-shell > .controls .controls-stack");
  const search = controls.locator(":scope > .search-shell");
  await expect(page.locator("#new-expert-contact-button")).toBeHidden();
  await expect(controls.locator(":scope > .workspace-primary-actions")).toBeHidden();
  const geometry = await controls.evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const searchRect = root.querySelector(":scope > .search-shell")?.getBoundingClientRect();
    return {
      root: { left: rootRect.left, right: rootRect.right },
      search: searchRect && { left: searchRect.left, right: searchRect.right }
    };
  });
  expect(Math.abs(geometry.root.left - geometry.search.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.root.right - geometry.search.right)).toBeLessThanOrEqual(1);
});

test("Presse, Politik und Aktivitäten nutzen kompakte Inhaltszeilen ohne zweiten Seitenkopf", async ({ page }) => {
  await gotoAuthenticated(page, appPath("press"), { role: "admin" });
  await expect(page.locator("#view-press .press-context h2")).toHaveCount(0);
  await expect(page.locator("#view-press .press-context")).toContainText(/Pressekontakt/);
  await expect(page.locator("#press-data-notice")).toBeHidden();

  await page.goto(appPath("politics"), { waitUntil: "load" });
  await expect(page.locator("#view-politics .politics-context h2")).toHaveCount(0);
  await expect(page.locator("#view-politics .dataset-toolbar")).toContainText(/Mitglied/);

  await page.goto(appPath("activities"), { waitUntil: "load" });
  await expect(page.locator("#activities-search-slot")).toHaveCount(0);
  await expect(page.locator("#view-activities .activities-toolbar .search-shell")).toHaveCount(0);
  await expect(page.locator(".controls-stack > .search-shell")).toBeVisible();
  await expect(page.locator("#view-stakeholders .table-command-row--stakeholders")).toHaveCount(0);
});

test("Beobachtungen und Teams verwenden dieselbe sichtbare Suchfeld-Geometrie", async ({ page }) => {
  await gotoAuthenticated(page, appPath("hospitations:observations"), { role: "admin" });
  const observationPanel = page.locator("#hospitation-observations-panel:not([hidden])");
  const observationSearch = observationPanel.locator(".observation-header-search");
  const observationPrimary = observationPanel.locator(".observation-primary-toolbar [data-observation-new]");
  await expect(observationSearch).toBeVisible();
  await expect(observationPrimary).toBeVisible();
  await expect(observationPanel.locator(".workspace-primary-actions + .observation-header-search")).toHaveCount(1);
  await expect(page.locator("[data-observation-search-toggle]")).toHaveCount(0);
  await expect.poll(() => observationSearch.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(46);
  const observationGeometry = await observationPanel.locator(".observation-primary-toolbar").evaluate((toolbar) => {
    const search = toolbar.querySelector(".observation-header-search")?.getBoundingClientRect();
    const primary = toolbar.querySelector("[data-observation-new]")?.getBoundingClientRect();
    return {
      mobile: matchMedia("(max-width: 760px)").matches,
      search: search && { left: search.left, right: search.right, top: search.top, bottom: search.bottom, height: search.height },
      primary: primary && { left: primary.left, right: primary.right, top: primary.top, bottom: primary.bottom }
    };
  });
  expect(observationGeometry.search.height).toBeLessThanOrEqual(58);
  if (observationGeometry.mobile) {
    expect(observationGeometry.search.top).toBeGreaterThanOrEqual(observationGeometry.primary.bottom + 7);
  } else {
    expect(observationGeometry.search.left).toBeGreaterThanOrEqual(observationGeometry.primary.right + 9);
  }

  await page.goto(appPath("team"), { waitUntil: "load" });
  const teamSearch = page.locator(".team-search");
  await expect(teamSearch).toBeVisible();
  const teamGeometry = await teamSearch.evaluate((element) => {
    const icon = element.querySelector("svg")?.getBoundingClientRect();
    const input = element.querySelector("input")?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      iconRight: icon?.right || Number.POSITIVE_INFINITY,
      inputLeft: input?.left || 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(teamGeometry.height).toBeGreaterThanOrEqual(46);
  expect(teamGeometry.height).toBeLessThanOrEqual(58);
  expect(teamGeometry.iconRight).toBeLessThan(teamGeometry.inputLeft);
  expect(teamGeometry.overflow).toBeLessThanOrEqual(1);
});

test("sichtbare Systemhinweise verwenden kein öffentliches-Demo-Framing", async ({ page }) => {
  await page.goto("/dist/pages/versorgungs-kompass.html#press");
  await expect(page.locator("#view-press")).toBeVisible();
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain("Diese öffentliche Demo");
  expect(visibleText).not.toContain("synthetische Demo-Kontakte");
  expect(visibleText).not.toContain("Demo-Profil wechseln");
});
