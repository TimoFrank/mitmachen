import test from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_RESET_BROKER_PATH,
  requestPasswordResetEmail
} from "../src/password-reset.js";

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
