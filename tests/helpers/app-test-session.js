import { expect } from "@playwright/test";
import { createProtectedBackendFixture, installProtectedBackend } from "./protected-backend-fixture.js";

export const AUTH_KEY = "versorgungs-kompass-auth-v1";

export function authSession() {
  return {
    authenticated: true,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
}

function authGuardStub() {
  return `
    window.VKAuth = {
      config: window.VK_AUTH_CONFIG || {},
      getStoredSession: () => ({ authenticated: true, expiresAt: Date.now() + 2592000000 }),
      isAuthenticated: () => true,
      setAuthenticated: () => ({ authenticated: true, expiresAt: Date.now() + 2592000000 }),
      clearAuthenticated: () => {},
      buildLoginUrl: () => "../login/login.html",
      buildLogoutUrl: () => "../login/login.html#signed-out",
      getDefaultUrl: () => "../frontend/app/versorgungs-kompass.html"
    };
  `;
}

function configStub({ role }) {
  return `window.VERSORGUNGS_COMPASS_CONFIG = {
    dataMode: "api",
    authMode: "trusted-header",
    apiBaseUrl: "",
    apiCredentials: "include",
    requireApiGateway: true,
    capabilities: {
      contactRole: true,
      contactConsent: true,
      organizationPrimarySystems: true,
      registrationIntake: true,
      contactImageSources: true,
      organizationAssets: false,
      expertOrganizationAssets: false,
      stakeholderOrganizationAssets: true
    },
    demoRole: ${JSON.stringify(role)}
  };`;
}

async function fulfillScript(route, body) {
  await route.fulfill({
    contentType: "application/javascript",
    body
  });
}

export async function installAppTestSession(
  page,
  {
    role = "admin",
    backendFixtureScript = "",
    dataServiceScript = "",
    backendFixture = null,
    localNotifications = []
  } = {}
) {
  await page.route("**/login/auth-guard.js", async (route) => {
    await fulfillScript(route, authGuardStub());
  });
  await page.route("**/data/runtime-config.js", async (route) => {
    await fulfillScript(route, configStub({ role }));
  });
  const fixture = backendFixture || createProtectedBackendFixture({
    role,
    fixtureScript: backendFixtureScript,
    notifications: localNotifications
  });
  if (backendFixture && localNotifications.length) {
    fixture.notifications.unshift(...localNotifications.map((item) => ({ ...item })));
  }
  await installProtectedBackend(page, fixture);
  if (dataServiceScript) {
    await page.route("**/data/data-service.js", async (route) => {
      await fulfillScript(route, dataServiceScript);
    });
  }
}

export async function writeAppTestStorage(page, { localNotifications = [] } = {}) {
  await page.goto("/");
  await page.evaluate(
    ({ key, session, notifications }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
      window.localStorage.setItem("versorgungs-kompass-notifications-v1", JSON.stringify(notifications));
    },
    { key: AUTH_KEY, session: authSession(), notifications: localNotifications }
  );
}

export async function gotoAuthenticated(page, path, options = {}) {
  await installAppTestSession(page, options);
  await writeAppTestStorage(page, options);
  await page.goto(path, { waitUntil: options.navigationWaitUntil || "load" });
  await expect(page).not.toHaveURL(/\/login\/login\.html/);
}
