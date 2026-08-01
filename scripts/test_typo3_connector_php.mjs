import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectorRoot = path.join(projectRoot, "integrations/typo3/mitmachen_connector");
const gateImage = "versorgungs-kompass/mitmachen-connector-php-gate:php-8.2.29-composer-2.8.12";

function fail(message) {
  console.error(`TYPO3 PHP gate failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
    ...options
  });
  if (result.error) {
    fail(`${command} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} exited with status ${result.status ?? "unknown"}.`);
  }
}

for (const requiredFile of ["composer.json", "composer.lock", "phpunit.xml.dist"]) {
  const requiredPath = path.join(connectorRoot, requiredFile);
  if (!fs.existsSync(requiredPath) || !fs.statSync(requiredPath).isFile()) {
    fail(`${requiredFile} is missing from integrations/typo3/mitmachen_connector.`);
  }
}

const dockerProbe = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
  encoding: "utf8"
});
if (dockerProbe.error || dockerProbe.status !== 0 || dockerProbe.stdout.trim() === "") {
  fail("a reachable Docker daemon is required; the gate does not skip PHP validation.");
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mitmachen-connector-php-"));
const workspace = path.join(temporaryRoot, "workspace");
fs.cpSync(connectorRoot, workspace, {
  recursive: true,
  filter(source) {
    const relative = path.relative(connectorRoot, source);
    return relative !== "vendor"
      && !relative.startsWith(`vendor${path.sep}`)
      && relative !== ".phpunit.cache"
      && !relative.startsWith(`.phpunit.cache${path.sep}`);
  }
});

const userArgs = typeof process.getuid === "function" && typeof process.getgid === "function"
  ? ["--user", `${process.getuid()}:${process.getgid()}`]
  : [];
try {
  console.log("TYPO3 PHP gate: build digest-pinned PHP 8.2 test image");
  run("docker", [
    "build",
    "--file", path.join(connectorRoot, "Dockerfile.test"),
    "--tag", gateImage,
    connectorRoot
  ]);

  console.log("TYPO3 PHP gate: locked Composer install, PHP lint and PHPUnit");
  run("docker", [
    "run", "--rm",
    ...userArgs,
    "--mount", `type=bind,source=${workspace},target=/workspace`,
    "--workdir", "/workspace",
    "--env", "COMPOSER_HOME=/workspace/.composer-home",
    "--env", "HOME=/workspace/.home",
    "--entrypoint", "sh",
    gateImage,
    "-euc",
    [
      "php -r 'if (PHP_VERSION_ID < 80200 || PHP_VERSION_ID >= 80300) { fwrite(STDERR, \"The minimum-platform gate must run on PHP 8.2.x.\\n\"); exit(1); }'",
      "composer validate --strict --no-check-publish",
      "composer install --no-interaction --no-progress --prefer-dist",
      "composer check-platform-reqs",
      "composer audit --locked --abandoned=report",
      "composer run test:lint",
      "composer run test"
    ].join(" && ")
  ]);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("TYPO3 PHP gate passed (PHP 8.2 lint, locked Composer install, PHPUnit).\n");
