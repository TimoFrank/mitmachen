import test from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_RESET_BROKER_PATH,
  requestPasswordResetEmail
} from "../src/password-reset.js";
import {
  PASSWORD_INVITATION_BROKER_PATH,
  PASSWORD_INVITATION_TIMEOUT_MS,
  parsePasswordInvitationUrl,
  redeemPasswordInvitation
} from "../src/password-invitation.js";

const invitationToken = "A".repeat(43);

test("keeps the browser timeout above the broker's 45-second backend budget", () => {
  assert.equal(PASSWORD_INVITATION_TIMEOUT_MS, 50_000);
});

test("uses only the same-origin password-reset broker without credentials", async () => {
  let captured;
  await requestPasswordResetEmail("  Person@Example.org  ", {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response('{"accepted":true}', { status: 202 });
    }
  });

  assert.equal(captured.url, PASSWORD_RESET_BROKER_PATH);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(captured.options.body), { email: "Person@Example.org" });
});

test("accepts only the broker's exact neutral response contract", async () => {
  for (const [status, body] of [
    [200, '{"accepted":true}'],
    [202, '{"accepted":false}'],
    [202, '{"accepted":true,"email":"person@example.org"}'],
    [202, "not-json"]
  ]) {
    await assert.rejects(
      requestPasswordResetEmail("person@example.org", {
        fetchImpl: async () => new Response(body, { status })
      }),
      /Passwort-Reset/u
    );
  }
});

test("accepts only one canonical invitation token in the URL fragment", () => {
  assert.deepEqual(
    parsePasswordInvitationUrl(
      `https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=${invitationToken}`
    ),
    { token: invitationToken }
  );

  for (const url of [
    `https://versorgungs-kompass.de/konto/passwort-festlegen?einladung=${invitationToken}`,
    `https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=${invitationToken}&probe=1`,
    "https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=kurz",
    `https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=${invitationToken}&einladung=${invitationToken}`,
    `https://www.versorgungs-kompass.de/konto/passwort-festlegen#einladung=${invitationToken}`,
    `https://versorgungs-kompass.de/anmelden#einladung=${invitationToken}`,
    `https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=%41${invitationToken.slice(1)}`
  ]) {
    assert.throws(() => parsePasswordInvitationUrl(url), /ungültig/u);
  }
});

test("redeems an invitation only through the same-origin broker without credentials", async () => {
  let captured;
  const result = await redeemPasswordInvitation(invitationToken, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        redeemed: true,
        actionUrl: "https://versorgungs-kompass.de/konto/passwort-festlegen?mode=resetPassword"
      }), { status: 200 });
    }
  });

  assert.equal(captured.url, PASSWORD_INVITATION_BROKER_PATH);
  assert.equal(captured.url, PASSWORD_RESET_BROKER_PATH);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(captured.options.body), { invitationToken });
  assert.match(result.actionUrl, /^https:\/\/versorgungs-kompass\.de\//u);
});

test("keeps the invitation deadline active while reading the response body", async () => {
  let observedSignal;
  await assert.rejects(
    redeemPasswordInvitation(invitationToken, {
      timeoutMs: 10,
      fetchImpl: async (_url, options) => {
        observedSignal = options.signal;
        return {
          status: 200,
          text: () => new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("body-aborted")),
              { once: true }
            );
          })
        };
      }
    }),
    /body-aborted/u
  );
  assert.equal(observedSignal.aborted, true);
});

test("rejects every non-exact invitation response", async () => {
  for (const [status, body] of [
    [202, JSON.stringify({ redeemed: true, actionUrl: "https://example.org" })],
    [200, JSON.stringify({ redeemed: false, actionUrl: "https://example.org" })],
    [200, JSON.stringify({ redeemed: true, actionUrl: "https://example.org", email: "x@example.org" })],
    [200, "not-json"]
  ]) {
    await assert.rejects(
      redeemPasswordInvitation(invitationToken, {
        fetchImpl: async () => new Response(body, { status })
      }),
      /Einladung/u
    );
  }
});
