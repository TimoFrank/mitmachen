const ALLOWED_PARAMETERS = new Set([
  "apiKey",
  "continueUrl",
  "lang",
  "mode",
  "oobCode"
]);
const ACTION_CODE_PATTERN = /^[A-Za-z0-9_-]{20,1024}$/;

export function parseActionUrl(input, config) {
  const url = new URL(input);

  for (const [name] of url.searchParams) {
    if (!ALLOWED_PARAMETERS.has(name)) {
      throw new Error("Der Link enthält nicht unterstützte Parameter.");
    }
    if (url.searchParams.getAll(name).length !== 1) {
      throw new Error("Der Link enthält einen Parameter mehrfach.");
    }
  }

  const mode = url.searchParams.get("mode");
  const apiKey = url.searchParams.get("apiKey");
  const oobCode = url.searchParams.get("oobCode");
  const language = url.searchParams.get("lang");

  if (mode !== "resetPassword") {
    throw new Error("Diese Kontoaktion wird nicht unterstützt.");
  }
  if (apiKey !== config.firebase.apiKey) {
    throw new Error("Der Link gehört nicht zu dieser Umgebung.");
  }
  if (!oobCode || !ACTION_CODE_PATTERN.test(oobCode)) {
    throw new Error("Der Aktionscode ist ungültig.");
  }
  if (language && language !== "de") {
    throw new Error("Die angeforderte Sprache wird nicht unterstützt.");
  }

  const continueValue = url.searchParams.get("continueUrl");
  let continueUrl = null;
  if (continueValue) {
    const candidate = new URL(continueValue);
    if (
      candidate.protocol !== "https:" ||
      candidate.username ||
      candidate.password ||
      !config.allowedContinueOrigins.includes(candidate.origin) ||
      candidate.href !== `${candidate.origin}/start`
    ) {
      throw new Error("Das Weiterleitungsziel ist nicht zulässig.");
    }
    continueUrl = candidate.href;
  }

  return Object.freeze({ apiKey, continueUrl, mode, oobCode });
}

export function validatePassword(password) {
  return Object.freeze({
    length: password.length >= 14 && password.length <= 128,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9\s]/.test(password)
  });
}

export function isPasswordValid(password) {
  return Object.values(validatePassword(password)).every(Boolean);
}
