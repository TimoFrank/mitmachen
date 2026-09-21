import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { createGoogleStateStore } from "./google-state.mjs";
import { createGoogleSessions, assertGoogleHostingEnvironment } from "./google-session.mjs";

export function createGoogleRuntime(configuration, env = process.env) {
  assertGoogleHostingEnvironment(env);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(env.GOOGLE_STATE_BUCKET || "")) {
    throw new Error("Ein dedizierter privater GOOGLE_STATE_BUCKET fehlt.");
  }
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: env.IAP_GCIP_PROJECT_ID
  }, "google-hosting");
  const state = createGoogleStateStore({ bucket: getStorage(app).bucket(env.GOOGLE_STATE_BUCKET) });
  return Object.freeze({
    state,
    sessions: configuration ? createGoogleSessions({ auth: getAuth(app), state, configuration }) : null
  });
}
