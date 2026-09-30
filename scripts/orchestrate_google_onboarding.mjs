#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  CommandOnlineOnboardingRuntime, loadOnlineOnboardingContext, parseOnlineOnboardingArguments,
  executeOnlineOnboardingPreparation, OnlineOnboardingError, usage as legacyUsage
} from "./orchestrate_pre_gematik_online_onboarding.mjs";
import { GOOGLE_ONBOARDING_ENV_KEYS, validateGoogleOnboardingEnvironment, validateGoogleOnboardingRelease,
  checkGoogleOnboardingGcp, demand, digest, exactKeys, GoogleOnboardingError } from "./lib/google-onboarding-contract.mjs";
import { createOnboardingStorage } from "./lib/google-onboarding-storage.mjs";

const SOURCE_PATHS = ["scripts", "deploy/google-onboarding", "deploy/migration-operator", "config/pre-gematik/email",
  "public/brand", "api/package.json", "api/package-lock.json", "package.json", "package-lock.json"];

async function writeProtected(file, value) {
  const handle = await fs.open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); }
  finally { await handle.close(); }
}
async function readProtected(file) {
  const stat = await fs.lstat(file);
  demand(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o077) === 0 && stat.size <= 128 * 1024, "Der lokale Operator-Nachweis ist nicht geschützt.");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
function parseDatabaseEnv(text) {
  const result = {};
  for (const line of text.trim().split("\n")) {
    const split = line.indexOf("=");
    demand(split > 0 && !Object.hasOwn(result, line.slice(0, split)), "Die Datenbankumgebung ist ungültig.");
    result[line.slice(0, split)] = line.slice(split + 1);
  }
  exactKeys(result, ["PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL", "PRE_GEMATIK_ACCESS_TARGET_SHA256"]);
  return result;
}
export function cloudRunJobArguments(context, name, secret, holderId) {
  const e = context.baseEnvironment;
  demand(/^vk-onboard-[a-f0-9-]+$/u.test(name) && secret === `${name}-input`, "Ungültiger Jobname.");
  return ["run", "jobs", "create", name, `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`,
    `--image=${context.operatorRelease.image}`, `--service-account=${e.GOOGLE_ONBOARDING_SERVICE_ACCOUNT}`,
    `--network=${e.GOOGLE_NETWORK}`, `--subnet=${e.GOOGLE_SUBNET}`, "--vpc-egress=private-ranges-only",
    "--tasks=1", "--parallelism=1", "--max-retries=0", "--task-timeout=600s", "--cpu=1", "--memory=512Mi",
    `--set-secrets=/secrets/input.json=${secret}:1`,
    `--labels=managed-by=vk-google-onboarding,holder=${digest(holderId).slice(7, 70)},input=${context.fingerprint.slice(7, 70)}`,
    "--quiet", "--format=json"];
}

export function assertCloudRunJob(live, context, secret) {
  const e = context.baseEnvironment;
  const execution = live?.spec?.template;
  const task = execution?.spec?.template?.spec;
  const annotations = execution?.metadata?.annotations || {};
  let network;
  try { network = JSON.parse(annotations["run.googleapis.com/network-interfaces"]); } catch { /* fail below */ }
  const container = task?.containers?.[0];
  const volume = task?.volumes?.[0];
  demand(task?.serviceAccountName === e.GOOGLE_ONBOARDING_SERVICE_ACCOUNT && task.containers?.length === 1
    && container.image === context.operatorRelease.image && Number(task.maxRetries) === 0
    && Number(task.timeoutSeconds) === 600 && Number(execution.spec.taskCount) === 1 && Number(execution.spec.parallelism) === 1
    && !container.command?.length && !container.args?.length && !container.env?.length
    && task.volumes?.length === 1 && volume.secret?.secretName === secret && volume.secret.items?.length === 1
    && volume.secret.items[0].key === "1" && volume.secret.items[0].path === "input.json"
    && container.volumeMounts?.length === 1 && container.volumeMounts[0].name === volume.name && container.volumeMounts[0].mountPath === "/secrets"
    && network?.length === 1 && network[0].network === e.GOOGLE_NETWORK && network[0].subnetwork === e.GOOGLE_SUBNET
    && annotations["run.googleapis.com/vpc-access-egress"] === "private-ranges-only",
  "Der bereitgestellte Job entspricht nicht dem bestätigten Laufzeitvertrag.");
}

