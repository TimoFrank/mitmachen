import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scriptPath = "scripts/decommission_gcp_cloud_run_demo.sh";
const source = fs.readFileSync(scriptPath, "utf8");

assert.match(source, /^ACTION="plan"$/m, "Der Standardmodus muss read-only bleiben");
assert.match(source, /verify_snapshot_gate\n/, "Der Offline-Pfad muss ein Snapshot-Gate verwenden");
assert.match(source, /--scaling=0/, "Cloud Run muss reversibel ueber Manual Scaling 0 abgeschaltet werden");
assert.match(source, /transition_legacy_sql_activation "NEVER" "STOPPED"/, "Die Legacy-SQL-Instanz muss gestoppt, nicht geloescht werden");
assert.match(source, /--temporary-hold/, "Legacy-Objekte und Evidence muessen gegen vorzeitige Loeschung geschuetzt werden");
assert.match(source, /--manifest-sha256/, "Der Offline-Schritt muss an einen freigegebenen Manifest-Hash gebunden sein");
assert.match(source, /EXPECTED_PROJECT_ID="steam-capsule-341212"/, "Der Change muss auf das freigegebene Projekt begrenzt bleiben");
assert.match(source, /EXPECTED_PROJECT_NUMBER="765190393967"/, "Die unverwechselbare Projektnummer muss geprueft werden");
assert.match(source, /EXPECTED_REGION="europe-west3"/, "Die Region muss fail-closed feststehen");
assert.match(source, /schemaVersion "2"/, "Neue Evidence muss das gehaertete Schema 2 verwenden");
assert.match(source, /Offline mutation requires evidence manifest schema 2/, "Legacy-Evidence darf keine neue Offline-Mutation autorisieren");
assert.match(source, /sourceObjects/, "Das Manifest muss die aufbewahrten Objektgenerationen binden");
assert.match(source, /inventorySha256/, "Das Manifest muss das Vorher-Inventar kryptografisch binden");
assert.match(source, /verify_checksums "\$EVIDENCE_DIR\/pre"/, "Das Snapshot-Gate muss Inventar-Pruefsummen kontrollieren");
assert.match(source, /ensure_evidence_bucket_private "assert"/, "Die private Evidence-Ablage muss erneut geprueft werden");
assert.match(source, /create_final_data_snapshot_if_needed/, "Nach dem Disable muss ein finales Daten-Snapshot entstehen");
assert.match(source, /final_snapshot_exit_cleanup/, "Ein Abbruch des finalen Snapshots muss Legacy-SQL wieder stoppen");
assert.match(source, /--filter='status!=DONE'/, "Der SQL-Cleanup muss laufende Serveroperationen abwarten");
assert.match(source, /assert_services_disabled_for_final_snapshot/, "Der Post-Disable-Zustand muss vor dem finalen Backup erneut bewiesen werden");
assert.match(source, /verify_remote_prefix_held/, "Lokale Ready-Marker duerfen nur mit gehaltener Remote-Evidence gelten");
assert.match(source, /verify_remote_object_matches_local/, "Remote-Evidence muss ihrem lokalen Pruefsummenstand entsprechen");
assert.match(source, /verify_held_object_integrity/, "SQL-Exporte muessen generations- und hashgenau geprueft werden");
assert.match(source, /decommissionScopeResourcesDeleted: \[\]/, "Der Nachweis muss die Nicht-Loeschung scope-genau dokumentieren");

assert.doesNotMatch(source, /gcloud\s+run\s+services\s+delete/, "Cloud-Run-Loeschung gehoert nicht in den Abschalt-Change");
assert.doesNotMatch(source, /gcloud\s+sql\s+instances\s+delete/, "Cloud-SQL-Loeschung gehoert nicht in den Abschalt-Change");
assert.doesNotMatch(source, /gcloud\s+storage\s+(?:rm|buckets\s+delete)/, "Storage-Loeschung gehoert nicht in den Abschalt-Change");
assert.doesNotMatch(source, /gcloud\s+storage\s+objects\s+delete/, "Objekt-Loeschung gehoert nicht in den Abschalt-Change");
assert.doesNotMatch(source, /gcloud\s+secrets\s+delete/, "Secret-Loeschung gehoert nicht in den Abschalt-Change");
assert.doesNotMatch(source, /gcloud\s+artifacts\s+(?:repositories|docker\s+images)\s+delete/, "Artifact-Loeschung gehoert nicht in den Abschalt-Change");

const snapshotGateIndex = source.indexOf("  verify_snapshot_gate\n");
const cloudRunMutationIndex = source.indexOf("    gcloud run services update \"$service_name\"", snapshotGateIndex);
const finalSnapshotIndex = source.indexOf("  create_final_data_snapshot_if_needed\n", cloudRunMutationIndex);
assert.ok(snapshotGateIndex >= 0, "Snapshot-Gate im Offline-Ablauf fehlt");
assert.ok(cloudRunMutationIndex > snapshotGateIndex, "Cloud-Run-Mutation darf erst nach dem Snapshot-Gate erfolgen");
assert.ok(finalSnapshotIndex > cloudRunMutationIndex, "Der finale Datenstand muss erst nach dem Cloud-Run-Disable gesichert werden");

