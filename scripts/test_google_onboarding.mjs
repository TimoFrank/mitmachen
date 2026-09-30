#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateGoogleOnboardingEnvironment, validateGoogleOnboardingRelease, checkGoogleOnboardingGcp,
  readGoogleAccessEnd, digest
} from "./lib/google-onboarding-contract.mjs";
import { projectIdPin } from "./check_pre_gematik_migration_gcp.mjs";
import { createOnboardingStorage } from "./lib/google-onboarding-storage.mjs";
import { GoogleOnboardingRuntime, cloudRunJobArguments } from "./orchestrate_google_onboarding.mjs";
import { runWorker, validateWorkerInput } from "../deploy/google-onboarding/worker.mjs";
import { loadWelcomeEmailTemplates, renderGuestWelcomeEmail, executeWelcomeEmailRendering,
  WELCOME_EMAIL_SENDER_NAME, WELCOME_EMAIL_SENDER_EMAIL } from "./render_pre_gematik_guest_welcome_email.mjs";
import { executeWelcomeEmailSend, WELCOME_EMAIL_SMTP_HOST, WELCOME_EMAIL_SMTP_PORT,
  WELCOME_EMAIL_SMTP_SECURITY } from "./send_pre_gematik_guest_welcome_email.mjs";

const project = "example-project";
const now = () => new Date("2026-10-01T08:00:00Z");
const env = validateGoogleOnboardingEnvironment({
  GCP_PROJECT_ID: project, EXPECTED_TARGET_PROJECT_ID: project, GCP_REGION: "europe-west3",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${project}:europe-west3:vk-postgres`, PRE_GEMATIK_GCP_PROJECT_SHA256: projectIdPin(project),
  GOOGLE_APP_SERVICE: "versorgungs-kompass", GOOGLE_APP_REVISION: "versorgungs-kompass-00006-abc",
  GOOGLE_RESET_SERVICE: "vk-password", GOOGLE_RESET_REVISION: "vk-password-00005-abc",
  GOOGLE_NETWORK: "vk-network", GOOGLE_SUBNET: "vk-cloud-run",
  GOOGLE_ONBOARDING_SERVICE_ACCOUNT: `vk-google-onboarding@${project}.iam.gserviceaccount.com`,
  GOOGLE_ONBOARDING_BUCKET: `${project}-vk-onboarding`, GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "true",
  GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "false"
});
const release = validateGoogleOnboardingRelease({ version: 2, source_commit: "a".repeat(40),
  image: `europe-west3-docker.pkg.dev/${project}/operators/onboarding@sha256:${"b".repeat(64)}`,
  cloud_sql_proxy_sha256: `sha256:${"c".repeat(64)}`, approved_until: "2026-10-30T17:00:00Z",
  invitation_bucket: `${project}-vk-invitations`, pilot_end: "2026-10-31T17:00:00Z" }, env, now());

function service(name, revision, values, application = false) {
  return { metadata: { name }, status: { conditions: [{ type: "Ready", status: "True" }], latestReadyRevisionName: revision,
    latestCreatedRevisionName: revision, traffic: [{ revisionName: revision, percent: 100 }] },
  spec: { template: { metadata: { annotations: {
    "run.googleapis.com/network-interfaces": JSON.stringify([{ network: env.GOOGLE_NETWORK, subnetwork: env.GOOGLE_SUBNET }]),
    "run.googleapis.com/vpc-access-egress": "private-ranges-only"
  } }, spec: { serviceAccountName: `${application ? "vk-app" : "vk-reset"}@${project}.iam.gserviceaccount.com`,
    containers: [{ name: "application", env: Object.entries({ GOOGLE_HOSTING_ENABLED: "1", GOOGLE_CUTOVER_MODE: "open",
      IAP_GCIP_PROJECT_ID: project, IAP_GCIP_TENANT_ID: "", ...values }).map(([name, value]) => ({ name, value })) },
    ...(application ? [{ name: "cloud-sql-proxy", args: ["--private-ip", env.CLOUD_SQL_INSTANCE_CONNECTION_NAME] }] : [])]
  } } } };
}
function fixture() {
  return {
    project: { projectId: project, projectNumber: "123456789", lifecycleState: "ACTIVE" },
    app: service(env.GOOGLE_APP_SERVICE, env.GOOGLE_APP_REVISION, {
      API_AUTH_MODE: "identity-platform", IAP_IDENTITY_MODE: "external", IAP_EXTERNAL_ACCESS_EXPIRES_AT: release.pilot_end, DB_NAME: "versorgungs_kompass", ALLOWED_ORIGIN: "https://versorgungs-kompass.de"
    }, true),
    reset: service(env.GOOGLE_RESET_SERVICE, env.GOOGLE_RESET_REVISION, { PASSWORD_INVITATION_BUCKET: release.invitation_bucket, PASSWORD_RESET_BROKER_ENABLED: "1", PASSWORD_RESET_ALLOWED_ORIGIN: "https://versorgungs-kompass.de" }),
    instance: { name: "vk-postgres", project, region: "europe-west3", connectionName: env.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
      state: "RUNNABLE", databaseVersion: "POSTGRES_16", ipAddresses: [{ type: "PRIVATE", ipAddress: "10.20.0.3" }],
      settings: { ipConfiguration: { ipv4Enabled: false, privateNetwork: `https://www.googleapis.com/compute/v1/projects/${project}/global/networks/vk-network` },
        backupConfiguration: { enabled: true, pointInTimeRecoveryEnabled: true, transactionLogRetentionDays: 7,
          backupRetentionSettings: { retentionUnit: "COUNT", retainedBackups: 14 } } } },
    backups: [{ id: "123", instance: "vk-postgres", location: "europe-west3", status: "SUCCESSFUL", type: "AUTOMATED",
      backupKind: "SNAPSHOT", databaseVersion: "POSTGRES_16", endTime: "2026-10-01T02:00:00Z",
      selfLink: `https://sqladmin.googleapis.com/sql/v1beta4/projects/${project}/instances/vk-postgres/backupRuns/123` }]
  };
}
const calls = [];
function reader(f) { return async (args) => {
  calls.push(args);
  if (args[0] === "projects") return f.project;
  if (args[0] === "run") return args[3] === env.GOOGLE_APP_SERVICE ? f.app : f.reset;
  if (args[1] === "instances") return f.instance;
  if (args[1] === "backups") return f.backups;
  throw new Error("Unexpected command");
}; }
const gate = await checkGoogleOnboardingGcp(env, release, { read: reader(fixture()), now });
assert.equal(gate.ok, true);
assert.equal(gate.backupPosture.retainedBackups, 14);
assert.equal(calls.some((args) => args.includes("container") || args.includes("clusters")), false);
assert.equal(await readGoogleAccessEnd({ project, service: env.GOOGLE_APP_SERVICE }, { read: reader(fixture()), now }), release.pilot_end);
const omittedEmptyValues = fixture();
omittedEmptyValues.instance.settings.ipConfiguration.privateNetwork = `projects/${project}/global/networks/${env.GOOGLE_NETWORK}`;
for (const target of [omittedEmptyValues.app, omittedEmptyValues.reset]) {
  delete target.spec.template.spec.containers[0].env.find((e) => e.name === "IAP_GCIP_TENANT_ID").value;
}
assert.equal((await checkGoogleOnboardingGcp(env, release, { read: reader(omittedEmptyValues), now })).ok, true);
assert.equal(await readGoogleAccessEnd({ project, service: env.GOOGLE_APP_SERVICE }, { read: reader(omittedEmptyValues), now }), release.pilot_end);
omittedEmptyValues.app.spec.template.spec.containers[0].env.find((e) => e.name === "IAP_GCIP_TENANT_ID").valueFrom = { secretKeyRef: { name: "unknown", key: "1" } };
await assert.rejects(readGoogleAccessEnd({ project, service: env.GOOGLE_APP_SERVICE }, { read: reader(omittedEmptyValues), now }));
for (const mutate of [
  (f) => { f.project.projectId = "wrong-project"; },
  (f) => { f.app.status.traffic[0].percent = 50; },
  (f) => { f.app.status.latestReadyRevisionName = "other-revision"; },
  (f) => { f.app.spec.template.spec.containers[0].env.find((e) => e.name === "IAP_EXTERNAL_ACCESS_EXPIRES_AT").value = "2026-09-30T16:00:00Z"; },
  (f) => { f.app.spec.template.spec.serviceAccountName = env.GOOGLE_ONBOARDING_SERVICE_ACCOUNT; },
  (f) => { f.app.spec.template.spec.containers[0].env.find((e) => e.name === "API_AUTH_MODE").value = "anonymous"; },
  (f) => { f.app.spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] = "all-traffic"; },
  (f) => { f.reset.spec.template.spec.containers[0].env.find((e) => e.name === "PASSWORD_INVITATION_BUCKET").value = "foreign-bucket"; },
  (f) => { f.instance.ipAddresses.push({ type: "PRIMARY", ipAddress: "1.2.3.4" }); },
  (f) => { f.instance.settings.ipConfiguration.privateNetwork = `https://untrusted.example/projects/${project}/global/networks/${env.GOOGLE_NETWORK}`; },
  (f) => { f.instance.settings.backupConfiguration.pointInTimeRecoveryEnabled = false; },
  (f) => { f.backups[0].endTime = "2026-09-28T00:00:00Z"; },
  (f) => { f.backups[0].selfLink = f.backups[0].selfLink.replace(project, "wrong-project"); }
]) {
  const f = fixture(); mutate(f);
  await assert.rejects(checkGoogleOnboardingGcp(env, release, { read: reader(f), now }));
}
assert.throws(() => validateGoogleOnboardingEnvironment({ ...env, GKE_CLUSTER_NAME: "legacy" }));
assert.throws(() => validateGoogleOnboardingEnvironment({ ...env, GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "true" }));
assert.throws(() => validateGoogleOnboardingRelease({ ...release, image: release.image.replace(/@sha256:.+/u, ":latest") }, env, now()));
assert.throws(() => validateGoogleOnboardingRelease({ ...release, approved_until: "2026-09-30T16:00:00Z" }, env, now()));

