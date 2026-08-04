#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReleaseConfig } from "./lib/release_policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.stdout.write(`${loadReleaseConfig(root).productVersion}\n`);
