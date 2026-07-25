import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/deploy-pre-gematik.yml", projectRoot),
  "utf8"
);
const deploymentRunbook = readFileSync(
  new URL("dokumentation/betrieb-und-deployment/DEPLOYMENT_GCP_AUTOPILOT.md", projectRoot),
  "utf8"
);
const pilotDecision = readFileSync(
  new URL(
    "dokumentation/betrieb-und-deployment/PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md",
    projectRoot
  ),
  "utf8"
);

function stepScript(name) {
  const stepStartToken = `      - name: ${name}\n`;
  const stepStart = workflow.indexOf(stepStartToken);
  assert.notEqual(stepStart, -1, `Workflow-Schritt fehlt: ${name}`);
  const nextStep = workflow.indexOf("\n      - name: ", stepStart + stepStartToken.length);
  const block = workflow.slice(stepStart, nextStep === -1 ? workflow.length : nextStep);
  const runStartToken = "        run: |\n";
  const runStart = block.indexOf(runStartToken);
  assert.notEqual(runStart, -1, `Workflow-Schritt besitzt keinen Shell-Block: ${name}`);
  return block
    .slice(runStart + runStartToken.length)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

function assertBashSyntax(script, label) {
  const result = spawnSync("bash", ["-n"], {
    cwd: fileURLToPath(projectRoot),
    input: script,
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    `${label} enthält ungültige Bash-Syntax:\n${result.stderr}`
  );
}

const validationScript = stepScript("Validate pre-gematik environment variables");
const iapScript = stepScript("Deploy API and bind the signed IAP JWT audience");
const rolloutVerificationScript = stepScript(
  "Verify rollout, Secret Sync, and fail-closed authentication"
);
assertBashSyntax(validationScript, "Environment-Validierung");
assertBashSyntax(iapScript, "IAP-Deployment");
assertBashSyntax(rolloutVerificationScript, "Rollout-Verifikation");

assert.match(
  workflow,
  /IAP_RESOURCE_ACCESS_EXPIRES_AT:\s*\$\{\{\s*vars\.IAP_RESOURCE_ACCESS_EXPIRES_AT\s*\}\}/,
  "Die optionale Ablaufvariable muss ausschließlich aus dem geschützten GitHub Environment stammen."
);
const requiredVariables = validationScript.match(/required=\(\n([\s\S]*?)\n\)/)?.[1] ?? "";
assert.doesNotMatch(
  requiredVariables,
  /\bIAP_RESOURCE_ACCESS_EXPIRES_AT\b/,
  "Die Ablaufvariable muss für den kontrollierten direkten user:-Pfad optional bleiben."
);
assert.match(validationScript, /case "\$IAP_RESOURCE_ACCESS_PRINCIPAL" in/);
assert.match(validationScript, /group:\*\)/);
assert.match(
  validationScript,
  /IAP_RESOURCE_ACCESS_PRINCIPAL" != "group:versorgungs-kompass-pre-gematik-access@googlegroups\.com"/,
  "Der Gruppenpfad muss auf die beschlossene private Google-Gruppe gepinnt sein."
);
assert.match(validationScript, /canonical UTC RFC3339 timestamp for a group principal/);
assert.match(validationScript, /date --utc --date="\$IAP_RESOURCE_ACCESS_EXPIRES_AT"/);
assert.match(
  validationScript,
  /IAP_RESOURCE_ACCESS_EXPIRES_AT" != "2026-08-17T16:00:00Z"/,
  "Der Gruppenpfad muss auf das beschlossene Pilotende gepinnt sein."
);
assert.match(validationScript, /user:\*\)[\s\S]*IAP_RESOURCE_ACCESS_EXPIRES_AT must be empty/);

