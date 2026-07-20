import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const projectRoot = new URL("../", import.meta.url);

function assertIapSubjectContract() {
  const source = readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
  const start = source.indexOf("function canonicalIapSubject(");
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(start >= 0 && end > start, "Die kanonische IAP-Subject-Abbildung wurde nicht gefunden.");
  const sandbox = {};
  vm.runInNewContext([
    source.slice(start, end),
    "globalThis.canonicalIapSubjectForTest = canonicalIapSubject;"
  ].join("\n"), sandbox, { filename: "iap-subject-contract.js" });
  const canonicalIapSubject = sandbox.canonicalIapSubjectForTest;

  assert.equal(
    canonicalIapSubject("accounts.google.com:118133858486581853996"),
    "118133858486581853996",
    "Der signierte Google-IAP-Namespace muss exakt auf die stabile Google-Konto-ID abgebildet werden."
  );
  assert.equal(canonicalIapSubject("118133858486581853996"), "118133858486581853996");
  assert.equal(
    canonicalIapSubject("securetoken.google.com/example/tenant:external-subject"),
    "securetoken.google.com/example/tenant:external-subject",
    "Externe IAP-Subjects duerfen nicht namespace-los und damit kollisionsfaehig werden."
  );
  assert.equal(
    canonicalIapSubject("accounts.google.com:not-a-google-account-id"),
    "accounts.google.com:not-a-google-account-id",
    "Nur der eng definierte numerische Google-Konto-Identifier darf normalisiert werden."
  );
  for (const lookalike of [
    "accounts.google.com.evil:123",
    "Accounts.google.com:123",
    "accounts.google.com:123:456"
  ]) {
    assert.equal(canonicalIapSubject(lookalike), lookalike,
      `Ein IAP-Namespace-Lookalike darf nicht normalisiert werden: ${lookalike}`);
  }
  assert.match(
    source,
    /iapPayload\s*\?\s*canonicalIapSubject\(iapPayload\.sub\)\s*:\s*oidcPayload\?\.sub/u,
    "Nur das verifizierte IAP-Subject darf der Google-IAP-Namespace-Abbildung folgen."
  );
  assert.doesNotMatch(source, /canonicalIapSubject\(oidcPayload\?*\.sub\)/u,
    "Ein allgemeines OIDC-Subject darf nicht als Google-IAP-Subject normalisiert werden.");
}

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    }
  };
}

