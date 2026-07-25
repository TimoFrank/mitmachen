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
const ingressTemplate = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/templates/ingress.yaml", projectRoot),
  "utf8"
);
const publicBackendConfigTemplate = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/templates/frontend-public-backendconfig.yaml", projectRoot),
  "utf8"
);
const publicDeploymentTemplate = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/templates/frontend-public-deployment.yaml", projectRoot),
  "utf8"
);
const publicServiceTemplate = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/templates/frontend-public-service.yaml", projectRoot),
  "utf8"
);
const publicServiceAccountTemplate = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/templates/frontend-public-serviceaccount.yaml", projectRoot),
  "utf8"
);
const networkPolicyTemplate = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml", projectRoot),
  "utf8"
);
const publicNginxConfig = readFileSync(
  new URL("deploy/helm/versorgungs-kompass/files/frontend-public.conf", projectRoot),
  "utf8"
);
const publicDockerfile = readFileSync(
  new URL("deploy/frontend-public/Dockerfile", projectRoot),
  "utf8"
);
const authConfig = readFileSync(
  new URL("frontend/login/auth-config.js", projectRoot),
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
const immutableTagScript = stepScript("Refuse mutable image tag reuse");
const iapScript = stepScript("Deploy API and bind the signed IAP JWT audience");
const rolloutVerificationScript = stepScript(
  "Verify rollout, Secret Sync, and fail-closed authentication"
);
const externalBoundaryScript = stepScript("Require external IAP boundary smoke test");
const failClosedRestoreScript = stepScript(
  "Restore fail-closed public boundary after failed cutover"
);
assertBashSyntax(validationScript, "Environment-Validierung");
assertBashSyntax(immutableTagScript, "Unveraenderliche-Tag-Pruefung");
assertBashSyntax(iapScript, "IAP-Deployment");
assertBashSyntax(rolloutVerificationScript, "Rollout-Verifikation");
assertBashSyntax(externalBoundaryScript, "Externer Public-/IAP-Grenztest");
assertBashSyntax(failClosedRestoreScript, "Fail-closed-Wiederherstellung");
assert.doesNotMatch(
  workflow.match(/- name: Require external IAP boundary smoke test[\s\S]*?(?=\n      - name:)/)?.[0] ?? "",
  /\n\s+if:/,
  "Ein echtes Deployment darf den externen Boundary-Smoke nicht mehr ueberspringen."
);
assert.match(workflow, /name: Restore fail-closed public boundary after failed cutover[\s\S]*if: \$\{\{ always\(\) \}\}/);

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
assert.match(iapScript, /public_frontend_service_name="\$\{HELM_RELEASE\}-frontend-public"/);
assert.match(iapScript, /public_frontend_backend_service/);
assert.match(
  iapScript,
  /deploy_release "\$current_iap_audience" false true/,
  "Jeder Release muss die Routing- und Image-Aktualisierung hinter Public-IAP beginnen."
);
assert.doesNotMatch(
  iapScript,
  /phase_a_public_iap=false/,
  "Auch ein etablierter Public-Einstieg darf waehrend des Ingress-Reconcile nicht offen bleiben."
);
assert.match(
  iapScript,
  /printf '%s\\n' "\$existing_public_backend" > "\$restore_marker"[\s\S]*force_public_iap_enabled "\$existing_public_backend"[\s\S]*deploy_release "\$current_iap_audience" false true/,
  "Ein bestehendes Public-Backend muss vor jeder Helm-/Ingress-Aenderung mit bewaffnetem Restore hinter IAP konvergieren."
);
assert.match(iapScript, /The public-entry backend did not become IAP-protected before the release reconcile/);
assert.match(iapScript, /public_ingress_ref_count/);
assert.match(iapScript, /preflight_url_map_name=/);
assert.match(
  iapScript,
  /Apply the reviewed Terraform IAM update before this application rollout/,
  "Die neue URL-Map-Leseberechtigung muss vor jeder Ingress-Aenderung fail-closed geprueft werden."
);
assert.match(
  iapScript,
  /deploy_release "\$iap_audience" "\$final_auto_enrollment_enabled" false/,
  "IAP darf auf dem Public-Backend erst in der zweiten, verifizierten Phase deaktiviert werden."
);
assert.match(iapScript, /gcloud compute url-maps describe/);
assert.match(iapScript, /The live GCE URL map does not isolate the public backend/);
assert.match(iapScript, /wait_for_boundary/);
assert.match(iapScript, /backend-services get-health/);
assert.match(iapScript, /restore_public_iap/);
assert.match(iapScript, /public-entry-restore-armed/);
assert.match(iapScript, /\.ports\.http/);
assert.doesNotMatch(
  iapScript,
  /\.default \| select\(type == "string" and test\("\^\[a-z0-9\]/,
  "Der Restore darf nicht den nicht vorhandenen BackendConfig-default-Key lesen."
);
assert.match(iapScript, /The public entry backend has an unexpected resource-specific IAP policy/);
assert.doesNotMatch(
  iapScript.match(/backend_services=\([^\n]+\)/)?.[0] ?? "",
  /public_frontend_backend_service/,
  "Public-Backend darf nie in die IAM- oder Reauthentication-Schleifen der geschuetzten Backends gelangen."
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

assert.match(
  immutableTagScript,
  /tag_inventory_status" == "1"[\s\S]*ERROR: \(gcloud\.artifacts\.docker\.tags\.list\) NOT_FOUND: Requested entity was not found\.[\s\S]*image_tags='\[\]'/,
  "Nur das exakte erstmalige Artifact-Registry-NOT_FOUND darf als leeres Tag-Inventar gelten."
);
assert.match(
  immutableTagScript,
  /else[\s\S]*cat "\$tag_inventory_error" >&2[\s\S]*Could not read the immutable tag inventory/,
  "Andere Fehler beim Lesen des Tag-Inventars müssen fail-closed abbrechen."
);

const backendConfigFilter = iapScript.match(
  /resolve_public_backend_config_name\(\) \{[\s\S]*?--arg expected "\$expected_backend_config_name" \\\n\s*'([\s\S]*?)' \\\n\s*<<< "\$backend_config_annotation"/
)?.[1];
assert.ok(
  backendConfigFilter,
  "Der Resolver fuer die Public-BackendConfig-Annotation fehlt oder ist nicht eindeutig begrenzt."
);
function resolveBackendConfig(annotation) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--raw-output",
      "--arg",
      "expected",
      "release-frontend-public",
      backendConfigFilter
    ],
    { input: JSON.stringify(annotation), encoding: "utf8" }
  );
}
assert.equal(
  resolveBackendConfig({
    ports: { http: "release-frontend-public" }
  }).stdout.trim(),
  "release-frontend-public",
  "Der Resolver muss die reale ports.http-Service-Annotation akzeptieren."
);
assert.notEqual(
  resolveBackendConfig({
    default: "release-frontend-public"
  }).status,
  0,
  "Ein nicht existentes default-Mapping darf den Restore nicht scheinbar erfolgreich machen."
);
assert.notEqual(
  resolveBackendConfig({
    ports: { http: "unexpected-backend-config" }
  }).status,
  0,
  "Ein fremder BackendConfig-Name muss fail-closed abgelehnt werden."
);
assert.match(failClosedRestoreScript, /\.ports\.http/);
assert.match(
  failClosedRestoreScript,
  /\. == \$expected/,
  "Der jobweite Restore muss den BackendConfig-Namen auf die erwartete Release-Ressource pinnen."
);
assert.doesNotMatch(failClosedRestoreScript, /\.default/);

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

const urlMapFilter = iapScript.match(
  /--arg public_suffix "\/backendServices\/\$\{public_backend\}" '([\s\S]*?)' <<< "\$url_map_state"/
)?.[1];
assert.ok(urlMapFilter, "Der Live-URL-Map-Prueffilter fehlt oder ist nicht eindeutig begrenzt.");
const validUrlMap = {
  hostRules: [
    { hosts: ["versorgungs-kompass.de"], pathMatcher: "canonical" },
    { hosts: ["www.versorgungs-kompass.de"], pathMatcher: "alias" }
  ],
  pathMatchers: [
    {
      name: "canonical",
      defaultService: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/controller-default",
      pathRules: [
        {
          paths: ["/", "/anmelden"],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/public"
        },
        {
          paths: ["/api", "/api/*"],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/api"
        },
        {
          paths: ["/*"],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/protected"
        }
      ]
    },
    {
      name: "alias",
      defaultService: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/controller-default",
      pathRules: [{
        paths: ["/*"],
        service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/protected"
      }]
    }
  ]
};

function verifyUrlMap(value) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "canonical_host", "versorgungs-kompass.de",
      "--arg", "public_suffix", "/backendServices/public",
      urlMapFilter
    ],
    { input: JSON.stringify(value), encoding: "utf8" }
  );
}

