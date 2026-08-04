export const PASSWORD_INVITATION_BROKER_PATH = "/api/auth/password-reset";

const INVITATION_FRAGMENT_KEY = "einladung";
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MAX_RESPONSE_BYTES = 4096;
const PASSWORD_ACTION_ORIGIN = "https://versorgungs-kompass.de";
const PASSWORD_ACTION_PATH = "/konto/passwort-festlegen";
export const PASSWORD_INVITATION_TIMEOUT_MS = 50_000;

export function parsePasswordInvitationUrl(input) {
  const url = new URL(input);
  if (
    url.origin !== PASSWORD_ACTION_ORIGIN
    || url.pathname !== PASSWORD_ACTION_PATH
    || url.username
    || url.password
    || url.search
    || !url.hash.startsWith("#")
    || url.href !== input
  ) {
    throw new Error("Der Einladungslink ist ungültig.");
  }
  const fragment = new URLSearchParams(url.hash.slice(1));
  const names = [...fragment.keys()];
  const token = fragment.get(INVITATION_FRAGMENT_KEY);
  if (
    names.length !== 1
    || names[0] !== INVITATION_FRAGMENT_KEY
    || fragment.getAll(INVITATION_FRAGMENT_KEY).length !== 1
    || !INVITATION_TOKEN_PATTERN.test(token || "")
    || url.hash !== `#${INVITATION_FRAGMENT_KEY}=${token}`
  ) {
    throw new Error("Der Einladungslink ist ungültig.");
  }
  return Object.freeze({ token });
}

export async function redeemPasswordInvitation(
  token,
  { fetchImpl = globalThis.fetch, timeoutMs = PASSWORD_INVITATION_TIMEOUT_MS } = {}
) {
  if (!INVITATION_TOKEN_PATTERN.test(String(token || ""))) {
    throw new Error("Die Einladung ist ungültig.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch ist nicht verfügbar.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let responseText;
  try {
    response = await fetchImpl(PASSWORD_INVITATION_BROKER_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationToken: token }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    if (response.status !== 200) {
      throw new Error("Die Einladung konnte nicht eingelöst werden.");
    }
    responseText = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  if (responseText.length === 0 || responseText.length > MAX_RESPONSE_BYTES) {
    throw new Error("Die Einladungsantwort ist ungültig.");
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("Die Einladungsantwort ist ungültig.");
  }
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || payload.redeemed !== true
    || typeof payload.actionUrl !== "string"
    || payload.actionUrl.length === 0
    || payload.actionUrl.length > 3072
    || Object.keys(payload).sort().join(",") !== "actionUrl,redeemed"
  ) {
    throw new Error("Die Einladungsantwort ist ungültig.");
  }
  return Object.freeze({ actionUrl: payload.actionUrl });
}