function assertIapLogoutContract() {
  const appUrl = new URL("https://versorgungs-kompass.example/frontend/app/versorgungs-kompass.html?view=team#profile");
  const apiBaseUrl = "https://versorgungs-kompass.example/";
  const bootstrapKey = "vk-iap-bootstrap:https://versorgungs-kompass.example";
  const authStorageKey = "versorgungs-kompass-auth-v1";
  const localStorage = createStorage({
    [authStorageKey]: JSON.stringify({ authenticated: true, expiresAt: Date.now() + 60_000 })
  });
  const sessionStorage = createStorage({ [bootstrapKey]: "1" });
  const location = {
    href: appUrl.href,
    origin: appUrl.origin,
    pathname: appUrl.pathname,
    search: appUrl.search,
    hash: appUrl.hash,
    replace() {
      throw new Error("Ein vorhandener IAP-Bootstrap-Marker darf keine Weiterleitung ausloesen.");
    }
  };
  const window = {
    VERSORGUNGS_COMPASS_CONFIG: {
      dataMode: "api",
      authMode: "iap",
      apiBaseUrl
    },
    location,
    localStorage,
    sessionStorage,
    history: {
      replaceState() {
        throw new Error("Die Test-URL enthaelt keinen IAP-Bootstrap-Parameter.");
      }
    }
  };
  const sandbox = {
    URL,
    URLSearchParams,
    console,
    window
  };

  vm.runInNewContext(readFileSync(new URL("frontend/login/auth-config.js", projectRoot), "utf8"), sandbox, {
    filename: "auth-config.js"
  });
  vm.runInNewContext(readFileSync(new URL("frontend/login/auth-guard.js", projectRoot), "utf8"), sandbox, {
    filename: "auth-guard.js"
  });

  const logoutUrl = new URL(window.VKAuth.buildLogoutUrl());
  assert.equal(logoutUrl.origin, appUrl.origin, "IAP-Logout muss auf dem geschuetzten App-Host bleiben.");
  assert.equal(logoutUrl.pathname, "/frontend/login/login.html");
  assert.equal(logoutUrl.searchParams.get("gcp-iap-mode"), "CLEAR_LOGIN_COOKIE");
  assert.deepEqual([...logoutUrl.searchParams.keys()], ["gcp-iap-mode"], "Alte App-Parameter duerfen nicht in die Logout-URL gelangen.");
  assert.equal(logoutUrl.hash, "#signed-out", "Die Login-Seite muss den expliziten Abmeldezustand erkennen koennen.");

  window.VKAuth.clearAuthenticated();
  assert.equal(localStorage.getItem(authStorageKey), null, "Der lokale App-Login muss geloescht werden.");
  assert.equal(sessionStorage.getItem(bootstrapKey), null, "Der IAP-Bootstrap-Marker muss geloescht werden.");

  let signedOutRedirect = "";
  const signedOutUrl = new URL("https://versorgungs-kompass.example/frontend/login/login.html#signed-out");
  const signedOutWindow = {
    VERSORGUNGS_COMPASS_CONFIG: window.VERSORGUNGS_COMPASS_CONFIG,
    location: {
      href: signedOutUrl.href,
      origin: signedOutUrl.origin,
      pathname: signedOutUrl.pathname,
      search: signedOutUrl.search,
      hash: signedOutUrl.hash,
      replace(value) {
        signedOutRedirect = String(value);
      }
    },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    history: { replaceState() {} }
  };
  const signedOutSandbox = { URL, URLSearchParams, console, window: signedOutWindow };
  vm.runInNewContext(readFileSync(new URL("frontend/login/auth-config.js", projectRoot), "utf8"), signedOutSandbox, {
    filename: "auth-config-signed-out.js"
  });
  vm.runInNewContext(readFileSync(new URL("frontend/login/auth-guard.js", projectRoot), "utf8"), signedOutSandbox, {
    filename: "auth-guard-signed-out.js"
  });
  assert.equal(signedOutRedirect, "", "Die explizite Abmeldeseite darf die API-IAP-Sitzung nicht sofort erneut bootstrappen.");
}

function assertLoginReturnUrlContract() {
  const source = readFileSync(new URL("frontend/login/auth-login.js", projectRoot), "utf8");
  const start = source.indexOf("  function isAllowedAppReturnPath(");
  const end = source.indexOf("\n  function isExplicitSignOutReturn(", start);
  assert.ok(start >= 0 && end > start, "Die Login-Rücksprungvalidierung wurde nicht gefunden.");
  const fallback = "../app/versorgungs-kompass.html";

  function resolveReturnTarget(target) {
    const loginUrl = new URL("https://versorgungs-kompass.example/frontend/login/login.html");
    if (target !== null) loginUrl.searchParams.set("return", target);
    const sandbox = {
      URL,
      URLSearchParams,
      auth: { getDefaultUrl: () => fallback },
      window: {
        location: {
          href: loginUrl.href,
          origin: loginUrl.origin,
          search: loginUrl.search
        }
      }
    };
    vm.runInNewContext([
      source.slice(start, end),
      "globalThis.getReturnUrlForTest = getReturnUrl;"
    ].join("\n"), sandbox, { filename: "auth-login-return-url.js" });
    return sandbox.getReturnUrlForTest();
  }

  assert.equal(
    resolveReturnTarget("../app/versorgungs-kompass.html?view=team#profile"),
    "https://versorgungs-kompass.example/frontend/app/versorgungs-kompass.html?view=team#profile"
  );
  assert.equal(resolveReturnTarget(null), fallback);
  for (const maliciousTarget of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//attacker.example/versorgungs-kompass.html",
    "\\\\attacker.example/versorgungs-kompass.html",
    "https://attacker.example/versorgungs-kompass.html",
    "/api/profile"
  ]) {
    assert.equal(resolveReturnTarget(maliciousTarget), fallback,
      `Manipuliertes Login-Ziel muss abgewiesen werden: ${maliciousTarget}`);
  }
}