assert.match(
  iapScript,
  /backend_services=\("\$backend_service" "\$frontend_backend_service"\)/,
  "Alle IAP-Phasen müssen dieselben zwei frisch aufgelösten Backend-Services verwenden."
);
assert.match(iapScript, /principal_type="\$\{IAP_RESOURCE_ACCESS_PRINCIPAL%%:\*\}"/);
assert.match(
  iapScript,
  /condition_expression="request\.time < timestamp\(\\"\$\{IAP_RESOURCE_ACCESS_EXPIRES_AT\}\\"\)"/
);
assert.match(
  iapScript,
  /version: \(if \$principal_type == "group" then 3 else 1 end\)/,
  "Nur die bedingte Gruppenpolicy benötigt Version 3; der direkte user:-Rollback bleibt unbedingte Version 1."
);
assert.match(iapScript, /title: "pre-gematik-pilot-expiry"/);
assert.match(iapScript, /if \$principal_type == "group" then \{/);
assert.match(
  iapScript,
  /\} else \{\} end/,
  "Der direkte user:-Rollback darf keine IAM-Condition erhalten."
);
assert.match(iapScript, /\(\(\.bindings \/\/ \[\]\) \| length\) == 0/);
assert.match(iapScript, /\(\(\.auditConfigs \/\/ \[\]\) \| length\) == 0/);
assert.equal(
  iapScript.split('select(').filter((fragment) => fragment.includes('. != "bindings"')).length,
  3,
  "Leere, bestehende und verifizierte Policies müssen unbekannte Top-Level-Felder fail-closed ablehnen."
);
assert.equal(
  iapScript.split('(.etag | type == "string")').length - 1,
  3,
  "Preflight und Verifikation müssen ein ETag für die optimistische Nebenläufigkeitskontrolle verlangen."
);
assert.match(iapScript, /clear both resource policies in the controlled cutover/);
assert.match(
  iapScript,
  /pending_policy_updates != 0 && pending_policy_updates != \$\{#backend_services\[@\]\}/,
  "Ein teilweise geleerter oder gesetzter Zwei-Backend-Cutover muss vor jeder Mutation stoppen."
);
assert.match(iapScript, /partial cutover state; both must be empty or both must already match/);

const renderFilterStartToken = '--arg condition_expression "$condition_expression" \'\n';
const renderFilterEndToken = '\n  \' "$current_policy" > "$desired_policy"';
const renderFilterStart = iapScript.indexOf(renderFilterStartToken);
const renderFilterEnd = iapScript.indexOf(
  renderFilterEndToken,
  renderFilterStart + renderFilterStartToken.length
);
assert.notEqual(renderFilterStart, -1, "Der jq-Renderer für die gewünschte IAM-Policy fehlt.");
assert.notEqual(renderFilterEnd, -1, "Der jq-Renderer für die gewünschte IAM-Policy ist nicht begrenzt.");
const renderFilter = iapScript.slice(
  renderFilterStart + renderFilterStartToken.length,
  renderFilterEnd
);

function renderPolicy(member, principalType, conditionExpression) {
  const result = spawnSync(
    "jq",
    [
      "--arg", "member", member,
      "--arg", "principal_type", principalType,
      "--arg", "condition_expression", conditionExpression,
      renderFilter
    ],
    {
      input: '{"version":1,"etag":"fixture-etag","bindings":[]}',
      encoding: "utf8"
    }
  );
  assert.equal(result.status, 0, `IAM-Policy-Renderer ist ungültig:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

const expiry = "2026-08-17T16:00:00Z";
const expression = `request.time < timestamp("${expiry}")`;
assert.deepEqual(
  renderPolicy("group:test-access@example.invalid", "group", expression),
  {
    version: 3,
    etag: "fixture-etag",
    bindings: [{
      role: "roles/iap.httpsResourceAccessor",
      members: ["group:test-access@example.invalid"],
      condition: {
        title: "pre-gematik-pilot-expiry",
        description: "Automatische Sperre zum dokumentierten Ende des pre-gematik-Piloten.",
        expression
      }
    }]
  }
);
assert.deepEqual(
  renderPolicy("user:break-glass@example.invalid", "user", ""),
  {
    version: 1,
    etag: "fixture-etag",
    bindings: [{
      role: "roles/iap.httpsResourceAccessor",
      members: ["user:break-glass@example.invalid"]
    }]
  },
  "Der direkte user:-Pfad darf keine versehentlich geerbte Condition enthalten."
);

const policyRead = iapScript.indexOf('current_policy="${iap_policy_dir}/${candidate}-current.json"');
const desiredRender = iapScript.indexOf('> "$desired_policy"');
const reauthRead = iapScript.indexOf('> "${iap_policy_dir}/${candidate}-settings-current.json"');
const reauthSet = iapScript.indexOf('gcloud iap settings set "$desired_reauth_settings"');
const reauthVerify = iapScript.indexOf('verified_settings="${iap_policy_dir}/${candidate}-settings-verified.json"');
const policySet = iapScript.indexOf('gcloud iap web set-iam-policy "$desired_policy"');
const policyVerify = iapScript.indexOf('verified_policy="${iap_policy_dir}/${candidate}-verified.json"');
const placeholderAutoDisabled = iapScript.indexOf('deploy_release "/projects/0/global/backendServices/0" false');
const audienceAutoDisabled = iapScript.indexOf('deploy_release "$iap_audience" false');
const groupAutoEnabled = iapScript.indexOf('deploy_release "$iap_audience" true');
for (const [label, position] of [
  ["Policy-Read", policyRead],
  ["Desired-Render", desiredRender],
  ["Reauth-Read", reauthRead],
  ["Reauth-Set", reauthSet],
  ["Reauth-Verify", reauthVerify],
  ["Policy-Set", policySet],
  ["Policy-Verify", policyVerify],
  ["Initiales Auto-Enrollment-Aus", placeholderAutoDisabled],
  ["Audience-Reconcile mit Auto-Enrollment-Aus", audienceAutoDisabled],
  ["Gruppenaktivierung des Auto-Enrollments", groupAutoEnabled]
]) {
  assert.notEqual(position, -1, `${label} fehlt im IAP-Workflow.`);
}
assert.ok(
  policyRead < desiredRender &&
    desiredRender < reauthRead &&
    reauthRead < reauthSet &&
    reauthSet < reauthVerify &&
    reauthVerify < policySet &&
    policySet < policyVerify &&
    placeholderAutoDisabled < policyRead &&
    audienceAutoDisabled < policyRead &&
    policyVerify < groupAutoEnabled,
  "Beide Policies müssen vor jeder Mutation gelesen/validiert/gerendert, Reauth fail-closed gesetzt und beide Policies danach verifiziert werden."
);
assert.match(
  iapScript,
  /if \[\[ "\$principal_type" == "group" \]\]; then[\s\S]*deploy_release "\$iap_audience" true[\s\S]*else[\s\S]*Auto-enrollment must remain disabled for a direct user rollback/,
  "Auto-Enrollment darf erst nach Gruppenpolicy-Verifikation aktiv und muss beim direkten user:-Rollback inaktiv sein."
);
assert.match(
  iapScript,
  /jsonpath='\{\.data\.API_AUTH_AUTO_ENROLLMENT_ENABLED\}'/,
  "Der effektiv gerenderte Auto-Enrollment-Schalter muss im Cluster geprüft werden."
);
for (const databaseContract of [
  "public.identity_enrollment_requests",
  "public.test_access_objects",
  "public.test_access_allowlist",
  "public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)",
  "owner.rolname = 'vk_allowlist_executor'",
  "not has_function_privilege('public', routine.oid, 'EXECUTE')"
]) {
  assert.ok(
    rolloutVerificationScript.includes(databaseContract),
    `Der Live-Datenbank-Smoke muss den Testzugangsvertrag prüfen: ${databaseContract}`
  );
}

for (const contract of [
  'method: "ENROLLED_SECOND_FACTORS"',
  'maxAge: "28800s"',
  'policyType: "MINIMUM"'
]) {
  assert.equal(
    iapScript.split(contract).length - 1,
    2,
    `Reauthentication muss denselben exakten Wert setzen und verifizieren: ${contract}`
  );
}

const exactGroup = "versorgungs-kompass-pre-gematik-access@googlegroups.com";
const exactExpiry = expiry;
for (const [documentName, document] of [
  ["Deployment-Runbook", deploymentRunbook],
  ["Pilotentscheidung", pilotDecision]
]) {
  assert.ok(document.includes(exactGroup), `${documentName} nennt nicht die genehmigte private Gruppe.`);
  assert.ok(document.includes(exactExpiry), `${documentName} nennt nicht den technischen Pilotablauf.`);
}
assert.match(deploymentRunbook, /1\s*\/\s*100/);
assert.match(deploymentRunbook, /External\s*\/\s*Testing/);
assert.match(deploymentRunbook, /Cloud Identity Free/);
assert.match(deploymentRunbook, /50 Lizenzen/);
assert.match(deploymentRunbook, /direkten `user:`-Sollzustand/);
assert.match(pilotDecision, /\| G-01 Datenzweck \|[\s\S]*geschützten Voll-Soll-Roster/);
assert.match(pilotDecision, /\| G-03 Zugriff \|[\s\S]*ENROLLED_SECOND_FACTORS/);
assert.match(pilotDecision, /\| G-04a Identitätsplan \|[\s\S]*`test_only`/);
assert.match(pilotDecision, /\| G-04b Identitätsbindung \|[\s\S]*gültig signierten?, aber ungebundenen?/);
assert.doesNotMatch(
  pilotDecision,
  /Genau eine reguläre menschliche IAP-Identität/,
  "Die Pilotentscheidung darf den genehmigten Tester-Roster nicht wieder auf eine Person begrenzen."
);

console.log("Pre-gematik IAP workflow contract tests passed.");
