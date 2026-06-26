import { expect } from "@playwright/test";

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
      getDefaultUrl: () => "../app/versorgungs-kompass.html"
    };
  `;
}

function configStub({ role, dataMode }) {
  return `window.VERSORGUNGS_COMPASS_CONFIG = { dataMode: ${JSON.stringify(dataMode)}, demoRole: ${JSON.stringify(role)} };`;
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
    dataMode = "demo",
    contactsScript = "",
    expertsScript = "",
    patientsScript = "",
    stakeholderScript = "",
    demoDataScript = "",
    dataServiceScript = ""
  } = {}
) {
  await page.route("**/login/auth-guard.js", async (route) => {
    await fulfillScript(route, authGuardStub());
  });
  await page.route("**/data/supabase-config.js", async (route) => {
    await fulfillScript(route, configStub({ role, dataMode }));
  });
  if (contactsScript) {
    await page.route("**/data/versorgungs-kompass-data.js", async (route) => {
      await fulfillScript(route, contactsScript);
    });
  }
  if (expertsScript) {
    await page.route("**/data/expertenkreis-data.js", async (route) => {
      await fulfillScript(route, expertsScript);
    });
  }
  if (patientsScript) {
    await page.route("**/data/patienten-data.js", async (route) => {
      await fulfillScript(route, patientsScript);
    });
  }
  if (stakeholderScript) {
    await page.route("**/data/stakeholder-data.js", async (route) => {
      await fulfillScript(route, stakeholderScript);
    });
  }
  if (demoDataScript) {
    await page.route("**/data/demo-data.js", async (route) => {
      await fulfillScript(route, demoDataScript);
    });
  }
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
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/login\/login\.html/);
}
