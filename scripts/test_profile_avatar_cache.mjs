import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../api/server.mjs", import.meta.url), "utf8");
const helpersStart = source.indexOf("function canonicalProfileAvatarVersion(");
const helpersEnd = source.indexOf("\nasync function deleteProfileAvatarObject(", helpersStart);
const readerStart = source.indexOf("async function readProfileAvatar(");
const readerEnd = source.indexOf("\nasync function readContactImage(", readerStart);

assert.ok(helpersStart >= 0 && helpersEnd > helpersStart, "Profilfoto-Cache-Helfer wurden nicht gefunden.");
assert.ok(readerStart >= 0 && readerEnd > readerStart, "Profilfoto-Reader wurde nicht gefunden.");

const state = {
  authCalls: 0,
  profileCalls: 0,
  storageReads: 0,
  activeOnly: null,
  authError: null,
  objectName: "profile-images/profile-current/avatar-123e4567-e89b-42d3-a456-426614174000.png",
  profile: {
    id: "profile-current",
    active: true,
    avatar_url: "gs://profile-images-test/profile-images/profile-current/avatar-123e4567-e89b-42d3-a456-426614174000.png",
    updated_at: new Date("2026-07-27T10:20:30.123Z")
  }
};
const image = Buffer.from("profile-avatar-bytes");

const sandbox = {
  Buffer,
  URL,
  crypto,
  PROFILE_IMAGE_BUCKET: "profile-images-test",
  state,
  async authorizeRequest() {
    state.authCalls += 1;
    if (state.authError) throw state.authError;
  },
  async rawProfileAvatarRow(_request, _profileId, options) {
    state.profileCalls += 1;
    state.activeOnly = options?.activeOnly;
    return state.profile;
  },
  profileAvatarObjectName() {
    return state.objectName;
  },
  async readStorageObject() {
    state.storageReads += 1;
    return { buffer: image, contentType: "image/png" };
  },
  profileAvatarMetadata() {
    return { contentType: "image/png", width: 128, height: 128 };
  },
  jsonResponse(response, status, payload) {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(Buffer.from(JSON.stringify(payload)));
  },
  securityResponseHeaders() {
    return {
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-site"
    };
  },
  corsHeaders() {
    return { vary: "origin" };
  }
};

vm.runInNewContext([
  source.slice(helpersStart, helpersEnd),
  source.slice(readerStart, readerEnd),
  "globalThis.readProfileAvatarForTest = readProfileAvatar;"
].join("\n"), sandbox, { filename: "profile-avatar-cache-contract.js" });

const readProfileAvatar = sandbox.readProfileAvatarForTest;
const version = "2026-07-27T10:20:30.123Z";
const versionedUrl = new URL(`https://versorgungs-kompass.example/api/profile-avatar/profile-current?v=${encodeURIComponent(version)}`);

function resetState() {
  state.authCalls = 0;
  state.profileCalls = 0;
  state.storageReads = 0;
  state.activeOnly = null;
  state.authError = null;
  state.objectName = "profile-images/profile-current/avatar-123e4567-e89b-42d3-a456-426614174000.png";
  state.profile = {
    id: "profile-current",
    active: true,
    avatar_url: "gs://profile-images-test/profile-images/profile-current/avatar-123e4567-e89b-42d3-a456-426614174000.png",
    updated_at: new Date(version)
  };
}

function requestFor(url, headers = {}) {
  return {
    url: `${url.pathname}${url.search}`,
    headers: {
      host: url.host,
      ...headers
    }
  };
}

function responseRecorder() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}

async function perform(url, headers = {}) {
  const response = responseRecorder();
  await readProfileAvatar(requestFor(url, headers), response, "profile-current", url);
  return response;
}

resetState();
const initial = await perform(versionedUrl);
assert.equal(initial.status, 200);
assert.equal(initial.headers["cache-control"], "private, max-age=3600, immutable");
assert.doesNotMatch(initial.headers["cache-control"], /\bpublic\b|\bno-store\b/u);
assert.match(initial.headers.etag, /^W\/"profile-avatar-[A-Za-z0-9_-]{43}"$/u);
assert.equal(initial.headers["content-length"], image.length);
assert.equal(initial.headers["x-content-type-options"], "nosniff");
assert.deepEqual(initial.body, image);
assert.equal(state.authCalls, 1, "Auch ein cachebarer Abruf muss autorisiert werden.");
assert.equal(state.profileCalls, 1);
assert.equal(state.activeOnly, true, "Inaktive Profile dürfen kein Profilfoto ausliefern.");
assert.equal(state.storageReads, 1);