// Actual REST adapter: create-only uploads, generation-pinned reads/deletes,
// untrusted redirects, tokens and response bodies do not escape into errors.
const httpCalls = [];
let exists = false;
const storage = createOnboardingStorage({ bucket: env.GOOGLE_ONBOARDING_BUCKET, project, tokenProvider: () => "synthetic-access-token-123456789",
  fetchImpl: async (url, options) => {
    httpCalls.push({ url, options });
    if (options.method === "POST") { exists = true; return Response.json({ bucket: env.GOOGLE_ONBOARDING_BUCKET, name: "locks/onboarding.json", generation: "42", size: "100" }); }
    if (options.method === "DELETE") { exists = false; return new Response(null, { status: 204 }); }
    if (!exists) return new Response(null, { status: 404 });
    return Response.json(url.includes("alt=media") ? { holder: "synthetic" }
      : { bucket: env.GOOGLE_ONBOARDING_BUCKET, name: "locks/onboarding.json", generation: "42", size: "100" });
  } });
assert.equal(await storage.read("locks/onboarding.json"), null);
await storage.create("locks/onboarding.json", { holder: "synthetic" });
assert.equal((await storage.read("locks/onboarding.json")).generation, "42");
await storage.remove("locks/onboarding.json", "42");
assert(httpCalls.some((c) => c.url.includes("ifGenerationMatch=0")));
assert(httpCalls.some((c) => c.url.includes("generation=42")));
assert(httpCalls.some((c) => c.url.includes("ifGenerationMatch=42")));
assert(httpCalls.every((c) => c.options.redirect === "error"));
await assert.rejects(storage.create("../unexpected", {}));

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-google-onboarding-test-"));
await fs.chmod(directory, 0o700);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const account = JSON.parse(await fs.readFile(path.join(repository, "config/google-onboarding/account.example.json"), "utf8"));
  account.email_ownership_verified = true;
  const guest = JSON.parse(await fs.readFile(path.join(repository, "config/google-onboarding/guest-access.example.json"), "utf8"));
  const fingerprint = digest("synthetic-run");
  const context = { repository, runDirectory: directory, baseEnvironment: env, operatorRelease: release,
    fingerprint, guestAccess: guest, identityReadbackEnvironment: { IAP_EXTERNAL_AUTH_API_KEY: `AIza${"a".repeat(35)}` } };
  const job = "vk-onboard-11111111-1111-4111-8111-111111111111";
  const args = cloudRunJobArguments(context, job, `${job}-input`, "holder-123");
  for (const expected of ["--max-retries=0", "--tasks=1", "--parallelism=1", "--vpc-egress=private-ranges-only", "--task-timeout=600s"]) assert(args.includes(expected));
  assert(!args.join(" ").includes(guest.email));
  assert(args.includes(`--set-secrets=/secrets/input.json=${job}-input:1`));
  assert(args.find((v) => v.startsWith("--labels=")).split(",").every((v) => v.split("=").at(-1).length <= 63));

  const input = { version: 1, job, fingerprint, environment: env, release, guest,
    database: { PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL: "postgresql://test:secret@127.0.0.1:5432/versorgungs_kompass?sslmode=disable", PRE_GEMATIK_ACCESS_TARGET_SHA256: digest("synthetic-db") },
    identity: context.identityReadbackEnvironment, phase: "guest-preview", current_state_fingerprint: "" };
  assert.equal(validateWorkerInput(input, { jobName: job, revision: release.source_commit }).uid, guest.uid);
  assert.throws(() => validateWorkerInput(input, { jobName: "wrong-job", revision: release.source_commit }));
  assert.throws(() => validateWorkerInput({ ...input, phase: "guest-apply" }, { jobName: job, revision: release.source_commit }));
  const workerOutputs = [];
  const previousKey = process.env.IAP_EXTERNAL_AUTH_API_KEY;
  await runWorker(input, { jobName: job, revision: release.source_commit, root: repository, directory: path.join(directory, "worker"),
    gate: async () => gate,
    provision: async (argv, environment, dependencies) => {
      assert(argv.includes("--create-profile-and-prebind") && !argv.includes("--apply"));
      assert.equal(environment.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE, "private-ip");
      assert.equal((await dependencies.onlineOnboardingGcpGate()).ok, true);
      assert.equal((await fs.stat(argv[1])).mode & 0o077, 0);
      console.log(JSON.stringify({ result: "synthetic" }));
    }, store: { create: async (name, value) => workerOutputs.push({ name, value }) } });
  assert.equal(workerOutputs.length, 1);
  assert.equal(workerOutputs[0].name, `results/${job}.json`);
  assert(!JSON.stringify(workerOutputs).includes(guest.email));
  assert.equal(process.env.IAP_EXTERNAL_AUTH_API_KEY, previousKey);
  await assert.rejects(fs.stat(path.join(directory, "worker")), { code: "ENOENT" });

  // Locks are never taken over across holders/hosts and cleanup failure keeps
  // the global lock. A running/unknown job must never be deleted or retried.
  let lock = null;
  const lockStorage = { read: async () => lock,
    create: async (name, value) => (lock = { generation: "123", value }), remove: async () => { lock = null; } };
  const runtime = new GoogleOnboardingRuntime(context, { storage: lockStorage, now });
  runtime.cleanupGuestOperator = async () => ({ complete: true });
  const owned = await runtime.acquireLock({ fingerprint, holderId: "holder-123", resume: false, cleanupOnly: false });
  await assert.rejects(runtime.acquireLock({ fingerprint, holderId: "other-holder", resume: true }), /anderer/u);
  runtime.holderId = "holder-123";
  runtime.cleanupGuestOperator = async () => { throw new Error("unknown execution"); };
  await assert.rejects(runtime.releaseLock({ lock: owned }), /unknown execution/u);
  assert(lock);
  runtime.cleanupGuestOperator = async () => ({ complete: true });
  await runtime.releaseLock({ lock: owned });
  assert.equal(lock, null);

  const cleanupRuntime = new GoogleOnboardingRuntime(context, { storage: lockStorage, now });
  cleanupRuntime.holderId = "holder-123";
  const d = { version: 1, job, secret: `${job}-input`, holder: "holder-123", fingerprint,
    phase: "guest-apply", inputFile: `${job}.json`, executionIntent: `${job}-execute.json` };
  await fs.writeFile(cleanupRuntime.phaseFile, JSON.stringify(d), { mode: 0o600 });
  await fs.writeFile(path.join(directory, d.executionIntent), JSON.stringify({ job, holder: d.holder, fingerprint }), { mode: 0o600 });
  cleanupRuntime.getJob = async () => ({ metadata: { labels: { "managed-by": "vk-google-onboarding", holder: digest(d.holder).slice(7, 70), input: fingerprint.slice(7, 70) } } });
  cleanupRuntime.executions = async () => [{ metadata: { name: "active" }, status: { runningCount: 1 } }];
  cleanupRuntime.gcloud = async () => assert.fail("Active execution must not be mutated");
  await assert.rejects(cleanupRuntime.cleanupGuestOperator(), /aktiv oder ihr Ausgang unbekannt/u);
  cleanupRuntime.executions = async () => [];
  await assert.rejects(cleanupRuntime.cleanupGuestOperator(), /aktiv oder ihr Ausgang unbekannt/u);
  cleanupRuntime.getJob = async () => ({ metadata: { labels: { "managed-by": "foreign" } } });
  await assert.rejects(cleanupRuntime.cleanupGuestOperator(), /fremde/u);

  // Exercise a complete Cloud Run phase with captured CLI calls and remote
  // resources. No credentials or guest data may appear in command arguments.
  await fs.unlink(cleanupRuntime.phaseFile);
  const dbDirectory = path.join(directory, "access-operator-001");
  await fs.mkdir(dbDirectory, { mode: 0o700 });
  await fs.writeFile(path.join(dbDirectory, "test-access-operator.env"),
    Object.entries(input.database).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  const remote = new Map();
  const commands = [];
  let liveJob = null;
  let liveSecret = null;
  const phaseRuntime = new GoogleOnboardingRuntime(context, { now, gate: async () => gate,
    storage: {
      read: async (name) => remote.get(name) || null,
      remove: async (name) => { remote.delete(name); }
    },
    commandRunner: async (command, args) => {
      commands.push([command, ...args]);
      assert.equal(command, "gcloud");
      assert(!args.some((a) => a.includes(guest.email) || a.includes("postgresql:")));
      const result = (value = {}) => ({ stdout: JSON.stringify(value), exitCode: 0, stderr: "" });
      if (args[0] === "secrets") {
        if (args[1] === "list") return result(liveSecret ? [liveSecret] : []);
        if (args[1] === "create") {
          liveSecret = { name: `projects/123456789/secrets/${args[2]}`, labels: Object.fromEntries(args.find((a) => a.startsWith("--labels=")).slice(9).split(",").map((a) => a.split("="))) };
          return result();
        }
        if (args[1] === "delete") { liveSecret = null; return result(); }
        if (args[1] === "add-iam-policy-binding") return result();
      }
      if (args[0] === "run") {
        if (args[2] === "list") return result(liveJob ? [liveJob] : []);
        if (args[2] === "describe") return result(liveJob);
        if (args[2] === "create") {
          const secretName = liveSecret.name.split("/").at(-1);
          liveJob = { metadata: { name: args[3], labels: liveSecret.labels }, spec: { template: {
            metadata: { annotations: { "run.googleapis.com/network-interfaces": JSON.stringify([{ network: env.GOOGLE_NETWORK, subnetwork: env.GOOGLE_SUBNET }]), "run.googleapis.com/vpc-access-egress": "private-ranges-only" } },
            spec: { taskCount: 1, parallelism: 1, template: { spec: { serviceAccountName: env.GOOGLE_ONBOARDING_SERVICE_ACCOUNT, maxRetries: 0, timeoutSeconds: "600",
              containers: [{ image: release.image, volumeMounts: [{ name: "input", mountPath: "/secrets" }] }],
              volumes: [{ name: "input", secret: { secretName, items: [{ key: "1", path: "input.json" }] } }] } } }
          } } };
          return result(liveJob);
        }
        if (args[2] === "execute") {
          const jobName = args[3];
          remote.set(`results/${jobName}.json`, { generation: "100", value: { version: 1, job: jobName, fingerprint, phase: "guest-preview", report: { result: "synthetic" } } });
          return result();
        }
        if (args[2] === "executions") return result([{ metadata: { uid: "synthetic-id", labels: { "run.googleapis.com/job": liveJob.metadata.name } }, status: { succeededCount: 1, completionTime: now().toISOString() } }]);
        if (args[2] === "delete") { liveJob = null; return result(); }
      }
      assert.fail(`Unexpected command: ${args.slice(0, 3).join(" ")}`);
    }
  });
  phaseRuntime.holderId = "holder-123";
  const result = await phaseRuntime.runGuestPhase({ phase: "guest-preview", label: "transport-test" });
  assert.equal(result.report.result, "synthetic");
  assert.equal(commands.filter((a) => a.includes("execute")).length, 1);
  assert.equal(commands.some((a) => a.includes("kubectl") || a.includes("container")), false);
  assert.equal(liveJob, null);
  assert.equal(liveSecret, null);
  assert.equal(remote.size, 0);
  assert.equal((await fs.stat(result.reportPath)).mode & 0o077, 0);
  await assert.rejects(fs.stat(phaseRuntime.phaseFile), { code: "ENOENT" });

  // Mail expiry is read from the application, not a bumped legacy constant.
  const templates = await loadWelcomeEmailTemplates();
  const actionUrl = `https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=${"a".repeat(43)}`;
  const mailOptions = { apply: false, input: "/protected/account.json", linkFile: "/protected/link.txt", googleService: env.GOOGLE_APP_SERVICE,
    senderName: WELCOME_EMAIL_SENDER_NAME, senderEmail: WELCOME_EMAIL_SENDER_EMAIL, pilotEnd: release.pilot_end };
  await assert.rejects(executeWelcomeEmailRendering({ document: account, actionUrl, options: { ...mailOptions, pilotEnd: "2026-09-30T16:00:00Z" },
    repository, templates, readAccessEnd: async () => release.pilot_end, log: () => {} }));
  const rendered = await executeWelcomeEmailRendering({ document: account, actionUrl, options: mailOptions,
    repository, templates, readAccessEnd: async () => release.pilot_end, log: () => {} });
  assert(rendered.rendered.text.includes("31. Oktober 2026"));
  const sendOptions = { apply: false, input: path.join(directory, "account.json"), linkFile: path.join(directory, "link.txt"),
    mailFile: path.join(directory, "welcome.eml"), smtpConfig: path.join(directory, "smtp.json"),
    invitationBucket: release.invitation_bucket, googleService: env.GOOGLE_APP_SERVICE };
  for (const [file, content] of [
    [sendOptions.input, JSON.stringify(account)], [sendOptions.linkFile, `${actionUrl}\n`],
    [sendOptions.mailFile, rendered.rendered.eml],
    [sendOptions.smtpConfig, JSON.stringify({ version: 1, host: WELCOME_EMAIL_SMTP_HOST, port: WELCOME_EMAIL_SMTP_PORT,
      security: WELCOME_EMAIL_SMTP_SECURITY, username: WELCOME_EMAIL_SENDER_EMAIL,
      password: "synthetic-unused-smtp-password", sender_email: WELCOME_EMAIL_SENDER_EMAIL })]
  ]) await fs.writeFile(file, content, { mode: 0o600 });
  const sendDependencies = { options: sendOptions, repository, readAccessEnd: async () => release.pilot_end,
    invitationStoreFactory: () => ({}), readPreparedInvitation: async () => ({ synthetic: true }),
    transport: async () => assert.fail("A preview must never send mail"),
    activateInvitation: async () => assert.fail("A preview must never activate a link"), log: () => {} };
  const sendPreview = await executeWelcomeEmailSend(sendDependencies);
  assert.equal(sendPreview.applied, false);
  assert.equal(sendPreview.accepted, false);
  assert.equal(sendPreview.activated, false);
  await assert.rejects(executeWelcomeEmailSend({ ...sendDependencies,
    readAccessEnd: async () => "2026-11-30T17:00:00Z" }), /bytegenau/u);
  await assert.rejects(renderGuestWelcomeEmail({ document: account, actionUrl, senderName: WELCOME_EMAIL_SENDER_NAME,
    senderEmail: WELCOME_EMAIL_SENDER_EMAIL, pilotEnd: release.pilot_end, ...templates }));
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
console.log("Cloud-Run-Onboarding OK: private Zielbindung, Backup/PITR, einmalige Jobs, geschützte Nachweise, sicherer Cleanup und aktuelle Mailfrist geprüft.");
