export const PASSWORD_INVITATION_BROKER_PATH = "/api/auth/password-reset";

const INVITATION_FRAGMENT_KEY = "einladung";
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MAX_RESPONSE_BYTES = 4096;
const PASSWORD_ACTION_ORIGIN = "https://versorgungs-kompass.de";
const PASSWORD_ACTION_PATH = "/konto/passwort-festlegen";
export const PASSWORD_INVITATION_TIMEOUT_MS = 50_000;

export class TemporaryPasswordInvitationError extends Error {
  constructor() {
    super(
      "Die Einladung konnte wegen einer technischen Störung nicht verarbeitet werden."
    );
    this.name = "TemporaryPasswordInvitationError";
  }
}

const DEFINITIVE_FIREBASE_PASSWORD_ACTION_ERRORS = new Set([
  "auth/expired-action-code",
  "auth/invalid-action-code",
  "auth/user-disabled",
  "auth/user-not-found"
]);

export function isTemporaryPasswordActionError(error) {
  if (error instanceof TemporaryPasswordInvitationError) return true;
  const code = String(error?.code || "");
  return code.startsWith("auth/")
    && !DEFINITIVE_FIREBASE_PASSWORD_ACTION_ERRORS.has(code);
}

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

async function postPasswordInvitation(
  token,
  requestBody,
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
    try {
      response = await fetchImpl(PASSWORD_INVITATION_BROKER_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
    } catch {
      throw new TemporaryPasswordInvitationError();
    }
    if (
      response.status === 408
      || response.status === 429
      || (response.status >= 500 && response.status <= 599)
    ) {
      throw new TemporaryPasswordInvitationError();
    }
    if (response.status === 400) {
      throw new Error("Die Einladung ist ungültig oder abgelaufen.");
    }
    if (response.status !== 200) throw new TemporaryPasswordInvitationError();
    try {
      responseText = await response.text();
    } catch {
      throw new TemporaryPasswordInvitationError();
    }
  } finally {
    clearTimeout(timeout);
  }

  if (responseText.length === 0 || responseText.length > MAX_RESPONSE_BYTES) {
    throw new TemporaryPasswordInvitationError();
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new TemporaryPasswordInvitationError();
  }
  return payload;
}

export async function redeemPasswordInvitation(token, options = {}) {
  const payload = await postPasswordInvitation(
    token,
    { invitationToken: token },
    options
  );
  if (
    payload
    && typeof payload === "object"
    && !Array.isArray(payload)
    && payload.redeemed === true
    && typeof payload.actionUrl === "string"
    && payload.actionUrl.length > 0
    && payload.actionUrl.length <= 3072
    && Object.keys(payload).sort().join(",") === "actionUrl,redeemed"
  ) {
    return Object.freeze({ actionUrl: payload.actionUrl });
  }
  if (
    payload
    && typeof payload === "object"
    && !Array.isArray(payload)
    && payload.redeemed === true
    && payload.completed === true
    && Object.keys(payload).sort().join(",") === "completed,redeemed"
  ) {
    return Object.freeze({ completed: true });
  }
  throw new TemporaryPasswordInvitationError();
}

export async function finalizePasswordInvitation(token, options = {}) {
  const payload = await postPasswordInvitation(
    token,
    { invitationToken: token, finalize: true },
    options
  );
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || typeof payload.finalized !== "boolean"
    || Object.keys(payload).join(",") !== "finalized"
  ) {
    throw new TemporaryPasswordInvitationError();
  }
  return Object.freeze({ finalized: payload.finalized });
}