async function assertApiAvatarContract() {
  const requests = [];
  const uploadedProfile = {
    id: "profile-current",
    email: "current@example.invalid",
    display_name: "Current User",
    initials: "CU",
    role: "editor",
    avatar_url: "/api/profile-avatar/profile-current"
  };
  const patchedProfile = {
    ...uploadedProfile,
    display_name: "Neuer Name",
    initials: "NN",
    team: "Versorgung",
    bio: "Kurzprofil"
  };
  const removedProfile = { ...patchedProfile, avatar_url: null };

  const fetch = async (url, options = {}) => {
    const request = {
      url: String(url),
      method: String(options.method || "GET").toUpperCase(),
      credentials: options.credentials,
      body: options.body
    };
    requests.push(request);
    if (request.url.endsWith("/api/profile/avatar") && request.method === "POST") {
      return {
        ok: true,
        status: 200,
        async json() {
          return { profile: uploadedProfile };
        }
      };
    }
    if (request.url.endsWith("/api/profile/avatar") && request.method === "DELETE") {
      return {
        ok: true,
        status: 200,
        async json() {
          return removedProfile;
        }
      };
    }
    if (request.url.endsWith("/api/profile") && request.method === "PATCH") {
      return {
        ok: true,
        status: 200,
        async json() {
          return patchedProfile;
        }
      };
    }
    throw new Error(`Unerwartete API-Anfrage: ${request.method} ${request.url}`);
  };

  const window = {
    VERSORGUNGS_COMPASS_CONFIG: {
      dataMode: "api",
      authMode: "iap",
      apiBaseUrl: "https://versorgungs-kompass.example",
      apiCredentials: "include",
      requireApiGateway: true
    },
    location: {
      origin: "https://versorgungs-kompass.example"
    },
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    }
  };
  const sandbox = {
    URL,
    URLSearchParams,
    fetch,
    console,
    window
  };
  vm.runInNewContext(readFileSync(new URL("frontend/data/data-service.js", projectRoot), "utf8"), sandbox, {
    filename: "data-service.js"
  });

  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const profile = await window.dataService.uploadCurrentProfileImage({
    name: "profil.png",
    type: "image/png",
    size: pngBytes.byteLength,
    async arrayBuffer() {
      return pngBytes.buffer;
    }
  });

  assert.equal(profile, uploadedProfile, "Der Upload muss das vom API-Gateway gelieferte Profil zurueckgeben.");
  assert.equal(requests.length, 1, "Nach erfolgreichem Avatar-Upload darf kein zweiter Profil-PATCH folgen.");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].credentials, "include");
  const uploadBody = JSON.parse(requests[0].body);
  assert.deepEqual(uploadBody, {
    fileName: "profil.png",
    contentType: "image/png",
    data: Buffer.from(pngBytes).toString("base64")
  });

  const cachedProfile = await window.dataService.getCurrentProfile();
  assert.equal(cachedProfile, uploadedProfile, "Das aktualisierte Profil muss ohne zusaetzlichen GET im Cache liegen.");
  assert.equal(requests.length, 1);

  const updated = await window.dataService.updateCurrentProfile({
    id: uploadedProfile.id,
    email: uploadedProfile.email,
    role: "admin",
    active: false,
    displayName: " Neuer Name ",
    initials: " nn ",
    team: " Versorgung ",
    bio: " Kurzprofil ",
    avatarUrl: "https://attacker.example/avatar.png",
    avatar_url: "https://attacker.example/avatar-legacy.png",
    injected: "nicht erlaubt"
  });
  assert.equal(updated, patchedProfile);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, "PATCH");
  assert.deepEqual(JSON.parse(requests[1].body), {
    displayName: "Neuer Name",
    initials: "NN",
    team: "Versorgung",
    bio: "Kurzprofil"
  }, "Der Profil-PATCH darf nur die vier editierbaren Textfelder enthalten.");

  const removed = await window.dataService.removeCurrentProfileImage();
  assert.equal(removed, removedProfile);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].method, "DELETE");
  assert.equal(requests[2].credentials, "include");
  assert.equal(await window.dataService.getCurrentProfile(), removedProfile,
    "Nach dem Entfernen darf der aktuelle Profil-Cache kein altes Avatar mehr liefern.");
  assert.equal(requests.length, 3, "Die Cache-Prüfung darf keinen zusätzlichen GET auslösen.");
}

assertIapSubjectContract();
assertIapLogoutContract();
assertLoginReturnUrlContract();
await assertApiAvatarContract();

console.log("Auth/Avatar Contract Test OK: IAP-Logout, Bootstrap-Cleanup, Avatar-Upload und Profil-Allowlist sind abgesichert.");
