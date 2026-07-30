const PLACEHOLDER_PREFIX = "REPLACE_";

export function getPortalConfig() {
  return window.IDENTITY_PORTAL_CONFIG ?? {};
}

export function isLoopbackHost(hostname = window.location.hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isLocalPreview(config, expectedValue) {
  const preview = new URL(window.location.href).searchParams.get("preview");
  return Boolean(
    config.enableLocalPreview &&
      isLoopbackHost() &&
      preview === expectedValue
  );
}

export function assertSafeFirebaseDefaults(
  cookie = document.cookie,
  injectedDefaults = globalThis.__FIREBASE_DEFAULTS__
) {
  const hasFirebaseDefaults = cookie
    .split(";")
    .map((entry) => entry.trim().split("=", 1)[0])
    .includes("__FIREBASE_DEFAULTS__");

  if (hasFirebaseDefaults || injectedDefaults !== undefined) {
    throw new Error("Nicht erwartete Firebase-Standardkonfiguration erkannt.");
  }
}

export function assertProductionConfig(config) {
  const firebase = config.firebase ?? {};
  const required = [firebase.apiKey, firebase.authDomain, firebase.projectId];

  if (
    required.some(
      (value) =>
        typeof value !== "string" ||
        !value.trim() ||
        value.includes(PLACEHOLDER_PREFIX)
    )
  ) {
    throw new Error("Die Identity-Platform-Konfiguration ist unvollständig.");
  }

  if (!Array.isArray(config.allowedContinueOrigins) || config.allowedContinueOrigins.length === 0) {
    throw new Error("Es ist kein zulässiges Weiterleitungsziel konfiguriert.");
  }

  for (const origin of config.allowedContinueOrigins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) {
      throw new Error("Weiterleitungsziele müssen exakte HTTPS-Origins sein.");
    }
  }

  return config;
}
