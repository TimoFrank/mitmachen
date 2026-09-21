import { assertIapExternalAccessWindow, assertIapExternalIdentityClaims } from "./security-policy.mjs";

const reject = (status = 401) => Object.assign(new Error("Die Anmeldung konnte nicht sicher bestätigt werden."), { status });
export const GOOGLE_SESSION_SECONDS = 8 * 60 * 60;

export function assertGoogleHostingEnvironment(env) {
  if (env.GOOGLE_HOSTING_ENABLED !== "1" || ["FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST"].some((name) => env[name])) {
    throw new Error("Google Hosting benötigt echte Google-Dienste und darf keine Emulatoren verwenden.");
  }
}

export function sessionCookie(request) {
  const cookies = String(request.headers.cookie || "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith("__session="));
  if (matches.length !== 1) throw reject();
  const value = matches[0].slice("__session=".length);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value) || value.length > 16_000) throw reject();
  return value;
}

export function setSessionCookie(response, cookie, seconds = GOOGLE_SESSION_SECONDS) {
  response.setHeader("set-cookie", `__session=${cookie}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`);
}

export function assertGoogleBrowserMutation(request, origin) {
  if (request.headers.origin !== origin
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(String(request.headers["content-type"] || ""))
    || (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin")) {
    throw reject(403);
  }
}

// Firebase validates signature, issuer, audience, expiry, revocation and user
// disablement. Only then is the project's stable UID mapped to the exact
// existing IAP external binding. Email never selects or creates a profile.
export function createGoogleSessions({ auth, state, configuration, now = Date.now }) {
  function bindingClaims(claims, kind) {
    assertIapExternalAccessWindow(configuration, { nowMs: now() });
    const project = configuration.iapGcipProjectId;
    const expectedIssuer = kind === "session"
      ? `https://session.firebase.google.com/${project}`
      : `https://securetoken.google.com/${project}`;
    if (claims.iss !== expectedIssuer || claims.aud !== project || claims.sub !== claims.uid) throw reject();
    const namespace = `securetoken.google.com/${project}${configuration.iapGcipTenantId ? `/${configuration.iapGcipTenantId}` : ""}`;
    const payload = {
      iss: "https://cloud.google.com/iap",
      sub: `${namespace}:${claims.sub}`,
      email: `${namespace}:${claims.email}`,
      gcip: claims
    };
    const identity = assertIapExternalIdentityClaims(payload, configuration, { nowMs: now() });
    return { payload, identity };
  }
  return Object.freeze({
    async verify(request) {
      if (request.googleVerifiedIdentity) return request.googleVerifiedIdentity.payload;
      const cookie = sessionCookie(request);
      let claims;
      try { claims = await auth.verifySessionCookie(cookie, true); }
      catch { throw reject(); }
      if (await state.isRevoked(cookie)) throw reject();
      const verified = bindingClaims(claims, "session");
      request.googleVerifiedIdentity = verified;
      request.iapExternalIdentity = verified.identity;
      return verified.payload;
    },
    async create(idToken) {
      if (typeof idToken !== "string" || idToken.length > 16_000) throw reject();
      let claims;
      try { claims = await auth.verifyIdToken(idToken, true); }
      catch { throw reject(); }
      bindingClaims(claims, "id");
      const authTime = Number(claims.auth_time);
      if (!Number.isFinite(authTime) || authTime > now() / 1000 + 30 || now() / 1000 - authTime > 300) throw reject();
      const expiresIn = Math.min(GOOGLE_SESSION_SECONDS * 1000, configuration.iapExternalAccessExpiresAtMs - now());
      if (expiresIn < 300_000) throw reject(403);
      const cookie = await auth.createSessionCookie(idToken, { expiresIn });
      return { cookie, seconds: Math.floor(expiresIn / 1000) };
    },
    async logout(request) {
      let cookie;
      try { cookie = sessionCookie(request); } catch { return; }
      try { bindingClaims(await auth.verifySessionCookie(cookie, true), "session"); }
      catch { return; }
      await state.revoke(cookie);
    }
  });
}
