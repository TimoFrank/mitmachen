import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "versorgungs-target-config-"));
const dataDir = path.join(fixtureRoot, "data");
const configPath = path.join(dataDir, "runtime-config.js");
const htmlPath = path.join(fixtureRoot, "index.html");
const demoDataPath = path.join(dataDir, "demo-data.js");
const expertDataPath = path.join(dataDir, "expertenkreis-data.js");
const demoDirectory = path.join(fixtureRoot, "demo");

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(configPath, `window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "supabase",
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "public-test-key",
  registrationEndpoint: "https://example.supabase.co/functions/v1/network-registration",
  apiBaseUrl: "",
  requireApiGateway: false
};
`);
fs.writeFileSync(htmlPath, `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./data/demo-data.js"></script>
<script src="./data/expertenkreis-data.js"></script>
<div class="hospitation-dashboard-preview-toggle" role="group">
  <button data-hospitation-data-mode="live">Echte Daten</button>
  <button data-hospitation-data-mode="demo">Demo-Daten</button>
</div>
<button id="registrations-reset-demo">Demo zuruecksetzen</button>
`);
fs.writeFileSync(demoDataPath, `(function () {
  const legacyProfileImageAlpha = "https://example.supabase.co/storage/v1/object/public/profile-images/alpha/avatar.png";
  const legacyProfileImageBeta = "https://example.supabase.co/storage/v1/object/public/profile-images/beta/avatar.webp";
  const legacyProfileImageGamma = "https://example.supabase.co/storage/v1/object/public/profile-images/gamma/avatar.jpg";
})();\n`);
fs.writeFileSync(expertDataPath, "window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS = [];\n");
fs.mkdirSync(demoDirectory);
fs.writeFileSync(path.join(demoDirectory, "index.html"), "<!doctype html><title>Demo</title>\n");

try {
  const prepareScript = path.join(root, "scripts", "prepare_target_frontend_config.mjs");
  const auditScript = path.join(root, "scripts", "audit_api_gateway.mjs");

  execFileSync(process.execPath, [prepareScript, configPath, "https://api.pre-gematik.example", "api", "iap"], {
    cwd: root,
    stdio: "pipe"
  });

  let source = fs.readFileSync(configPath, "utf8");
  assert.match(source, /dataMode:\s*"api"/);
  assert.match(source, /authMode:\s*"iap"/);
  assert.match(source, /apiBaseUrl:\s*"https:\/\/api\.pre-gematik\.example"/);
  assert.match(source, /apiCredentials:\s*"include"/);
  assert.match(source, /requireApiGateway:\s*true/);
  assert.doesNotMatch(source, /supabaseUrl|supabaseAnonKey|registrationEndpoint/);
  const targetHtml = fs.readFileSync(htmlPath, "utf8");
  assert.doesNotMatch(targetHtml, /supabase-js|demo-data|expertenkreis-data/i);
  assert.doesNotMatch(targetHtml, /data-hospitation-data-mode="demo"|registrations-reset-demo/i);
  assert.equal(fs.existsSync(demoDataPath), false, "Demo-Daten muessen aus dem Zielartefakt entfernt werden");
  assert.equal(fs.existsSync(expertDataPath), false, "Statische Experten-Fallbacks muessen aus dem Zielartefakt entfernt werden");
  assert.equal(fs.existsSync(demoDirectory), false, "Die Demo-Route muss aus dem Zielartefakt entfernt werden");

  execFileSync(process.execPath, [prepareScript, configPath, "https://api.pre-gematik.example", "api", "oidc"], {
    cwd: root,
    stdio: "pipe"
  });
  source = fs.readFileSync(configPath, "utf8");
  assert.match(source, /authMode:\s*"oidc"/);
  assert.equal((source.match(/apiCredentials:/g) || []).length, 1, "apiCredentials muss idempotent bleiben");

  execFileSync(process.execPath, [auditScript, "--production-config", configPath], {
    cwd: root,
    stdio: "pipe"
  });

  const invalid = spawnSync(process.execPath, [prepareScript, configPath, "https://api.pre-gematik.example", "api", "password"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(invalid.status, 0, "Ein unbekannter Auth-Modus muss abgelehnt werden");

  const unsignedHeaderMode = spawnSync(process.execPath, [prepareScript, configPath, "https://api.pre-gematik.example", "api", "trusted-header"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(unsignedHeaderMode.status, 0, "Unsignierte Identity-Header duerfen kein Ziel-Auth-Modus sein");

  console.log("Target frontend config test OK: IAP-Cookies, Zielmodus, Audit und Idempotenz sind abgesichert.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
