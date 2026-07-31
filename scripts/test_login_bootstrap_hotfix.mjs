import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const projectRoot = new URL("../", import.meta.url);
const dataServiceSource = readFileSync(
  new URL("frontend/data/data-service.js", projectRoot),
  "utf8"
);
const appSource = readFileSync(
  new URL("frontend/app/versorgungs-kompass.js", projectRoot),
  "utf8"
);
const publicEntrySource = readFileSync(
  new URL("frontend/public-entry/index.html", projectRoot),
  "utf8"
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function withDeadline(promise, message, timeoutMs = 500) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function loadDataService(fetchImplementation, timeoutMs = 25, reauthenticateIapSession = () => false) {
  const window = {
    VERSORGUNGS_COMPASS_CONFIG: {
      apiBaseUrl: "https://versorgungs-kompass.example",
      apiCredentials: "include",
      apiRequestTimeoutMs: timeoutMs,
      authMode: "iap",
      dataMode: "api"
    },
    location: {
      origin: "https://versorgungs-kompass.example"
    },
    VKAuth: { reauthenticateIapSession }
  };
  const sandbox = {
    AbortController,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: fetchImplementation,
    setTimeout,
    window
  };
  vm.runInNewContext(dataServiceSource, sandbox, {
    filename: "frontend/data/data-service.js"
  });
  return window.dataService;
}

async function assertApiRequestErrorContract() {
  assert.match(
    dataServiceSource,
    /API_REQUEST_TIMEOUT_MS\s*=\s*[^;]+:\s*15e3/u,
    "Der produktive API-Timeout muss standardmaessig etwa 15 Sekunden betragen."
  );

  let unauthorizedOptions;
  let reauthenticationCalls = 0;
  const unauthorizedService = loadDataService(async (_url, options) => {
    unauthorizedOptions = options;
    return {
      ok: false,
      status: 401,
      json: async () => ({
        code: "AUTH_REQUIRED",
        error: "Anmeldung erforderlich."
      })
    };
  }, 25, () => {
    reauthenticationCalls += 1;
    return true;
  });
  await assert.rejects(
    unauthorizedService.getCurrentProfile(),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.code, "AUTH_REQUIRED");
      return true;
    },
    "HTTP-Status und API-Code muessen fuer die Authentifizierungsentscheidung erhalten bleiben."
  );
  assert.equal(
    unauthorizedOptions.headers["X-Requested-With"],
    "XMLHttpRequest",
    "IAP muss abgelaufene AJAX-Sitzungen als 401 statt als Login-HTML-Redirect beantworten."
  );
  assert.equal(reauthenticationCalls, 1, "Ein IAP-401 muss genau einen expliziten Reauthentifizierungs-Redirect anstossen.");

  const timedOutService = loadDataService(async (_url, options) => ({
    ok: true,
    status: 200,
    json: () => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("body aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  }));
  await assert.rejects(
    withDeadline(
      timedOutService.getCurrentProfile(),
      "Der API-Gesamttimeout wurde nicht ausgeloest."
    ),
    (error) => {
      assert.equal(error.status, 0);
      assert.equal(error.code, "API_TIMEOUT");
      return true;
    },
    "Der Timeout muss auch das Einlesen des Response-Bodys begrenzen."
  );

  const offlineService = loadDataService(async () => {
    throw new Error("offline");
  });
  await assert.rejects(
    offlineService.getCurrentProfile(),
    (error) => {
      assert.equal(error.status, 0);
      assert.equal(error.code, "API_NETWORK_ERROR");
      return true;
    },
    "Netzwerkfehler muessen strukturiert an die Startlogik weitergereicht werden."
  );
}

function initializeDataSource() {
  const startMarker = "      async function initializeData() {";
  const endMarker = "\n      function finishInitialLoading()";
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  assert.notEqual(start, -1, "initializeData wurde im App-Bundle nicht gefunden.");
  assert.notEqual(end, -1, "Das Ende von initializeData wurde im App-Bundle nicht gefunden.");
  return appSource.slice(start, end);
}

function createInitializeHarness({
  coreError = null,
  corePromise = null,
  profilePromise = null,
  settingsPromise,
  shouldRequireOnboarding = () => false
}) {
  const finished = deferred();
  const state = {
    appliedSettings: [],
    finishCalls: 0,
    finishOnboardingCalls: 0,
    criticalLoadCalls: 0,
    loginCleared: false,
    onboardingOpenCalls: 0,
    redirect: "",
    resumedOnboardingStep: "",
    storageStatus: "",
    updateViewCalls: 0
  };
  const quietConsole = {
    error() {},
    log() {},
    warn() {}
  };
  const context = {
    CLEAN_URLS_ENABLED: false,
    activeView: "home",
    console: quietConsole,
    contacts: [ { id: "existing" } ],
    finishInitialLoading() {
      state.finishCalls += 1;
      finished.resolve();
    },
    initialDataLoadingSlow: true,
    isInitialDataLoading: true,
    ensureCriticalInitialData: async () => {
      state.criticalLoadCalls += 1;
      if (corePromise) await corePromise;
      if (coreError) throw coreError;
    },
    loadCriticalInitialData: async () => {
      if (coreError) throw coreError;
    },
    applyLoadedUserSettings(settings) {
      context.userSettings = settings;
      state.appliedSettings.push(settings);
    },
    fetchUserSettings: () => settingsPromise,
    finishOnboarding: async () => {
      state.finishOnboardingCalls += 1;
      context.onboardingActive = false;
    },
    loadedContactsFromStorage: true,
    onboardingActive: false,
    onboardingPreferences: () => context.userSettings?.preferences?.onboarding || {},
    onboardingResumeStep: (onboarding = {}) => onboarding.currentStep || "welcome",
    openOnboarding: async () => {
      state.onboardingOpenCalls += 1;
      context.onboardingActive = true;
    },
    organizations: [ { id: "existing" } ],
    renderAccountProfile(profile) {
      context.currentProfile = profile;
    },
    restoreSidebarState() {},
    routeTokenFromLocation: () => "",
    routeViewFromLocation: () => "home",
    scheduleDeferredInitialData() {},
    setActiveView(view) {
      state.activeView = view;
    },
    setOnboardingStep(step) {
      state.resumedOnboardingStep = step;
    },
    setStorageStatus(message) {
      state.storageStatus = message;
    },
    shouldRequireInitialOnboarding: () => shouldRequireOnboarding(context),
    teamDirectoryState: "loading",
    transientInitialHomeSidebarCollapse: false,
    userSettings: null,
    userSettingsWriteRevision: 0,
    updateRouteHash() {},
    updateView() {
      state.updateViewCalls += 1;
    },
    window: {
      clearTimeout,
      setTimeout,
      VKAuth: {
        buildLoginUrl: () => "/frontend/login/login.html",
        clearAuthenticated() {
          state.loginCleared = true;
        }
      },
      dataService: {
        getCurrentProfile: async () => profilePromise || ({
          id: "profile-1",
          created_at: "2026-01-01T00:00:00.000Z"
        }),
        isConfigured: () => true
      },
      location: {
        replace(url) {
          state.redirect = url;
        }
      }
    }
  };
  vm.runInNewContext(
    `${initializeDataSource()}\nglobalThis.__initializeData = initializeData;`,
    context,
    { filename: "initialize-data-contract.js" }
  );
  return {
    context,
    finished: finished.promise,
    initialize: context.__initializeData,
    state
  };
}

async function assertSettingsDoNotBlockShell() {
  const settings = deferred();
  const harness = createInitializeHarness({ settingsPromise: settings.promise });
  let initializationSettled = false;
  const initialization = harness.initialize().finally(() => {
    initializationSettled = true;
  });

  await withDeadline(
    harness.finished,
    "Die App-Shell wurde durch noch ausstehende Benutzereinstellungen blockiert.",
    1000
  );
  await initialization;
  assert.equal(initializationSettled, true);
  assert.equal(harness.state.finishCalls, 1);
  assert.equal(harness.state.criticalLoadCalls, 1);

  settings.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    harness.state.updateViewCalls,
    3,
    "Nachlaufende Einstellungen muessen die bereits sichtbare Ansicht einmal gezielt aktualisieren."
  );
}

async function assertQuickSettingsKeepSkeletonUntilCriticalData() {
  const core = deferred();
  const harness = createInitializeHarness({
    corePromise: core.promise,
    settingsPromise: Promise.resolve()
  });
  const initialization = harness.initialize();

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(harness.state.criticalLoadCalls, 1);
  assert.equal(
    harness.state.finishCalls,
    0,
    "Schnelle Benutzereinstellungen duerfen das Skeleton nicht vor den kritischen Daten freigeben."
  );

  core.resolve();
  await initialization;
  assert.equal(harness.state.finishCalls, 1);
}

async function assertSettingsFailuresFallBackWithoutDiscardingCoreData() {
  const backendError = new Error("Benutzereinstellungen voruebergehend nicht erreichbar.");
  backendError.status = 503;
  backendError.code = "API_HTTP_503";
  const harness = createInitializeHarness({
    settingsPromise: Promise.reject(backendError)
  });

  await harness.initialize();
  assert.equal(harness.state.criticalLoadCalls, 1);
  assert.equal(harness.state.finishCalls, 1);
  assert.equal(harness.state.redirect, "");
  assert.equal(harness.state.loginCleared, false);
}

function onboardingRequiredUntilComplete(context) {
  return !context.userSettings?.preferences?.onboarding?.completedAt;
}

async function assertLateSettingsResumeOnboarding() {
  const settings = deferred();
  const harness = createInitializeHarness({
    settingsPromise: settings.promise,
    shouldRequireOnboarding: onboardingRequiredUntilComplete
  });

  await harness.initialize();
  assert.equal(harness.state.onboardingOpenCalls, 1);
  assert.equal(harness.state.criticalLoadCalls, 0);

  settings.resolve({
    preferences: {
      onboarding: { currentStep: "team" }
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.state.appliedSettings.length, 1);
  assert.equal(harness.state.resumedOnboardingStep, "team");
  assert.equal(harness.state.finishOnboardingCalls, 0);
}

async function assertLateCompletedSettingsCloseFallbackOnboarding() {
  const settings = deferred();
  const harness = createInitializeHarness({
    settingsPromise: settings.promise,
    shouldRequireOnboarding: onboardingRequiredUntilComplete
  });

  await harness.initialize();
  assert.equal(harness.state.onboardingOpenCalls, 1);

  settings.resolve({
    preferences: {
      onboarding: { completedAt: "2026-07-31T08:00:00.000Z" }
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.state.appliedSettings.length, 1);
  assert.equal(harness.state.finishOnboardingCalls, 1);
  assert.equal(harness.context.onboardingActive, false);
}

async function assertLateSettingsCannotOverwriteNewerWrite() {
  const settings = deferred();
  const harness = createInitializeHarness({
    settingsPromise: settings.promise,
    shouldRequireOnboarding: onboardingRequiredUntilComplete
  });

  await harness.initialize();
  harness.context.userSettingsWriteRevision += 1;
  harness.context.userSettings = {
    preferences: {
      onboarding: { currentStep: "identity" }
    }
  };

  settings.resolve({
    preferences: {
      onboarding: { completedAt: "2026-07-30T08:00:00.000Z" }
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.state.appliedSettings.length, 0);
  assert.equal(harness.state.finishOnboardingCalls, 0);
  assert.equal(harness.context.userSettings.preferences.onboarding.currentStep, "identity");
}

async function assertNonAuthFailuresStillRevealShell() {
  const settings = deferred();
  const backendError = new Error("Backend voruebergehend nicht erreichbar.");
  backendError.status = 503;
  backendError.code = "API_HTTP_503";
  const harness = createInitializeHarness({
    coreError: backendError,
    settingsPromise: settings.promise
  });
  const initialization = harness.initialize();

  await withDeadline(
    harness.finished,
    "Die App-Shell blieb nach einem Nicht-Auth-Fehler verborgen.",
    1000
  );
  await initialization;
  assert.equal(harness.state.finishCalls, 1);
  assert.equal(harness.state.redirect, "");
  assert.equal(harness.state.loginCleared, false);

  settings.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(harness.state.storageStatus, /Keine geschützten Kontaktdaten verfügbar/u);
}

async function assertStructuredUnauthorizedRedirects() {
  const backendError = new Error("Zugriff verweigert.");
  backendError.status = 401;
  backendError.code = "AUTH_REQUIRED";
  const harness = createInitializeHarness({
    coreError: backendError,
    settingsPromise: Promise.resolve()
  });

  await harness.initialize();
  assert.equal(harness.state.loginCleared, true);
  assert.equal(harness.state.redirect, "/frontend/login/login.html");
  assert.equal(
    harness.state.finishCalls,
    0,
    "Bei einer Auth-Weiterleitung darf die alte Shell nicht kurz eingeblendet werden."
  );
}

async function assertStructuredForbiddenRedirects() {
  const backendError = new Error("Zugriff verweigert.");
  backendError.status = 403;
  backendError.code = "API_HTTP_403";
  const harness = createInitializeHarness({
    coreError: backendError,
    settingsPromise: Promise.resolve()
  });

  await harness.initialize();
  assert.equal(harness.state.loginCleared, false);
  assert.equal(harness.state.redirect, "/#zugriff-verweigert");
  assert.equal(
    harness.state.finishCalls,
    0,
    "Bei einer 403-Weiterleitung darf die geschützte Shell nicht kurz eingeblendet werden."
  );
}

async function assertImmediateSettingsUnauthorizedRedirects() {
  const settingsError = new Error("Anmeldung erforderlich.");
  settingsError.status = 401;
  settingsError.code = "AUTH_REQUIRED";
  const harness = createInitializeHarness({
    settingsPromise: Promise.reject(settingsError)
  });

  await harness.initialize();
  assert.equal(harness.state.loginCleared, true);
  assert.equal(harness.state.redirect, "/frontend/login/login.html");
  assert.equal(harness.state.criticalLoadCalls, 0);
  assert.equal(harness.state.finishCalls, 0);
}

async function assertLateSettingsForbiddenRedirects() {
  const settings = deferred();
  const settingsError = new Error("Zugriff verweigert.");
  settingsError.status = 403;
  settingsError.code = "API_HTTP_403";
  const harness = createInitializeHarness({ settingsPromise: settings.promise });

  await harness.initialize();
  assert.equal(harness.state.finishCalls, 1);
  settings.reject(settingsError);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.state.loginCleared, false);
  assert.equal(harness.state.redirect, "/#zugriff-verweigert");
}

async function assertKnownSettingsAuthFailureWinsOverProfileBackendFailure() {
  const profile = deferred();
  const settings = deferred();
  const settingsError = new Error("Anmeldung erforderlich.");
  settingsError.status = 401;
  settingsError.code = "AUTH_REQUIRED";
  const profileError = new Error("Profil vorübergehend nicht erreichbar.");
  profileError.status = 503;
  profileError.code = "API_HTTP_503";
  const harness = createInitializeHarness({
    profilePromise: profile.promise,
    settingsPromise: settings.promise
  });
  const initialization = harness.initialize();

  settings.reject(settingsError);
  profile.reject(profileError);
  await initialization;

  assert.equal(harness.state.loginCleared, true);
  assert.equal(harness.state.redirect, "/frontend/login/login.html");
  assert.equal(harness.state.finishCalls, 0);
}

function assertPublicLoginBootstrapContract() {
  const expectedHref = 'href="/start"';
  assert.equal(
    publicEntrySource.split(expectedHref).length - 1,
    1,
    "Die oeffentliche Hauptseite muss exakt einmal den parametrisierten IAP-Login ueber die geschuetzte Ressource ausloesen."
  );
  assert.match(publicEntrySource, /data-public-login-button/);
  assert.doesNotMatch(
    publicEntrySource,
    /data-google-sso-button|\/api\/auth\/bootstrap/,
    "Der Root-CTA darf weder den alten Google-only-Marker noch den direkten IAP-Bootstrap verwenden."
  );
  assert.match(publicEntrySource, /id="zugriff-verweigert"[\s\S]*role="alert"/);
  assert.doesNotMatch(publicEntrySource, /Testzugang aktivieren|enrollment\.html/);
}

await assertApiRequestErrorContract();
await assertSettingsDoNotBlockShell();
await assertQuickSettingsKeepSkeletonUntilCriticalData();
await assertSettingsFailuresFallBackWithoutDiscardingCoreData();
await assertLateSettingsResumeOnboarding();
await assertLateCompletedSettingsCloseFallbackOnboarding();
await assertLateSettingsCannotOverwriteNewerWrite();
await assertNonAuthFailuresStillRevealShell();
await assertStructuredUnauthorizedRedirects();
await assertStructuredForbiddenRedirects();
await assertImmediateSettingsUnauthorizedRedirects();
await assertLateSettingsForbiddenRedirects();
await assertKnownSettingsAuthFailureWinsOverProfileBackendFailure();
assertPublicLoginBootstrapContract();

console.log("Login-Bootstrap- und Startzeit-Hotfix-Vertraege sind konsistent.");
