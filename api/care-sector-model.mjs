import "../frontend/data/sector-registry.js";

export const careSectorRegistry = globalThis.VersorgungsCompassSectors;

function sectorValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function careSectorForRead(value) {
  const raw = String(value || "").trim();
  if (!raw || careSectorRegistry.isExcludedSector(raw)) return "";
  return careSectorRegistry.normalizeSector(raw, "");
}

export function careSectorForWrite(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (careSectorRegistry.isExcludedSector(raw)) {
    throw sectorValidationError("Digital Health ist ein Thema bzw. Querschnittsbereich und kein Versorgungssektor.");
  }
  const sector = careSectorRegistry.find(raw);
  if (!sector) {
    throw sectorValidationError(`Unbekannter Versorgungssektor: ${raw}. Bitte einen Wert aus dem Sektorkatalog verwenden.`);
  }
  return sector.label;
}
