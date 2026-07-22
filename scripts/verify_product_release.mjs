import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function argument(name, { required = true } = {}) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] || "" : "";
  if (required && !value) throw new Error(`--${name} fehlt.`);
  return value;
}

function read(file) {
  return readFileSync(file, "utf8");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseVersion(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

function normalizeVersion(value) {
  const parts = parseVersion(value);
  return parts ? parts.join(".") : "";
}

function count(values, expected) {
  return values.filter((value) => value === expected).length;
}

const tag = argument("tag");
const commitSha = argument("commit-sha");
const notesPath = argument("notes-path");
const artifactRoot = argument("artifact-root", { required: false });

if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Ungültiger Produkt-Tag: ${tag}`);
if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error(`Ungültiger Release-Commit: ${commitSha}`);

const version = tag.slice(1);
const head = git(["rev-parse", "HEAD"]);
if (head !== commitSha) throw new Error(`HEAD ${head} entspricht nicht dem Release-Commit ${commitSha}.`);

const appSource = read("frontend/app/versorgungs-kompass.js");
const appVersions = [...appSource.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)].map((match) => match[1]);
if (count(appVersions, version) !== 1) {
  throw new Error(`Die In-App-Historie muss ${version} genau einmal enthalten.`);
}

const changelog = read("CHANGELOG.md");
const changelogVersions = [...changelog.matchAll(/^## Version (\d+\.\d+(?:\.\d+)?)\s+-/gm)]
  .map((match) => normalizeVersion(match[1]));
if (count(changelogVersions, version) !== 1) {
  throw new Error(`Der Changelog muss ${version} genau einmal enthalten.`);
}

if (!existsSync(notesPath)) throw new Error(`Release Notes fehlen: ${notesPath}`);
const notes = read(notesPath);
if (!notes.startsWith("# ") || !notes.includes(`## Das steckt in Version ${version}`)) {
  throw new Error(`Release Notes sind nicht konsistent mit ${version}: ${notesPath}`);
}

const readme = read("README.md");
const releaseLink = `https://github.com/TimoFrank/mitmachen/releases/tag/${tag}`;
if (readme.split(releaseLink).length - 1 !== 1) {
  throw new Error(`README muss genau einmal auf ${tag} verweisen.`);
}

if (artifactRoot) {
  const manifestPath = path.join(artifactRoot, "build-manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Build-Manifest fehlt: ${manifestPath}`);
  const manifest = JSON.parse(read(manifestPath));
  if (manifest.profile !== "pages") throw new Error("Release-Artefakt verwendet nicht das Pages-Profil.");
  if (manifest.revision !== commitSha) {
    throw new Error(`Build-Manifest referenziert ${manifest.revision} statt ${commitSha}.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.artifactDigest || "")) {
    throw new Error("Build-Manifest enthält keinen gültigen Artefakt-Digest.");
  }
}

console.log(`Produkt-Release verifiziert: ${tag} @ ${commitSha}`);