const help = spawnSync("bash", [scriptPath, "--help"], { encoding: "utf8" });
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /There is deliberately no delete\/purge action/);
assert.match(help.stdout, /PROJECT_ID:PROJECT_NUMBER:REGION:offline-cloud-run/);

const refusedDelete = spawnSync("bash", [scriptPath, "--project", "example-project", "--purge"], { encoding: "utf8" });
assert.notEqual(refusedDelete.status, 0, "Ein Purge-Aufruf muss abgewiesen werden");
assert.match(refusedDelete.stderr, /Deletion is intentionally not implemented/);

const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-run-decommission-contract-"));
try {
  const fakeBin = path.join(fakeRoot, "bin");
  const fakeLog = path.join(fakeRoot, "gcloud.log");
  const legacyEvidence = path.join(fakeRoot, "legacy-evidence");
  fs.mkdirSync(fakeBin);
  fs.mkdirSync(legacyEvidence);
  const fakeGcloud = path.join(fakeBin, "gcloud");
  fs.writeFileSync(
    fakeGcloud,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GCLOUD_LOG"
case "$*" in
  *"projects describe"*"projectId"*) printf '%s\\n' 'steam-capsule-341212'; exit 0 ;;
  *"projects describe"*"projectNumber"*) printf '%s\\n' '765190393967'; exit 0 ;;
esac
printf '%s\\n' "Unexpected fake gcloud call: $*" >&2
exit 99
`,
    { mode: 0o700 },
  );
  const fakeEnv = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    FAKE_GCLOUD_LOG: fakeLog,
  };
  const fixedConfirmation = "steam-capsule-341212:765190393967:europe-west3";

  const wrongRegion = spawnSync(
    "bash",
    [scriptPath, "--project", "steam-capsule-341212", "--region", "us-central1"],
    { encoding: "utf8", env: fakeEnv },
  );
  assert.notEqual(wrongRegion.status, 0, "Eine Region ausserhalb des festen Scopes muss scheitern");
  assert.match(wrongRegion.stderr, /only permits region europe-west3/);

  const oldConfirmation = spawnSync(
    "bash",
    [
      scriptPath,
      "--project",
      "steam-capsule-341212",
      "--snapshot",
      "--retain-until",
      "2026-08-19",
      "--confirm",
      "steam-capsule-341212:snapshot-cloud-run",
    ],
    { encoding: "utf8", env: fakeEnv },
  );
  assert.notEqual(oldConfirmation.status, 0, "Eine nicht an Projektnummer und Region gebundene Freigabe muss scheitern");
  assert.match(oldConfirmation.stderr, new RegExp(`${fixedConfirmation}:snapshot-cloud-run`));

  const invalidDate = spawnSync(
    "bash",
    [
      scriptPath,
      "--project",
      "steam-capsule-341212",
      "--snapshot",
      "--retain-until",
      "2026-02-30",
      "--confirm",
      `${fixedConfirmation}:snapshot-cloud-run`,
    ],
    { encoding: "utf8", env: fakeEnv },
  );
  assert.notEqual(invalidDate.status, 0, "Ein normalisiertes ungueltiges Kalenderdatum muss scheitern");
  assert.match(invalidDate.stderr, /Invalid calendar date|Invalid retention date/);

  const legacyManifest = JSON.stringify({ schemaVersion: "1" });
  fs.writeFileSync(path.join(legacyEvidence, "manifest.json"), legacyManifest);
  fs.writeFileSync(path.join(legacyEvidence, "SNAPSHOT_READY.json"), "{}\n");
  const legacyHash = crypto.createHash("sha256").update(legacyManifest).digest("hex");
  const legacyOffline = spawnSync(
    "bash",
    [
      scriptPath,
      "--project",
      "steam-capsule-341212",
      "--offline",
      "--evidence-dir",
      legacyEvidence,
      "--manifest-sha256",
      legacyHash,
      "--confirm",
      `${fixedConfirmation}:offline-cloud-run`,
    ],
    { encoding: "utf8", env: fakeEnv },
  );
  assert.notEqual(legacyOffline.status, 0, "Schema-1-Evidence darf keine neue Mutation autorisieren");
  assert.match(legacyOffline.stderr, /requires evidence manifest schema 2/);

  const fakeCalls = fs.readFileSync(fakeLog, "utf8");
  assert.doesNotMatch(
    fakeCalls,
    /run services update|sql (?:instances patch|backups create|export)|storage objects update/,
    "Fail-closed Vorpruefungen duerfen keine Cloud-Mutation erreichen",
  );
} finally {
  fs.rmSync(fakeRoot, { recursive: true, force: true });
}

console.log("Cloud Run decommission contract passed.");
