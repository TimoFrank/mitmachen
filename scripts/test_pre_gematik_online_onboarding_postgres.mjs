#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";
import { EXPECTED_IAP_ISSUER } from "./provision_iap_identity_bindings.mjs";
import {
  executeIdentityPlatformGuestProfileCreationTransaction,
  identityPlatformGuestAccessFingerprint,
  identityPlatformGuestSubject,
  validateIdentityPlatformGuestAccessDocument
} from "./provision_pre_gematik_identity_platform_guest_access.mjs";

const { Client } = pg;
const requireDocker = process.argv.includes("--require-docker");
const dockerImage = "postgres:16-alpine";
const schemaSql = readFileSync(
  new URL("../deploy/postgres/pre-gematik/schema.sql", import.meta.url),
  "utf8"
);
const runtimeRoleSql = readFileSync(
  new URL("../deploy/postgres/pre-gematik/runtime-role.sql", import.meta.url),
  "utf8"
);
const grantsSql = readFileSync(
  new URL("../deploy/postgres/pre-gematik/grants.sql", import.meta.url),
  "utf8"
);
const accessRoleSql = readFileSync(
  new URL("../deploy/postgres/pre-gematik/access-enrollment-admin-role.sql", import.meta.url),
  "utf8"
);

function dockerAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function runDocker(args, { input = undefined, quiet = false } = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: quiet ? "ignore" : input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    timeout: 180_000
  });
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || "unbekannter Docker-Fehler";
    throw new Error(`Docker-Aufruf fehlgeschlagen: ${String(detail).trim()}`);
  }
  return String(result.stdout || "").trim();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function waitForPostgres(containerName) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres", "-d", "postgres"],
      { stdio: "ignore" }
    );
    if (
      result.status === 0
      && `${logs.stdout || ""}\n${logs.stderr || ""}`.includes(
        "PostgreSQL init process complete; ready for start up."
      )
    ) return;
    await delay(100);
  }
  throw new Error("Der PostgreSQL-16-Testcontainer wurde nicht rechtzeitig bereit.");
}

function runPsql(containerName, input, variables = []) {
  runDocker([
    "exec", "-i", containerName,
    "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
    ...variables.flatMap(([key, value]) => ["-v", `${key}=${value}`])
  ], { input });
}

function guestDocument(suffix) {
  return validateIdentityPlatformGuestAccessDocument({
    version: 1,
    project_id: "online-contract-123",
    uid: `online_uid_${suffix}`,
    email: `online-onboarding-${suffix}@example.invalid`,
    profile_id: crypto.randomUUID(),
    display_name: `Synthetisches Online-Onboarding ${suffix}`,
    role: "viewer",
    scope_ref: `external-pilot:synthetic-${suffix}`
  });
}

async function readTargetState(client, document) {
  const subject = identityPlatformGuestSubject(document.project_id, document.uid);
  const result = await client.query(
    `select
       (select count(*)::integer from public.profiles where id = $1) as profile_count,
       (select count(*)::integer
          from public.identity_bindings
         where issuer = $2 and subject = $3) as binding_count`,
    [document.profile_id, EXPECTED_IAP_ISSUER, subject]
  );
  return result.rows[0];
}

function identityEvidence(document) {
  return Object.freeze({
    issuer: EXPECTED_IAP_ISSUER,
    subject: identityPlatformGuestSubject(document.project_id, document.uid),
    provider: "password"
  });
}

function instrumentClient(client, { afterProfileInsert = undefined } = {}) {
  return {
    async query(sql, values) {
      const result = await client.query(sql, values);
      if (/^insert into public\.profiles\b/u.test(String(sql).trim())) {
        await afterProfileInsert?.();
      }
      return result;
    }
  };
}

function previewProfileCreation(client, document) {
  return executeIdentityPlatformGuestProfileCreationTransaction({
    client,
    document,
    fingerprint: identityPlatformGuestAccessFingerprint(document),
    apply: false,
    verifyIdentity: async () => identityEvidence(document),
    log: () => {}
  });
}

