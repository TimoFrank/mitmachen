#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const common = path.join(projectRoot, "deploy", "single-server", "common.sh");
const operationId = "20260911T120000Z-4242";
const scratch = mkdtempSync(path.join(os.tmpdir(), "vk-backup-recovery-"));

const harness = [
  "set -Eeuo pipefail",
  'source "$COMMON_SH"',
  "REMOVED=0",
  "docker() {",
  '  if [[ "$1" == "container" && "$2" == "ls" ]]; then',
  '    [[ "${FAIL_LIST:-0}" != "1" ]] || return 93',
  '    if [[ "$REMOVED" != "1" ]]; then',
  '      printf \'%s\\n\' "versorgungs-kompass-backup-$OPERATION_ID-$EXISTING_SERVICE"',
  "    fi",
  "    return",
  "  fi",
  '  if [[ "$1" == "container" && "$2" == "inspect" && "${3:-}" != "--format" ]]; then',
  '    [[ "$3" == "versorgungs-kompass-backup-$OPERATION_ID-$EXISTING_SERVICE" ]]',
  "    return",
  "  fi",
  '  if [[ "$1" == "container" && "$2" == "inspect" && "${3:-}" == "--format" ]]; then',
  '    case "$4" in',
  '      *com.docker.compose.project*) printf \'%s\\n\' "${PROJECT_LABEL:-versorgungs-kompass-single-server}" ;;',
  '      *com.docker.compose.service*) printf \'%s\\n\' "$EXISTING_SERVICE" ;;',
  '      *com.docker.compose.oneoff*) printf \'%s\\n\' "True" ;;',
  "      *) return 91 ;;",
  "    esac",
  "    return",
  "  fi",
  '  if [[ "$1" == "container" && "$2" == "rm" && "$3" == "--force" && "$4" == "--" ]]; then',
  '    printf \'%s\\n\' "$5" >>"$DOCKER_LOG"',
  "    REMOVED=1",
  "    return",
  "  fi",
  "  return 92",
  "}",
  'single_server_remove_interrupted_backup_containers "$OPERATION_ID"',
  ""
].join("\n");

function runScenario(existingService, projectLabel = "versorgungs-kompass-single-server", failList = false) {
  const log = path.join(scratch, `${existingService}-${projectLabel}.log`);
  const result = spawnSync("bash", ["-c", harness], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      COMMON_SH: common,
      DOCKER_LOG: log,
      EXISTING_SERVICE: existingService,
      OPERATION_ID: operationId,
      PROJECT_LABEL: projectLabel,
      FAIL_LIST: failList ? "1" : "0"
    }
  });
  return { result, log };
}

try {
  for (const service of ["database-dump", "restic-backup"]) {
    const { result, log } = runScenario(service);
    assert.equal(result.status, 0, `Recovery fuer Hard-Kill waehrend ${service} fehlgeschlagen: ${result.stderr}`);
    assert.equal(
      readFileSync(log, "utf8").trim(),
      `versorgungs-kompass-backup-${operationId}-${service}`,
      `Recovery muss genau den gebundenen ${service}-Container entfernen.`
    );
  }

  const mismatch = runScenario("restic-backup", "fremdes-projekt");
  assert.notEqual(mismatch.result.status, 0, "Ein gleichnamiger fremder Container muss fail-closed stoppen.");
  assert.match(mismatch.result.stderr, /unerwartete Compose-Labels/u);
  const unreadableInventory = runScenario("restic-backup", "versorgungs-kompass-single-server", true);
  assert.notEqual(unreadableInventory.result.status, 0, "Ein nicht lesbares Docker-Inventar darf nie als Container-Abwesenheit gelten.");
  assert.match(unreadableInventory.result.stderr, /Containerinventar.*nicht lesbar/u);
  console.log("Single-server backup recovery test OK: dump/restic hard-kill cleanup is operation-bound and fail-closed.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
