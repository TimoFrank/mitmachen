import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";
import { createProtectedBackendFixture } from "./helpers/protected-backend-fixture.js";

const APP = "/frontend/app/versorgungs-kompass.html";
const LIST_FIXTURE = `
  window.VERSORGUNGS_COMPASS_CONTACTS = [
    { id: "layout-contact-1", name: "Anna Adler", organizationId: "layout-org-1", organization: "MVZ Nord", category: "Praxis", city: "Berlin", state: "Berlin", status: "active" },
    { id: "layout-contact-2", name: "Boris Brandt", organizationId: "layout-org-2", organization: "Praxis Mitte", category: "Praxis", city: "Berlin", state: "Berlin", status: "active" }
  ];
  window.VERSORGUNGS_COMPASS_DEMO_DATA = {
    organizations: [
      { id: "layout-org-1", name: "MVZ Nord", sector: "Praxis", city: "Berlin", state: "Berlin", status: "active" },
      { id: "layout-org-2", name: "Praxis Mitte", sector: "Praxis", city: "Berlin", state: "Berlin", status: "active" }
    ]
  };
`;

function fixture() {
  return createProtectedBackendFixture({ role: "admin", fixtureScript: LIST_FIXTURE });
}

async function tableGeometry(page, { table, rows, logo, name, star }) {
  return page.locator(table).evaluate((element, selectors) => {
    const row = element.querySelector(selectors.rows);
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
    };
    return {
      type: element.closest("#view-contacts") ? "contacts" : "organizations",
      row: box(row),
      rowHeights: [...element.querySelectorAll(selectors.rows)].map((item) => item.getBoundingClientRect().height),
      headerCheckbox: box(element.querySelector(".thead .cell--select input")),
      checkbox: box(row.querySelector(".cell--select input")),
      selectionCell: box(row.querySelector(".cell--select")),
      logo: box(row.querySelector(selectors.logo)),
      name: box(row.querySelector(selectors.name)),
      star: box(row.querySelector(selectors.star))
    };
  }, { rows, logo, name, star });
}

test("Kontakt- und Organisationszeilen richten Logo, Favoritenstern und Auswahlboxen gleich aus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Die gemeinsamen Tabellenspalten werden auf Desktop geprüft.");
  await gotoAuthenticated(page, `${APP}#contacts`, { role: "admin", backendFixture: fixture() });
  await expect(page.locator("#contact-list .row")).toHaveCount(2);
  const contacts = await tableGeometry(page, {
    table: "#view-contacts .contacts-table", rows: "#contact-list .row", logo: ".avatar", name: ".contact-name-button", star: "[data-favorite-contact]"
  });
  await page.locator('[data-view-tab="organizations"]').click();
  await expect(page.locator("#organization-list .row")).toHaveCount(2);
  const organizations = await tableGeometry(page, {
    table: "#view-organizations .organizations-table", rows: "#organization-list .row", logo: ".organization-logo", name: ".organization-name-button", star: "[data-favorite-organization]"
  });

  for (const geometry of [contacts, organizations]) {
    expect(geometry.logo.right).toBeLessThanOrEqual(geometry.name.left);
    expect(geometry.name.right).toBeLessThanOrEqual(geometry.star.left + 1);
    expect(Math.abs(geometry.headerCheckbox.centerX - geometry.checkbox.centerX), JSON.stringify({ table: geometry.type, header: geometry.headerCheckbox, checkbox: geometry.checkbox, cell: geometry.selectionCell })).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.selectionCell.centerX - geometry.checkbox.centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.row.centerY - geometry.checkbox.centerY)).toBeLessThanOrEqual(1);
    expect(Math.max(...geometry.rowHeights) - Math.min(...geometry.rowHeights)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(contacts.logo.height - organizations.logo.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(contacts.row.height - organizations.row.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(contacts.selectionCell.width - organizations.selectionCell.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(contacts.checkbox.width - organizations.checkbox.width)).toBeLessThanOrEqual(1);
});

for (const item of [
  { route: "contacts", view: "#view-contacts", actions: "#contact-secondary-actions", pagination: "#pagination", rows: "#contact-list [data-id]", expected: ["Archiv", "Dubletten"] },
  { route: "organizations", view: "#view-organizations", actions: "#organization-secondary-actions", pagination: "#organizations-pagination", rows: "#organization-list [data-organization-id]", expected: ["Dubletten"] }
]) {
  test(`${item.route}: weitere Aktionen stehen mit der Seitenanzeige in einer kompakten Fußzeile`, async ({ page }, testInfo) => {
    await gotoAuthenticated(page, `${APP}#${item.route}`, { role: "admin", backendFixture: fixture() });
    await expect(page.locator(item.rows)).toHaveCount(2);
    const actions = page.locator(item.actions);
    await expect(actions).toBeVisible();
    const footer = page.locator(`${item.view} .table-footer`);
    await expect(footer.locator(item.actions)).toBeVisible();
    await expect(footer.locator(item.pagination)).toBeVisible();
    const visibleActionLabels = await actions.locator("button:visible").allTextContents();
    for (const label of item.expected) {
      if (label === "Archiv" && testInfo.project.name.includes("mobile")) continue;
      expect(visibleActionLabels.some((text) => text.trim() === label || text.trim().startsWith(`${label} (`))).toBe(true);
    }
    const geometry = await footer.evaluate((element, selectors) => {
      const box = (node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, centerY: rect.top + rect.height / 2 };
      };
      return {
        footer: box(element), actions: box(element.querySelector(selectors.actions)), pages: box(element.querySelector(selectors.pagination)),
        overflow: document.documentElement.scrollWidth - window.innerWidth
      };
    }, { actions: item.actions, pagination: item.pagination });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.actions.left).toBeLessThanOrEqual(geometry.footer.left + 16);
    if (testInfo.project.name.includes("mobile")) {
      expect(Math.abs(geometry.actions.centerY - geometry.pages.centerY)).toBeLessThanOrEqual(1);
      expect(geometry.actions.right).toBeLessThanOrEqual(geometry.pages.left - 7);
      expect(geometry.footer.height).toBeLessThanOrEqual(170);
    } else {
      expect(geometry.actions.right).toBeLessThanOrEqual(geometry.pages.left - 7);
      expect(Math.abs(geometry.actions.centerY - geometry.pages.centerY)).toBeLessThanOrEqual(1);
    }
  });
}