assert.equal(
  verifyUrlMap(validUrlMap).status,
  0,
  "Der URL-Map-Prueffilter muss die exakt getrennte Soll-Map akzeptieren."
);
const widenedPublicMap = structuredClone(validUrlMap);
widenedPublicMap.pathMatchers[0].pathRules[0].paths.push("/public/*");
assert.notEqual(
  verifyUrlMap(widenedPublicMap).status,
  0,
  "Der URL-Map-Prueffilter muss einen verbreiterten Public-Pfad fail-closed ablehnen."
);
const aliasPublicMap = structuredClone(validUrlMap);
aliasPublicMap.pathMatchers[1].pathRules = [{
  paths: ["/"],
  service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/public"
}];
assert.notEqual(
  verifyUrlMap(aliasPublicMap).status,
  0,
  "Der URL-Map-Prueffilter muss eine Public-Route auf einem Alias-Host ablehnen."
);
const sharedMatcherMap = structuredClone(validUrlMap);
sharedMatcherMap.hostRules[1].pathMatcher = "canonical";
assert.notEqual(
  verifyUrlMap(sharedMatcherMap).status,
  0,
  "Der URL-Map-Prueffilter darf den Public-Matcher nicht mit einem Alias-Host teilen."
);
const publicDefaultMap = structuredClone(validUrlMap);
publicDefaultMap.pathMatchers[0].defaultService =
  "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/public";