const stableEntityTag = initial.headers.etag;
resetState();
const repeated = await perform(versionedUrl);
assert.equal(repeated.headers.etag, stableEntityTag, "Der ETag muss für dieselbe Profilfoto-Version stabil bleiben.");

resetState();
const metadataOnlyVersion = "2026-07-27T11:21:31.456Z";
state.profile.updated_at = new Date(metadataOnlyVersion);
const metadataOnlyUrl = new URL(
  `https://versorgungs-kompass.example/api/profile-avatar/profile-current?v=${encodeURIComponent(metadataOnlyVersion)}`
);
const metadataOnlyChange = await perform(metadataOnlyUrl);
assert.equal(metadataOnlyChange.headers.etag, stableEntityTag,
  "Eine reine Profilmetadaten-Änderung darf den ETag identischer Avatar-Bytes nicht ändern.");

resetState();
const conditional = await perform(versionedUrl, { "if-none-match": stableEntityTag });
assert.equal(conditional.status, 304);
assert.equal(conditional.headers.etag, stableEntityTag);
assert.equal(conditional.headers["cache-control"], "private, max-age=3600, immutable");
assert.equal(conditional.body, undefined);
assert.equal(state.authCalls, 1, "If-None-Match darf die Autorisierung nicht umgehen.");
assert.equal(state.profileCalls, 1, "Die aktuelle, aktive Profilfoto-Referenz muss vor 304 geprüft werden.");
assert.equal(state.storageReads, 0, "Eine passende versionierte UUID-URL muss GCS bei 304 nicht erneut lesen.");

resetState();
const unversionedUrl = new URL("https://versorgungs-kompass.example/api/profile-avatar/profile-current");
const unversioned = await perform(unversionedUrl, { "if-none-match": stableEntityTag });
assert.equal(unversioned.status, 304);
assert.equal(unversioned.headers["cache-control"], "private, max-age=0, must-revalidate");
assert.equal(state.profileCalls, 1, "Eine unversionierte URL muss den aktuellen Datenbankstand vor 304 revalidieren.");
assert.equal(state.storageReads, 0, "Ein unverändertes UUID-Objekt muss nach erfolgreicher Revalidierung nicht aus GCS gelesen werden.");

resetState();
const staleUrl = new URL("https://versorgungs-kompass.example/api/profile-avatar/profile-current?v=2026-07-26T10%3A20%3A30.123Z");
const stale = await perform(staleUrl);
assert.equal(stale.status, 200);
assert.equal(stale.headers["cache-control"], "private, max-age=0, must-revalidate");
assert.equal(state.storageReads, 1);

resetState();
const ambiguousUrl = new URL(`${versionedUrl.href}&v=${encodeURIComponent(version)}`);
const ambiguous = await perform(ambiguousUrl);
assert.equal(ambiguous.headers["cache-control"], "private, max-age=0, must-revalidate",
  "Mehrere Versionsparameter dürfen keinen langlebigen Cache aktivieren.");

resetState();
state.objectName = "profile-images/profile-current/avatar.png";
const legacyInitial = await perform(versionedUrl);
assert.equal(legacyInitial.status, 200);
const legacyEntityTag = legacyInitial.headers.etag;
state.storageReads = 0;
const legacy = await perform(versionedUrl, { "if-none-match": legacyEntityTag });
assert.equal(legacy.status, 304);
assert.equal(state.storageReads, 1, "Legacy-Objektnamen werden vor einer bedingten Antwort weiterhin aus GCS geprüft.");

resetState();
state.authError = Object.assign(new Error("Nicht autorisiert"), { status: 401 });
await assert.rejects(
  () => perform(versionedUrl, { "if-none-match": stableEntityTag }),
  (error) => error.status === 401
);
assert.equal(state.profileCalls, 0, "Ohne Autorisierung darf die Profilreferenz nicht gelesen werden.");
assert.equal(state.storageReads, 0, "Ohne Autorisierung darf GCS nicht gelesen werden.");

console.log("Profile Avatar Cache Test OK: private Version-Caches, stabile ETags, frühe 304-Antworten und Auth-Grenzen sind abgesichert.");