function applyProfileCreation({ client, document, preview, afterProfileInsert, logs }) {
  return executeIdentityPlatformGuestProfileCreationTransaction({
    client: instrumentClient(client, { afterProfileInsert }),
    document,
    fingerprint: identityPlatformGuestAccessFingerprint(document),
    apply: true,
    confirmedCurrentStateFingerprint: preview.currentStateFingerprint,
    expectedDatabase: "postgres",
    verifyIdentity: async () => identityEvidence(document),
    log: (value) => logs.push(value)
  });
}

async function waitForOperationEvent(eventPromise, operationPromise, label) {
  let timeout;
  try {
    await Promise.race([
      eventPromise,
      operationPromise.then(
        () => {
          throw new Error(`${label}: Die Operation endete vor dem erwarteten Ereignis.`);
        },
        (error) => {
          throw error;
        }
      ),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label}: Zeitgrenze von 15 Sekunden ueberschritten.`)),
          15_000
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForAdvisoryWait(adminClient, applicationName) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await adminClient.query(
      `select wait_event_type, wait_event
         from pg_catalog.pg_stat_activity
        where application_name = $1`,
      [applicationName]
    );
    if (
      result.rows.some((row) =>
        row.wait_event_type === "Lock" && String(row.wait_event).toLowerCase() === "advisory"
      )
    ) {
      return;
    }
    await delay(50);
  }
  throw new Error("Die zweite Neuanlage wartete nicht nachweisbar auf dem gemeinsamen Advisory Lock.");
}

function assertOnlyAtomicObservations(observations, label) {
  assert.ok(observations.length > 0, `${label}: Es fehlen Laufzeitbeobachtungen.`);
  for (const observation of observations) {
    assert.ok(
      (observation.profile_count === 0 && observation.binding_count === 0)
        || (observation.profile_count === 1 && observation.binding_count === 1),
      `${label}: Ein Teilzustand wurde sichtbar: ${JSON.stringify(observation)}`
    );
  }
}

if (!dockerAvailable()) {
  if (requireDocker) {
    throw new Error("Docker ist fuer den verpflichtenden Online-Onboarding-PostgreSQL-Test nicht verfuegbar.");
  }
  console.log("SKIP: Docker ist fuer den Online-Onboarding-PostgreSQL-Test nicht verfuegbar.");
  process.exit(0);
}

const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const containerName = `vk-online-onboarding-pg-${suffix}`;
const databasePassword = `vk-online-db-${suffix}`;
const writerRole = `vk_online_writer_${process.pid}_${crypto.randomBytes(3).toString("hex")}`;
const writerPassword = `vk-online-writer-${suffix}`;
const runtimeLogin = `vk_online_reader_${process.pid}_${crypto.randomBytes(3).toString("hex")}`;
const runtimePassword = `vk-online-reader-${suffix}`;
const clients = new Set();
let containerStarted = false;

try {
  runDocker([
    "run", "-d", "--rm",
    "--name", containerName,
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-p", "127.0.0.1::5432",
    dockerImage
  ]);
  containerStarted = true;
  await waitForPostgres(containerName);
  const port = Number(runDocker(["port", containerName, "5432/tcp"]).split(":").at(-1));
  assert.ok(Number.isInteger(port) && port > 0, "Der lokale PostgreSQL-Port fehlt.");

  runPsql(containerName, schemaSql);
  runPsql(containerName, runtimeRoleSql);
  runPsql(containerName, grantsSql, [["runtime_role", "vk_app_runtime"]]);
  runPsql(containerName, accessRoleSql);

  const connectionBase = {
    host: "127.0.0.1",
    port,
    database: "postgres"
  };
  const connect = async ({ user, password, applicationName }) => {
    const client = new Client({
      ...connectionBase,
      user,
      password,
      application_name: applicationName,
      query_timeout: 35_000
    });
    await client.connect();
    clients.add(client);
    return client;
  };

  const adminClient = await connect({
    user: "postgres",
    password: databasePassword,
    applicationName: `vk-online-contract-admin-${suffix}`
  });
  await adminClient.query(`
    create role cloudsqlsuperuser nologin;
    create role ${writerRole} login inherit password '${writerPassword}';
    grant vk_access_enrollment_admin to ${writerRole} with inherit true, set true;
    create role ${runtimeLogin} login noinherit password '${runtimePassword}';
    grant vk_app_runtime to ${runtimeLogin};
  `);

  const runtimeClient = await connect({
    user: runtimeLogin,
    password: runtimePassword,
    applicationName: `vk-online-contract-runtime-${suffix}`
  });
  await runtimeClient.query("set role vk_app_runtime");
  await runtimeClient.query("set statement_timeout = '3s'");

  // Vertrag 1: Die App liest waehrend der atomaren Neuanlage weiter. Selbst
  // zwischen den beiden INSERTs der produktiven Transaktion bleibt der
  // uncommittete Teilzustand unsichtbar.
  const visibilityDocument = guestDocument(`visibility-${suffix}`);
  const visibilityWriter = await connect({
    user: writerRole,
    password: writerPassword,
    applicationName: `vk-online-contract-visibility-${suffix}`
  });
  const visibilityPreview = await previewProfileCreation(visibilityWriter, visibilityDocument);
  assert.equal(visibilityPreview.action, "create_profile_and_binding");
  const profileInserted = deferred();
  const continueVisibilityWriter = deferred();
  const visibilityLogs = [];
  let visibilityProfileInserts = 0;
  const visibilityApply = applyProfileCreation({
    client: visibilityWriter,
    document: visibilityDocument,
    preview: visibilityPreview,
    logs: visibilityLogs,
    afterProfileInsert: async () => {
      visibilityProfileInserts += 1;
      profileInserted.resolve();
      await continueVisibilityWriter.promise;
    }
  });
  let visibilityCheckError;
  try {
    await waitForOperationEvent(
      profileInserted.promise,
      visibilityApply,
      "Profil-INSERT der produktiven Sichtbarkeitstransaktion"
    );
    assert.deepEqual(
      await readTargetState(runtimeClient, visibilityDocument),
      { profile_count: 0, binding_count: 0 },
      "Der Runtime-Reader muss waehrend der offenen Transaktion sofort den alten 0/0-Stand sehen."
    );
  } catch (error) {
    visibilityCheckError = error;
  } finally {
    continueVisibilityWriter.resolve();
  }
  const [visibilitySettlement] = await Promise.allSettled([visibilityApply]);
  if (visibilityCheckError) throw visibilityCheckError;
  if (visibilitySettlement.status === "rejected") throw visibilitySettlement.reason;
  assert.equal(visibilitySettlement.value.action, "unchanged");
  assert.equal(visibilityProfileInserts, 1);
  assert.equal(visibilityLogs.length, 1);
  assert.equal(
    JSON.parse(visibilityLogs[0]).result,
    "create_profile_and_binding_completed"
  );
  assert.deepEqual(
    await readTargetState(runtimeClient, visibilityDocument),
    { profile_count: 1, binding_count: 1 }
  );

  // Vertrag 2: Zwei gleichzeitige Neuanlagen teilen denselben Advisory Lock.
  // Genau eine produktive Transaktion schreibt; die zweite scheitert mit ihrem
  // bestaetigten leeren Preview-Snapshot sicher geschlossen.
  const concurrencyDocument = guestDocument(`concurrency-${suffix}`);
  const firstApplicationName = `vk-online-contract-first-${suffix}`;
  const secondApplicationName = `vk-online-contract-second-${suffix}`;
  const firstWriter = await connect({
    user: writerRole,
    password: writerPassword,
    applicationName: firstApplicationName
  });
  const secondWriter = await connect({
    user: writerRole,
    password: writerPassword,
    applicationName: secondApplicationName
  });
  const concurrencyPreview = await previewProfileCreation(firstWriter, concurrencyDocument);
  assert.equal(concurrencyPreview.action, "create_profile_and_binding");
  const firstProfileInserted = deferred();
  const continueFirstWriter = deferred();
  const firstLogs = [];
  const secondLogs = [];
  let successfulProfileInserts = 0;
  const firstApply = applyProfileCreation({
    client: firstWriter,
    document: concurrencyDocument,
    preview: concurrencyPreview,
    logs: firstLogs,
    afterProfileInsert: async () => {
      successfulProfileInserts += 1;
      firstProfileInserted.resolve();
      await continueFirstWriter.promise;
    }
  });
  const observations = [];
  let secondApply;
  let monitorActive = false;
  let monitor = Promise.resolve();
  let concurrencyCheckError;
  try {
    await waitForOperationEvent(
      firstProfileInserted.promise,
      firstApply,
      "Erster Profil-INSERT der Konkurrenzpruefung"
    );
    secondApply = applyProfileCreation({
      client: secondWriter,
      document: concurrencyDocument,
      preview: concurrencyPreview,
      logs: secondLogs,
      afterProfileInsert: async () => {
        successfulProfileInserts += 1;
      }
    });
    await waitForOperationEvent(
      waitForAdvisoryWait(adminClient, secondApplicationName),
      secondApply,
      "Advisory-Lock-Wartezustand der zweiten produktiven Transaktion"
    );
    const blockedState = await readTargetState(runtimeClient, concurrencyDocument);
    observations.push(blockedState);
    assert.deepEqual(
      blockedState,
      { profile_count: 0, binding_count: 0 },
      "Auch waehrend die zweite Anlage am Advisory Lock wartet, darf kein Teilzustand sichtbar sein."
    );

    const monitorObserved = deferred();
    monitorActive = true;
    monitor = (async () => {
      while (monitorActive) {
        observations.push(await readTargetState(runtimeClient, concurrencyDocument));
        monitorObserved.resolve();
        await delay(20);
      }
    })();
    await waitForOperationEvent(
      monitorObserved.promise,
      firstApply,
      "Runtime-Beobachtung vor Freigabe der ersten Transaktion"
    );
  } catch (error) {
    concurrencyCheckError = error;
  } finally {
    continueFirstWriter.resolve();
  }

  const operations = [firstApply, ...(secondApply ? [secondApply] : [])];
  const results = await Promise.allSettled(operations);
  monitorActive = false;
  const [monitorSettlement] = await Promise.allSettled([monitor]);
  if (!concurrencyCheckError && monitorSettlement.status === "rejected") {
    concurrencyCheckError = monitorSettlement.reason;
  }
  observations.push(await readTargetState(runtimeClient, concurrencyDocument));
  if (concurrencyCheckError) throw concurrencyCheckError;
  assert.equal(results.length, 2, "Beide konkurrierenden produktiven Transaktionen muessen gelaufen sein.");
  assert.equal(results[0].status, "fulfilled", "Die zuerst schreibende Transaktion muss committen.");
  assert.equal(results[0].value.action, "unchanged");
  assert.equal(results[1].status, "rejected", "Die zweite Transaktion muss fail-closed abbrechen.");
  assert.ok(
    ["40001", "23505"].includes(results[1].reason?.code)
      || /current_state_fingerprint|could not serialize|duplicate key/iu.test(
        String(results[1].reason?.message || "")
      ),
    `Die zweite Transaktion lieferte keine sichere Kollision: ${results[1].reason?.message || results[1].reason}`
  );
  assert.equal(successfulProfileInserts, 1, "Nur ein Profil-INSERT darf erfolgreich sein.");
  assert.equal(
    [...firstLogs, ...secondLogs]
      .map((value) => JSON.parse(value).result)
      .filter((result) => result === "create_profile_and_binding_completed").length,
    1,
    "Nur eine produktive Transaktion darf einen erfolgreichen Abschluss protokollieren."
  );
  assertOnlyAtomicObservations(observations, "Konkurrierende Online-Neuanlage");
  assert.ok(
    observations.some((state) => state.profile_count === 0 && state.binding_count === 0),
    "Der vollstaendig alte Zustand muss waehrend der Konkurrenz sichtbar bleiben."
  );
  assert.deepEqual(
    observations.at(-1),
    { profile_count: 1, binding_count: 1 }
  );

  console.log(
    "OK: PostgreSQL 16 bestaetigt nicht blockierende Runtime-Reads, atomare Sichtbarkeit und fail-closed Konkurrenz fuer das Online-Onboarding."
  );
} finally {
  await Promise.allSettled([...clients].map((client) => client.end()));
  if (containerStarted) runDocker(["rm", "-f", containerName], { quiet: true });
}
