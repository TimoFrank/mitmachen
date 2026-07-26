import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const defaultSingleHtmlOutputPath = resolve(
  projectRoot,
  "output/single-hospitation/Hospitations-Modul-Einzeldatei.html"
);
export const defaultSingleHtmlArtifactsDir = resolve(
  projectRoot,
  "output/playwright/single-hospitation"
);

export function resolveCliPath(value) {
  return resolve(process.cwd(), String(value || ""));
}

export function configuredSingleHtmlOutput(value = "") {
  const configured = String(value || process.env.HOSPITATION_SINGLE_OUTPUT || "").trim();
  return configured ? resolveCliPath(configured) : defaultSingleHtmlOutputPath;
}

export function configuredSingleHtmlSource(value = "") {
  const configured = String(value || process.env.HOSPITATION_SINGLE_SOURCE || "").trim();
  if (!configured) {
    throw new Error(
      "Quellverzeichnis fehlt. Bitte --source <Verzeichnis> oder HOSPITATION_SINGLE_SOURCE setzen."
    );
  }
  return resolveCliPath(configured);
}