export class GoogleOnboardingRuntime extends CommandOnlineOnboardingRuntime {
  constructor(context, { storage, gate = checkGoogleOnboardingGcp, ...dependencies } = {}) {
    super(context, dependencies);
    this.storage = storage || createOnboardingStorage({ bucket: context.baseEnvironment.GOOGLE_ONBOARDING_BUCKET,
      project: context.baseEnvironment.GCP_PROJECT_ID });
    this.gate = gate;
    this.phaseFile = path.join(context.runDirectory, "cloud-run-phase.json");
  }
  async json(args, options = {}) { return JSON.parse((await this.gcloud(args, options)).stdout); }
  async checkTarget() {
    return this.gate(this.context.baseEnvironment, this.context.operatorRelease, {
      read: (args) => this.json(args), now: this.now
    });
  }
  async preflight({ cleanupOnly = false } = {}) {
    const e = this.context.baseEnvironment;
    if (cleanupOnly) return { ok: true }; // only owned resources are touched during recovery
    const gate = await this.checkTarget();
    for (const sourcePath of SOURCE_PATHS) await this.command("git", ["cat-file", "-e", `${this.context.operatorRelease.source_commit}:${sourcePath}`]);
    const diff = await this.command("git", ["diff", "--quiet", this.context.operatorRelease.source_commit, "--", ...SOURCE_PATHS], { acceptedExitCodes: [0, 1] });
    const status = await this.command("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", ...SOURCE_PATHS]);
    demand(diff.exitCode === 0 && status.stdout.trim() === "", "Der Operator muss aus dem bestätigten sauberen Quellstand laufen.");
    const account = await this.json(["iam", "service-accounts", "describe", e.GOOGLE_ONBOARDING_SERVICE_ACCOUNT, `--project=${e.GCP_PROJECT_ID}`, "--format=json"]);
    demand(account.email === e.GOOGLE_ONBOARDING_SERVICE_ACCOUNT && account.disabled !== true, "Das eigene Operator-Dienstkonto ist nicht aktiv.");
    for (const name of [e.GOOGLE_ONBOARDING_BUCKET, this.context.operatorRelease.invitation_bucket]) {
      const b = await this.json(["storage", "buckets", "describe", `gs://${name}`, "--raw", "--format=json"]);
      demand(b.name === name && String(b.projectNumber) === gate.projectNumber && b.location?.toLowerCase() === e.GCP_REGION
        && b.iamConfiguration?.uniformBucketLevelAccess?.enabled === true && b.iamConfiguration?.publicAccessPrevention === "enforced"
        && b.versioning?.enabled !== true && String(b.softDeletePolicy?.retentionDurationSeconds || "0") === "0"
        && !b.retentionPolicy && (name !== e.GOOGLE_ONBOARDING_BUCKET || !b.lifecycle?.rule?.length),
      "Operator- und Einladungs-Bucket müssen getrennt, privat und generationengebunden löschbar sein.");
    }
    await this.gcloud(["artifacts", "docker", "images", "describe", this.context.operatorRelease.image, `--project=${e.GCP_PROJECT_ID}`, "--format=none"]);
    return { ok: true };
  }
  async acquireLock({ fingerprint, holderId, resume, cleanupOnly }) {
    this.holderId = holderId;
    const expected = { version: 1, holder: holderId, fingerprint, host: digest(os.hostname()), project: this.context.baseEnvironment.GCP_PROJECT_ID };
    const existing = await this.storage.read("locks/onboarding.json");
    if (existing) {
      demand(resume && JSON.stringify(existing.value) === JSON.stringify(expected), "Ein anderer oder fremder Onboarding-Lauf hält die Sperre.");
      return { lockId: existing.generation, cleanupOnly };
    }
    const created = await this.storage.create("locks/onboarding.json", expected);
    return { lockId: created.generation, cleanupOnly };
  }
  async releaseLock({ lock }) {
    // A missing execution/CREATE_USER result is not evidence of absence.
    await this.cleanupGuestOperator();
    const current = await this.storage.read("locks/onboarding.json");
    demand(current?.generation === lock.lockId && current.value.holder === this.holderId
      && current.value.fingerprint === this.context.fingerprint, "Die eigene Operator-Sperre konnte nicht bestätigt werden.");
    await this.storage.remove("locks/onboarding.json", lock.lockId);
  }
  async prepareGuestOperator() {
    await this.cleanupGuestOperator();
    await this.checkTarget();
    await this.createAccessOperator();
    return { ready: true };
  }
  async phaseDescriptor() {
    let d;
    try { d = await readProtected(this.phaseFile); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
    exactKeys(d, ["version", "job", "secret", "holder", "fingerprint", "phase", "inputFile", "executionIntent"]);
    demand(d.version === 1 && /^vk-onboard-[a-f0-9-]+$/u.test(d.job) && d.secret === `${d.job}-input`
      && d.holder === this.holderId && d.fingerprint === this.context.fingerprint
      && ["guest-preview", "guest-apply"].includes(d.phase)
      && d.inputFile === `${d.job}.json` && d.executionIntent === `${d.job}-execute.json`, "Der Cloud-Run-Ressourcennachweis gehört nicht zu diesem Lauf.");
    return d;
  }
  async getJob(name) {
    const e = this.context.baseEnvironment;
    const jobs = await this.json(["run", "jobs", "list", `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`, `--filter=metadata.name=${name}`, "--format=json"]);
    demand(Array.isArray(jobs) && jobs.length <= 1, "Der Cloud-Run-Jobbestand ist unklar.");
    if (!jobs.length) return null;
    return this.json(["run", "jobs", "describe", name, `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`, "--format=json"]);
  }
  async getSecret(name) {
    const e = this.context.baseEnvironment;
    const secrets = await this.json(["secrets", "list", `--project=${e.GCP_PROJECT_ID}`, `--filter=name:/${name}`, "--format=json"]);
    demand(Array.isArray(secrets) && secrets.length <= 1, "Der Operator-Secret-Bestand ist unklar.");
    if (!secrets.length) return null;
    demand(secrets[0].name.endsWith(`/secrets/${name}`), "Ein anderes Operator-Secret wurde gefunden.");
    return secrets[0];
  }
  assertOwner(labels) {
    demand(labels?.["managed-by"] === "vk-google-onboarding" && labels.holder === digest(this.holderId).slice(7, 70)
      && labels.input === this.context.fingerprint.slice(7, 70), "Eine fremde Cloud-Ressource darf nicht verändert werden.");
  }
  async executions(name) {
    const e = this.context.baseEnvironment;
    const values = await this.json(["run", "jobs", "executions", "list", `--job=${name}`, `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`, "--format=json"]);
    demand(Array.isArray(values) && values.length <= 1, "Ein Job darf genau einmal gestartet werden.");
    for (const value of values) demand(value.metadata?.labels?.["run.googleapis.com/job"] === name, "Eine fremde Ausführung wurde zurückgegeben.");
    return values;
  }
  terminal(execution) {
    return Boolean(execution?.status?.completionTime && Number.isFinite(Date.parse(execution.status.completionTime))
      && !execution.status.runningCount && !execution.status.pendingCount);
  }
  async cleanupGuestOperator() {
    const d = await this.phaseDescriptor();
    const e = this.context.baseEnvironment;
    if (d) {
      const job = await this.getJob(d.job);
      let executionIntent = false;
      try {
        const intent = await readProtected(path.join(this.context.runDirectory, d.executionIntent));
        demand(intent.job === d.job && intent.fingerprint === d.fingerprint && intent.holder === d.holder, "Der Ausführungsanker ist ungültig.");
        executionIntent = true;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (job) {
        this.assertOwner(job.metadata?.labels);
        if (executionIntent) {
          const runs = await this.executions(d.job);
          demand(runs.length === 1 && this.terminal(runs[0]), "Die Ausführung ist aktiv oder ihr Ausgang unbekannt; Ressourcen und Sperre bleiben erhalten.");
          const terminalPath = path.join(this.context.runDirectory, `${d.job}-terminal.json`);
          const terminal = { job: d.job, fingerprint: d.fingerprint };
          try { await writeProtected(terminalPath, terminal); }
          catch (error) {
            if (error.code !== "EEXIST") throw error;
            demand(JSON.stringify(await readProtected(terminalPath)) === JSON.stringify(terminal), "Der terminale Nachweis weicht ab.");
          }
          const evidence = await this.storage.read(`results/${d.job}.json`);
          if (evidence) {
            this.validateEvidence(evidence.value, d);
            const saved = path.join(this.context.runDirectory, `${d.job}-result.json`);
            try { await writeProtected(saved, evidence.value); }
            catch (error) {
              if (error.code !== "EEXIST") throw error;
              demand(JSON.stringify(await readProtected(saved)) === JSON.stringify(evidence.value), "Der gesicherte Nachweis weicht ab.");
            }
            await this.storage.remove(`results/${d.job}.json`, evidence.generation);
          }
        }
        await this.gcloud(["run", "jobs", "delete", d.job, `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`, "--quiet", "--format=none"]);
        demand(!await this.getJob(d.job), "Der Job-Cleanup ist unvollständig.");
      } else if (executionIntent) {
        // Deletion after a terminal readback is journaled before any delete.
        const completed = await readProtected(path.join(this.context.runDirectory, `${d.job}-terminal.json`));
        demand(completed.job === d.job && completed.fingerprint === d.fingerprint, "Der gelöschte Job besitzt keinen terminalen Nachweis.");
      }
      const secret = await this.getSecret(d.secret);
      if (secret) {
        this.assertOwner(secret.labels);
        await this.gcloud(["secrets", "delete", d.secret, `--project=${e.GCP_PROJECT_ID}`, "--quiet", "--format=none"]);
        demand(!await this.getSecret(d.secret), "Der Secret-Cleanup ist unvollständig.");
      }
      await fs.unlink(path.join(this.context.runDirectory, d.inputFile)).catch((error) => { if (error.code !== "ENOENT") throw error; });
      await fs.unlink(this.phaseFile);
    }
    for (const directory of await this.listPendingAccessOperatorDirectories()) await this.removePendingAccessOperatorDirectory(directory);
    for (const directory of await this.listAccessOperatorDirectories()) await this.deleteAccessOperatorDirectory(directory);
    return { complete: true };
  }
  validateEvidence(value, d) {
    exactKeys(value, ["version", "job", "fingerprint", "phase", "report"]);
    demand(value.version === 1 && value.job === d.job && value.fingerprint === d.fingerprint && value.phase === d.phase,
      "Der Jobnachweis ist nicht exakt an den Lauf gebunden.");
  }
  async runGuestPhase({ phase, label, preview = null }) {
    demand(!await this.phaseDescriptor(), "Ein vorheriger Job muss zuerst sicher bereinigt werden.");
    await this.checkTarget();
    const e = this.context.baseEnvironment;
    const directories = await this.listAccessOperatorDirectories();
    demand(directories.length === 1, "Der kurzlebige Datenbankzugang fehlt.");
    const job = `vk-onboard-${crypto.randomUUID()}`;
    const d = { version: 1, job, secret: `${job}-input`, holder: this.holderId, fingerprint: this.context.fingerprint,
      phase, inputFile: `${job}.json`, executionIntent: `${job}-execute.json` };
    const input = { version: 1, job, fingerprint: d.fingerprint, environment: e, release: this.context.operatorRelease,
      guest: this.context.guestAccess,
      database: parseDatabaseEnv(await fs.readFile(path.join(directories[0], "test-access-operator.env"), "utf8")),
      identity: this.context.identityReadbackEnvironment, phase,
      current_state_fingerprint: preview?.current_state_fingerprint || "" };
    await writeProtected(this.phaseFile, d);
    await writeProtected(path.join(this.context.runDirectory, d.inputFile), input);
    demand(!await this.getSecret(d.secret) && !await this.getJob(job), "Die create-only Ressourcen existieren bereits.");
    const labels = `managed-by=vk-google-onboarding,holder=${digest(this.holderId).slice(7, 70)},input=${d.fingerprint.slice(7, 70)}`;
    await this.gcloud(["secrets", "create", d.secret, `--project=${e.GCP_PROJECT_ID}`, "--replication-policy=user-managed",
      `--locations=${e.GCP_REGION}`, `--data-file=${path.join(this.context.runDirectory, d.inputFile)}`, `--labels=${labels}`, "--quiet", "--format=none"]);
    await this.gcloud(["secrets", "add-iam-policy-binding", d.secret, `--project=${e.GCP_PROJECT_ID}`,
      `--member=serviceAccount:${e.GOOGLE_ONBOARDING_SERVICE_ACCOUNT}`, "--role=roles/secretmanager.secretAccessor", "--condition=None", "--quiet", "--format=none"]);
    await this.gcloud(cloudRunJobArguments(this.context, job, d.secret, this.holderId));
    const live = await this.getJob(job);
    this.assertOwner(live?.metadata?.labels);
    assertCloudRunJob(live, this.context, d.secret);
    await writeProtected(path.join(this.context.runDirectory, d.executionIntent), { job, fingerprint: d.fingerprint, holder: this.holderId });
    // Exactly one dispatch. An uncertain response is recovered via execution readback.
    try { await this.gcloud(["run", "jobs", "execute", job, `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`, "--async", "--format=json"]); }
    catch { throw new Error("Jobstart unklar; nur --resume mit Ausführungsprüfung verwenden."); }
    let execution;
    const deadline = this.now().getTime() + 12 * 60 * 1000;
    while (this.now().getTime() < deadline) {
      const runs = await this.executions(job);
      if (runs.length && this.terminal(runs[0])) { execution = runs[0]; break; }
      await delay(5000);
    }
    demand(execution && execution.status.succeededCount === 1, "Der Job wurde nicht erfolgreich abgeschlossen; keine blinde Wiederholung.");
    await writeProtected(path.join(this.context.runDirectory, `${job}-terminal.json`), { job, fingerprint: d.fingerprint });
    const evidence = await this.storage.read(`results/${job}.json`);
    demand(evidence, "Der geschützte Jobnachweis fehlt.");
    this.validateEvidence(evidence.value, d);
    const report = evidence.value.report;
    const directory = await this.nextEvidenceDirectory(label);
    const reportPath = path.join(directory, `${phase}.log`);
    await writeProtected(reportPath, report);
    await writeProtected(path.join(this.context.runDirectory, `${job}-result.json`), evidence.value);
    await this.storage.remove(`results/${job}.json`, evidence.generation);
    // Keep the database login for the next phase; remove only this completed job and secret.
    await this.gcloud(["run", "jobs", "delete", job, `--project=${e.GCP_PROJECT_ID}`, `--region=${e.GCP_REGION}`, "--quiet", "--format=none"]);
    demand(!await this.getJob(job), "Der Job-Cleanup ist unvollständig.");
    await this.gcloud(["secrets", "delete", d.secret, `--project=${e.GCP_PROJECT_ID}`, "--quiet", "--format=none"]);
    demand(!await this.getSecret(d.secret), "Der Secret-Cleanup ist unvollständig.");
    await fs.unlink(path.join(this.context.runDirectory, d.inputFile));
    await fs.unlink(this.phaseFile);
    return { report, reportPath, resourceId: job };
  }
  async renderMail(options) {
    await this.checkTarget();
    return super.renderMail(options);
  }
  async previewMailSend() {
    await this.checkTarget();
    return super.previewMailSend();
  }
}

export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  const options = parseOnlineOnboardingArguments(argv);
  if (options.help) {
    console.log(legacyUsage().replaceAll("orchestrate_pre_gematik_online_onboarding.mjs", "orchestrate_google_onboarding.mjs")
      + "\nCloud-Run-Umgebung und Operator-Release v2 verwenden. Kein GKE, kein automatischer Mailversand.");
    return;
  }
  const context = await loadOnlineOnboardingContext(options, { environmentKeys: GOOGLE_ONBOARDING_ENV_KEYS,
    validateEnvironment: validateGoogleOnboardingEnvironment, validateRelease: validateGoogleOnboardingRelease });
  const runtime = new GoogleOnboardingRuntime({ ...context, googleService: context.baseEnvironment.GOOGLE_APP_SERVICE });
  // Unlike the legacy plan, the Cloud Run plan also checks the live target.
  if (!options.apply) await runtime.preflight();
  return executeOnlineOnboardingPreparation({ apply: options.apply, resume: options.resume, fingerprint: context.fingerprint,
    projectId: context.baseEnvironment.GCP_PROJECT_ID, accountFingerprint: context.accountFingerprint,
    guestFingerprint: context.guestFingerprint, invitationBucket: context.operatorRelease.invitation_bucket,
    runDirectory: context.runDirectory, operatorReleaseExpired: context.operatorReleaseExpired }, { runtime });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const reason = error instanceof GoogleOnboardingError || error instanceof OnlineOnboardingError
      ? error.message : "Freigaben und geschützten Laufzustand prüfen; keine Kontodaten wurden ausgegeben.";
    console.error(`Cloud-Run-Onboarding nicht abgeschlossen: ${reason}`);
    process.exitCode = 1;
  });
}
