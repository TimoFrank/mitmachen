import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  main as provisionGuest, identityPlatformGuestAccessFingerprint, validateIdentityPlatformGuestAccessDocument,
  GUEST_ACCESS_CREATE_PROFILE_OPERATION
} from "../../scripts/provision_pre_gematik_identity_platform_guest_access.mjs";
import { checkGoogleOnboardingGcp, demand, exactKeys } from "../../scripts/lib/google-onboarding-contract.mjs";
import { createOnboardingStorage } from "../../scripts/lib/google-onboarding-storage.mjs";

export function validateWorkerInput(input, { jobName, revision }) {
  exactKeys(input, ["version", "job", "fingerprint", "environment", "release", "guest", "database", "identity", "phase", "current_state_fingerprint"]);
  demand(input.version === 1 && /^vk-onboard-[a-f0-9-]+$/u.test(input.job) && input.job === jobName
    && input.release?.source_commit === revision && /^sha256:[a-f0-9]{64}$/u.test(input.fingerprint)
    && ["guest-preview", "guest-apply"].includes(input.phase), "Der Job-Eingangsvertrag ist nicht exakt gebunden.");
  exactKeys(input.database, ["PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL", "PRE_GEMATIK_ACCESS_TARGET_SHA256"]);
  exactKeys(input.identity, ["IAP_EXTERNAL_AUTH_API_KEY"]);
  const guest = validateIdentityPlatformGuestAccessDocument(input.guest);
  demand(guest.project_id === input.environment.GCP_PROJECT_ID
    && /^AIza[0-9A-Za-z_-]{35}$/u.test(input.identity.IAP_EXTERNAL_AUTH_API_KEY)
    && (input.phase === "guest-apply" ? /^sha256:[a-f0-9]{64}$/u.test(input.current_state_fingerprint) : input.current_state_fingerprint === ""),
  "Die Gastphase enthält keine gültige Bestätigung.");
  return guest;
}

export async function runWorker(input, { jobName, revision, root = "/workspace", directory = "/tmp/vk-google-guest",
  gate = checkGoogleOnboardingGcp, provision = provisionGuest, store = createOnboardingStorage({
    bucket: input.environment.GOOGLE_ONBOARDING_BUCKET, project: input.environment.GCP_PROJECT_ID
  }) } = {}) {
  process.umask(0o077);
  const guest = validateWorkerInput(input, { jobName, revision });
  await gate(input.environment, input.release);
  await fs.mkdir(directory, { mode: 0o700 });
  const guestPath = path.join(directory, "guest.json");
  await fs.writeFile(guestPath, JSON.stringify(guest), { flag: "wx", mode: 0o600 });
  const env = { ...process.env, ...input.environment, ...input.identity, ...input.database,
    PRE_GEMATIK_ACCESS_REPOSITORY_ROOT: root,
    CLOUD_SQL_AUTH_PROXY_EXECUTABLE: "/usr/local/bin/cloud-sql-proxy",
    CLOUD_SQL_AUTH_PROXY_SHA256: input.release.cloud_sql_proxy_sha256,
    CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private-ip"
  };
  // The existing account readback uses a process-level, protected API key.
  const previousKey = process.env.IAP_EXTERNAL_AUTH_API_KEY;
  process.env.IAP_EXTERNAL_AUTH_API_KEY = input.identity.IAP_EXTERNAL_AUTH_API_KEY;
  const args = ["--input", guestPath, "--create-profile-and-prebind"];
  if (input.phase === "guest-apply") args.push("--apply", "--confirm-environment", "pre-gematik",
    "--confirm-project", guest.project_id, "--confirm-database", "versorgungs_kompass",
    "--confirm-operation", GUEST_ACCESS_CREATE_PROFILE_OPERATION,
    "--confirm-fingerprint", identityPlatformGuestAccessFingerprint(guest),
    "--confirm-current-state-fingerprint", input.current_state_fingerprint);
  let output = "";
  const originalLog = console.log;
  try {
    console.log = (...parts) => {
      output += parts.join(" ") + "\n";
      demand(output.length <= 64 * 1024, "Der Gastnachweis ist zu groß.");
    };
    await provision(args, env, { onlineOnboardingGcpGate: () => gate(input.environment, input.release) });
    const report = JSON.parse(output);
    await store.create(`results/${input.job}.json`, { version: 1, job: input.job,
      fingerprint: input.fingerprint, phase: input.phase, report });
  } finally {
    console.log = originalLog;
    if (previousKey === undefined) delete process.env.IAP_EXTERNAL_AUTH_API_KEY;
    else process.env.IAP_EXTERNAL_AUTH_API_KEY = previousKey;
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const input = await fs.readFile("/secrets/input.json", "utf8");
    demand(input.length <= 128 * 1024, "Die Eingabe ist zu groß.");
    await runWorker(JSON.parse(input), { jobName: process.env.CLOUD_RUN_JOB,
      revision: (await fs.readFile("/opt/source-revision", "utf8")).trim() });
    console.log("Cloud-Run-Gastphase abgeschlossen; Nachweis geschützt gespeichert.");
  })().catch(() => {
    console.error("Die Cloud-Run-Gastphase wurde abgebrochen. Geschützten Nachweis und Zustand vor Wiederaufnahme prüfen.");
    process.exitCode = 1;
  });
}