assert.notEqual(
  verifyUrlMap(publicDefaultMap).status,
  0,
  "Der URL-Map-Prueffilter muss ein oeffentliches defaultService fail-closed ablehnen."
);
const topLevelPublicDefaultMap = structuredClone(validUrlMap);
topLevelPublicDefaultMap.defaultService =
  "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/public";
assert.notEqual(
  verifyUrlMap(topLevelPublicDefaultMap).status,
  0,
  "Der URL-Map-Prueffilter muss auch ein top-level oeffentliches defaultService ablehnen."
);
assert.match(iapScript, /\) == \["\/\*"\]/);
assert.match(iapScript, /\) == \["\/api", "\/api\/\*"\]/);

const policyRead = iapScript.indexOf('current_policy="${iap_policy_dir}/${candidate}-current.json"');
const desiredRender = iapScript.indexOf('> "$desired_policy"');
const reauthRead = iapScript.indexOf('> "${iap_policy_dir}/${candidate}-settings-current.json"');
const reauthSet = iapScript.indexOf('gcloud iap settings set "$desired_reauth_settings"');
const reauthVerify = iapScript.indexOf('verified_settings="${iap_policy_dir}/${candidate}-settings-verified.json"');
const policySet = iapScript.indexOf('gcloud iap web set-iam-policy "$desired_policy"');
const policyVerify = iapScript.indexOf('verified_policy="${iap_policy_dir}/${candidate}-verified.json"');
const existingProtectionMarker = iapScript.indexOf(
  'printf \'%s\\n\' "$existing_public_backend" > "$restore_marker"'
);
const existingProtectionCall = iapScript.indexOf(
  'force_public_iap_enabled "$existing_public_backend"'
);
const existingCompletenessCheck = iapScript.indexOf(
  'if [[ "$public_deployment_exists" != "1"'
);
const existingOpenBoundaryCheck = iapScript.indexOf(
  '! public_url_map_is_isolated "$preflight_url_map_name" "$existing_public_backend"'
);
const initialBoundaryReconcile = iapScript.indexOf(
  'deploy_release "$current_iap_audience" false true'
);
const urlMapPermissionPreflight = iapScript.indexOf('preflight_url_map_name=');
const audienceAutoDisabled = iapScript.indexOf('deploy_release "$iap_audience" false true');
const publicIapDisabled = iapScript.indexOf(
  'deploy_release "$iap_audience" "$final_auto_enrollment_enabled" false'
);
const groupAutoEnabled = iapScript.indexOf('deploy_release "$iap_audience" true true');
for (const [label, position] of [
  ["Policy-Read", policyRead],
  ["Desired-Render", desiredRender],
  ["Reauth-Read", reauthRead],
  ["Reauth-Set", reauthSet],
  ["Reauth-Verify", reauthVerify],
  ["Policy-Set", policySet],
  ["Policy-Verify", policyVerify],
  ["Restore-Marker vor bestehendem Backend", existingProtectionMarker],
  ["IAP-Schutz vor bestehendem Backend", existingProtectionCall],
  ["Vollstaendigkeitspruefung bestehender Public-Ressourcen", existingCompletenessCheck],
  ["Boundary-Pruefung des zuvor offenen Backends", existingOpenBoundaryCheck],
  ["Initiales Boundary-Reconcile", initialBoundaryReconcile],
  ["URL-Map-Berechtigungs-Preflight", urlMapPermissionPreflight],
  ["Audience-Reconcile mit Auto-Enrollment-Aus", audienceAutoDisabled],
  ["Verifizierte Oeffnung des Public-Backends", publicIapDisabled],
  ["Gruppenaktivierung des Auto-Enrollments", groupAutoEnabled]
]) {
  assert.notEqual(position, -1, `${label} fehlt im IAP-Workflow.`);
}
assert.ok(
  existingProtectionMarker < existingProtectionCall &&
    existingProtectionCall < existingCompletenessCheck &&
    existingProtectionCall < existingOpenBoundaryCheck &&
    policyRead < desiredRender &&
    desiredRender < reauthRead &&
    reauthRead < reauthSet &&
    reauthSet < reauthVerify &&
    reauthVerify < policySet &&
    policySet < policyVerify &&
    urlMapPermissionPreflight < initialBoundaryReconcile &&
    initialBoundaryReconcile < policyRead &&
    audienceAutoDisabled < policyRead &&
    policyVerify < groupAutoEnabled &&
    groupAutoEnabled < publicIapDisabled,
  "Geschuetzte Policies und Auto-Enrollment muessen vor der abschliessenden Public-Oeffnung verifiziert werden."
);
assert.match(
  iapScript,
  /if \[\[ "\$principal_type" == "group" \]\]; then[\s\S]*deploy_release "\$iap_audience" true true[\s\S]*else[\s\S]*Auto-enrollment must remain disabled for a direct user rollback/,
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

assert.match(
  ingressTemplate,
  /if and \$\.Values\.frontend\.publicEntry\.enabled \(eq \$host \$\.Values\.ingress\.host\)[\s\S]*path: \/[\s\S]*pathType: Exact[\s\S]*path: \/anmelden[\s\S]*pathType: Exact/
);
assert.match(ingressTemplate, /path: \/api[\s\S]*pathType: Prefix/);
assert.match(ingressTemplate, /path: \/\n\s+pathType: Prefix/);
assert.match(
  publicBackendConfigTemplate,
  /if \.Values\.frontend\.publicEntry\.backendConfig\.iap\.enabled[\s\S]*iap:[\s\S]*enabled: true/
);
assert.match(
  publicBackendConfigTemplate,
  /enabled: true\s+oauthclientCredentials:\s+secretName:/,
  "Fail-closed Public-IAP muss weiterhin den vorhandenen Custom-OAuth-Client verwenden."
);
assert.match(
  iapScript,
  /deploy_release "\$iap_audience" "\$final_auto_enrollment_enabled" false[\s\S]*jsonpath='\{\.spec\.iap\}'[\s\S]*--iap=disabled[\s\S]*wait_for_boundary false/,
  "Die finale Phase muss IAP aus BackendConfig entfernen und den Custom-OAuth-Backend direkt oeffnen."
);
assert.match(
  publicServiceTemplate,
  /cloud\.google\.com\/backend-config" \(printf "\{\\"ports\\": \{\\"http\\": \\"%s\\"\}\}"/,
  "Die Service-Annotation und beide Restore-Resolver muessen denselben ports.http-Vertrag verwenden."
);
assert.doesNotMatch(
  publicDeploymentTemplate,
  /\binitContainers\b|\bgcloud\b|\bgs:\/\/|frontend-public-content|runtime-config|enrollment\.html/,
  "Das Public-Deployment darf weder GCS noch das vollstaendige Target-Artefakt synchronisieren."
);
assert.match(publicDeploymentTemplate, /image: "\{\{ \$publicImageRepository \}\}@\{\{ \$publicImageDigest \}\}"/);
assert.doesNotMatch(publicDeploymentTemplate, /else.*repository.*tag/);
assert.match(publicDeploymentTemplate, /frontendPublicServiceAccountName/);
assert.match(publicServiceAccountTemplate, /automountServiceAccountToken:/);
assert.doesNotMatch(publicServiceAccountTemplate, /annotations:/);
assert.match(
  networkPolicyTemplate,
  /frontendPublicSelectorLabels[\s\S]*policyTypes:[\s\S]*- Egress[\s\S]*egress: \[\]/
);
assert.match(publicDockerfile, /COPY --chown=101:101 dist\/target\/public-index\.html/);
assert.match(publicDockerfile, /COPY --chown=101:101 dist\/target\/public-login\.html/);
assert.match(publicDockerfile, /COPY --chown=101:101 .*frontend-public\.conf/);
assert.match(
  publicDockerfile,
  /apk del --no-network curl libcurl/,
  "Das statische Public-Image darf die nicht benoetigten curl-/libcurl-Laufzeitpakete nicht behalten."
);
assert.match(publicDockerfile, /USER 101:101/);
assert.match(publicNginxConfig, /map \$request_uri \$public_entry_document/);
assert.match(publicNginxConfig, /merge_slashes off/);
assert.match(publicNginxConfig, /if \(\$public_entry_document = ""\)/);
assert.match(publicNginxConfig, /!\-f \$document_root\/public-index\.html/);
assert.match(publicNginxConfig, /!\-f \$document_root\/public-login\.html/);
assert.match(publicNginxConfig, /default-src 'none'/);
assert.match(publicNginxConfig, /script-src 'none'/);
assert.match(publicNginxConfig, /Cache-Control "no-store"/);
assert.match(authConfig, /loginPath:\s*"\.\.\/login\/login\.html"/);
assert.doesNotMatch(
  authConfig,
  /loginPath:\s*"\/anmelden"/,
  "Der geschuetzte Logout-Pfad darf nicht auf die oeffentliche Einstiegsseite zeigen."
);
assert.match(workflow, /Build and push immutable public-entry image/);
assert.match(workflow, /PUBLIC_IMAGE_DIGEST/);
assert.match(workflow, /deploy\/frontend-public\/Dockerfile/);
assert.match(workflow, /\/\/anmelden/);

for (const publicContract of [
  'data-public-entry="home"',
  'data-public-entry="access"',
  'href="/start"',
  'href="/enrollment.html"',
  "post_status",
  "public_probe=must-not-reflect"
]) {
  assert.ok(
    externalBoundaryScript.includes(publicContract),
    `Der externe Boundary-Smoke prueft den Public-Vertrag nicht: ${publicContract}`
  );
}
for (const protectedPath of [
  "/start",
  "/enrollment.html",
  "/login.html",
  "/api/healthz",
  "/data/runtime-config.js",
  "/anmelden/"
]) {
  assert.ok(
    externalBoundaryScript.includes(`"${protectedPath}"`),
    `Der externe Boundary-Smoke prueft den geschuetzten Pfad nicht: ${protectedPath}`
  );
}
assert.match(externalBoundaryScript, /x-goog-iap-generated-response/i);
assert.match(
  externalBoundaryScript,
  /edge_ready=0[\s\S]*for attempt in \{1\.\.60\}[\s\S]*data-public-entry="home"[\s\S]*edge_ready=1/,
  "Der externe Smoke muss die sichere Edge-Propagation abwarten, bevor er den Gesamtvertrag prueft."
);
for (const dotSegmentAlias of [
  "/foo/../anmelden",
  "/anmelden/../anmelden",
  "/./anmelden"
]) {
  assert.ok(
    externalBoundaryScript.includes(`"${dotSegmentAlias}"`),
    `Der externe Boundary-Smoke prueft den vom Load Balancer normalisierten Pfad nicht: ${dotSegmentAlias}`
  );
}
assert.match(externalBoundaryScript, /redirect_location" != "\/anmelden"/);
assert.match(
  externalBoundaryScript,
  /redirect_location" != "\$\{FRONTEND_BASE_URL\}\/anmelden"/,
  "Ein Load-Balancer-302 darf nur auf den kanonischen Public-Pfad desselben Origins zeigen."
);
assert.match(
  externalBoundaryScript,
  /status" != "302"[\s\S]*data-public-entry=/,
  "Dot-Segment-Redirects muessen den exakten 302-Vertrag einhalten und duerfen keinen Public-Body ausliefern."
);
assert.match(rolloutVerificationScript, /service\/\$\{public_frontend_service_name\}" 18083:80/);
assert.match(rolloutVerificationScript, /The minimal public frontend unexpectedly served/);

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
