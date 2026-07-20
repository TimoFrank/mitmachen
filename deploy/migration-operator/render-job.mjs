#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IMAGE_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]+)?\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/u;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const REGION_PATTERN = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const PLACEHOLDER = "REPLACE_WITH_IMMUTABLE_OPERATOR_IMAGE";

export function renderJob({ image, projectId, region }) {
  if (!PROJECT_PATTERN.test(String(projectId || "")) || !REGION_PATTERN.test(String(region || ""))) {
    throw new Error("The target project or region is malformed.");
  }
  if (!IMAGE_PATTERN.test(String(image || ""))) {
    throw new Error("The operator image must use an immutable sha256 digest.");
  }
  const expectedPrefix = `${region}-docker.pkg.dev/${projectId}/`;
  if (!image.startsWith(expectedPrefix)) {
    throw new Error("The operator image is outside the approved target project and region.");
  }
  const templatePath = fileURLToPath(new URL("job.template.yaml", import.meta.url));
  const template = readFileSync(templatePath, "utf8");
  if (template.split(PLACEHOLDER).length !== 2) {
    throw new Error("The migration Job template has an invalid image placeholder contract.");
  }
  return template.replace(PLACEHOLDER, image);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value || !["--image", "--project", "--region"].includes(option)) {
      throw new Error("Usage: render-job.mjs --image <digest-ref> --project <id> --region <region>");
    }
    values[option] = value;
  }
  if (Object.keys(values).length !== 3) throw new Error("All renderer arguments are required exactly once.");
  return values;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const values = parseArguments(process.argv.slice(2));
    process.stdout.write(renderJob({
      image: values["--image"],
      projectId: values["--project"],
      region: values["--region"]
    }));
  } catch {
    process.stderr.write("The migration Job could not be rendered safely.\n");
    process.exitCode = 2;
  }
}
