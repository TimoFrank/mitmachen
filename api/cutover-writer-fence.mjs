import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const FENCE_CONTRACT = "schemaVersion=1\n";
const FENCE_CONTRACT_FILE = ".writer-fence-ready";
const TRANSITION_MARKER_FILE = ".cutover-mode-change-pending";

function unavailableError() {
  const error = new Error("Schreibzugriffe sind waehrend eines Cutover-Uebergangs gesperrt.");
  error.status = 503;
  error.retryAfter = 60;
  return error;
}

export function validateApiWriterFenceConfiguration(env = {}) {
  const directory = String(env.API_WRITER_FENCE_DIRECTORY || "").trim();
  const required = env.API_CUTOVER_MODE_REQUIRED === "1";
  if (!directory && !required) return "";
  if (
    !directory
    || !path.isAbsolute(directory)
    || path.normalize(directory) !== directory
    || directory === path.parse(directory).root
  ) {
    throw new Error("API_WRITER_FENCE_DIRECTORY muss fuer diesen Betrieb ein kanonisches absolutes Verzeichnis sein.");
  }
  return directory;
}

export function assertApiWriterFencePermission(directory, policy, fileSystem = { lstatSync, readFileSync }) {
  if (!directory || policy?.writeClass === "read") return;

  try {
    const contractPath = path.join(directory, FENCE_CONTRACT_FILE);
    const contractStat = fileSystem.lstatSync(contractPath);
    if (!contractStat.isFile() || contractStat.isSymbolicLink()) throw unavailableError();
    const contract = fileSystem.readFileSync(contractPath, "utf8");
    if (contract !== FENCE_CONTRACT) throw unavailableError();
  } catch (error) {
    if (error?.status === 503) throw error;
    throw unavailableError();
  }

  try {
    fileSystem.lstatSync(path.join(directory, TRANSITION_MARKER_FILE));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw unavailableError();
  }
  throw unavailableError();
}
