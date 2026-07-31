export const PASSWORD_RESET_BROKER_PATH = "/api/auth/password-reset";

export async function requestPasswordResetEmail(
  email,
  { fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}
) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch ist nicht verfügbar.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(PASSWORD_RESET_BROKER_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: String(email || "").trim() }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 202) throw new Error("Passwort-Reset wurde nicht angenommen.");
  const responseText = await response.text();
  if (responseText.length > 1024) throw new Error("Passwort-Reset-Antwort ist ungültig.");

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("Passwort-Reset-Antwort ist ungültig.");
  }
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || payload.accepted !== true
    || Object.keys(payload).length !== 1
  ) {
    throw new Error("Passwort-Reset-Antwort ist ungültig.");
  }
}
