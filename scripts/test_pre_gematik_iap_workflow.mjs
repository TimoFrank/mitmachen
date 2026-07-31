import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const identityPlatformTerraform = readFileSync(
  new URL("deploy/terraform/gcp-autopilot/identity-platform.tf", projectRoot),
  "utf8"
);
const terraformVariables = readFileSync(
  new URL("deploy/terraform/gcp-autopilot/variables.tf", projectRoot),
  "utf8"
);
const projectCheckSource = readFileSync(
  new URL("scripts/check_project.mjs", projectRoot),
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
const repositoryCheckScript = stepScript("Run repository checks");
const immutableTagScript = stepScript("Refuse mutable image tag reuse");
const projectNumberVerificationScript = stepScript(
  "Verify pinned Google Cloud project number"
);
const identityPlatformPreflightScript = stepScript(
  "Preflight locked Identity Platform providers without mutation"
);
const liveHospitationContractScript = stepScript(
  "Require live Hospitations-Kompass database contract before rollout"
);
const iapScript = stepScript("Deploy API and bind the signed IAP JWT audience");
const rolloutVerificationScript = stepScript(
  "Verify rollout, Secret Sync, and fail-closed authentication"
);
const externalBoundaryScript = stepScript("Require external IAP boundary smoke test");
const failClosedRestoreScript = stepScript(
  "Restore fail-closed public boundary after failed cutover"
);
assertBashSyntax(validationScript, "Environment-Validierung");
assertBashSyntax(repositoryCheckScript, "Repository-Pruefungen");
assertBashSyntax(immutableTagScript, "Unveraenderliche-Tag-Pruefung");
assertBashSyntax(projectNumberVerificationScript, "Projektnummer-Verifikation");
assertBashSyntax(identityPlatformPreflightScript, "Identity-Platform-Preflight");
assertBashSyntax(liveHospitationContractScript, "Live-Hospitations-Kompass-Datenbankvertrag");
assertBashSyntax(iapScript, "IAP-Deployment");
assertBashSyntax(rolloutVerificationScript, "Rollout-Verifikation");
assertBashSyntax(externalBoundaryScript, "Externer Public-/IAP-Grenztest");
assertBashSyntax(failClosedRestoreScript, "Fail-closed-Wiederherstellung");
assert.match(repositoryCheckScript, /^npm run check$/mu);
assert.match(
  repositoryCheckScript,
  /^npm --prefix frontend\/identity-portal test$/mu,
  "Der Deployment-Workflow muss die Portal-Vertraege vor jeder Mutation explizit ausfuehren."
);
assert.match(
  projectCheckSource,
  /\["npm", \["--prefix", "frontend\/identity-portal", "test"\]\]/u,
  "Auch npm run check muss die Portal-Vertraege enthalten."
);
assert.match(
  workflow,
  /GCP_PROJECT_NUMBER:\s*\$\{\{\s*vars\.GCP_PROJECT_NUMBER\s*\}\}/u,
  "Die numerische Projektnummer muss aus dem geschuetzten GitHub Environment stammen."
);
assert.match(
  validationScript,
  /GCP_PROJECT_ID GCP_PROJECT_NUMBER GCP_REGION/u,
  "Die gepinnte Projektnummer muss verpflichtend validiert werden."
);
assert.match(
  validationScript,
  /WIF_PROVIDER" != "projects\/\$\{GCP_PROJECT_NUMBER\}\/locations\/global\/"\*/u,
  "WIF_PROVIDER und GCP_PROJECT_NUMBER muessen bereits vor der Authentifizierung uebereinstimmen."
);
assert.match(
  projectNumberVerificationScript,
  /gcloud projects describe[\s\S]*--format='value\(projectNumber\)'/u
);
assert.match(
  projectNumberVerificationScript,
  /resolved_project_number" != "\$GCP_PROJECT_NUMBER"/u,
  "Die geschuetzte Projektnummer muss gegen das authentifizierte Projekt gelesen werden."
);
assert.doesNotMatch(
  projectNumberVerificationScript,
  /GITHUB_ENV|GITHUB_OUTPUT/u,
  "Die geschuetzte Projektnummer darf nicht durch einen dynamischen Workflow-Wert ueberschrieben werden."
);

function runProjectNumberVerification(resolvedProjectNumber, pinnedProjectNumber) {
  return spawnSync(
    "bash",
    [
      "-c",
      `gcloud() { printf '%s\\n' "$MOCK_RESOLVED_PROJECT_NUMBER"; }\n${projectNumberVerificationScript}`
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GCP_PROJECT_ID: "steam-capsule-341212",
        GCP_PROJECT_NUMBER: pinnedProjectNumber,
        MOCK_RESOLVED_PROJECT_NUMBER: resolvedProjectNumber
      }
    }
  );
}

const identityProjectNumber = "765190393967";
assert.equal(
  runProjectNumberVerification(identityProjectNumber, identityProjectNumber).status,
  0,
  "Die authentifizierte und geschuetzte identische Projektnummer muss akzeptiert werden."
);
for (const [resolvedProjectNumber, pinnedProjectNumber] of [
  ["765190393968", identityProjectNumber],
  ["steam-capsule-341212", identityProjectNumber],
  [identityProjectNumber, "765190393968"]
]) {
  const verification = runProjectNumberVerification(
    resolvedProjectNumber,
    pinnedProjectNumber
  );
  assert.notEqual(
    verification.status,
    0,
    "Abweichende oder nicht numerische Projektnummern muessen fail-closed stoppen."
  );
  assert.doesNotMatch(
    `${verification.stdout}${verification.stderr}`,
    /76519039396[78]|steam-capsule-341212/u,
    "Die Projektnummer-Verifikation darf Ist- und Sollwerte nicht ausgeben."
  );
}

const identityProjectConfigFilter = identityPlatformPreflightScript.match(
  /--arg login_page_host "\$login_page_host" \\\n\s*'\n([\s\S]*?)\n\s*' "\$project_config"/
)?.[1];
assert.ok(
  identityProjectConfigFilter,
  "Der Identity-Platform-Projektkonfigurationsfilter fehlt oder ist nicht eindeutig begrenzt."
);
const identityProject = "steam-capsule-341212";
const identityApiHost = "versorgungs-kompass.de";
const identityIapAuthDomain = "iap.googleapis.com";
const lockedIdentityProjectConfig = {
  name: `projects/${identityProjectNumber}/config`,
  signIn: {
    email: { enabled: true, passwordRequired: true },
    allowDuplicateEmails: false,
    phoneNumber: { enabled: false },
    anonymous: { enabled: false }
  },
  client: {
    permissions: {
      disabledUserSignup: true,
      disabledUserDeletion: true
    }
  },
  emailPrivacyConfig: { enableImprovedEmailPrivacy: true },
  mfa: { state: "DISABLED" },
  multiTenant: { allowTenants: false },
  passwordPolicyConfig: {
    passwordPolicyEnforcementState: "ENFORCE",
    forceUpgradeOnSignin: true,
    passwordPolicyVersions: [{
      customStrengthOptions: {
        minPasswordLength: 14,
        maxPasswordLength: 128,
        containsLowercaseCharacter: true,
        containsUppercaseCharacter: true,
        containsNumericCharacter: true,
        containsNonAlphanumericCharacter: true
      }
    }]
  },
  authorizedDomains: [
    `${identityProject}.firebaseapp.com`,
    identityApiHost,
    identityIapAuthDomain
  ]
};
function verifyIdentityProjectConfig(config, loginPageHost = identityApiHost) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "project_id", identityProject,
      "--arg", "project_number", identityProjectNumber,
      "--arg", "api_host", identityApiHost,
      "--arg", "login_page_host", loginPageHost,
      identityProjectConfigFilter
    ],
    { input: JSON.stringify(config), encoding: "utf8" }
  );
}
assert.equal(
  verifyIdentityProjectConfig(lockedIdentityProjectConfig).status,
  0,
  "Die exakt gepinnten Versorgungs-Kompass-, Firebase- und IAP-Auth-Domains muessen akzeptiert werden."
);
for (const unsafeProjectConfigName of [
  `projects/${identityProject}/config`,
  "projects/765190393968/config",
  `projects/${identityProjectNumber}/config/extra`
]) {
  assert.notEqual(
    verifyIdentityProjectConfig({
      ...lockedIdentityProjectConfig,
      name: unsafeProjectConfigName
    }).status,
    0,
    "Die Admin-Projektkonfiguration muss exakt den numerischen Projektressourcennamen tragen."
  );
}
assert.equal(
  verifyIdentityProjectConfig({
    ...lockedIdentityProjectConfig,
    client: {
      ...lockedIdentityProjectConfig.client,
      apiKey: "unrelated-admin-readback-value"
    }
  }).status,
  0,
  "Die Admin-Config darf nicht faelschlich zur Bindung des Browser-Keys verwendet werden."
);
assert.notEqual(
  verifyIdentityProjectConfig({
    ...lockedIdentityProjectConfig,
    authorizedDomains: lockedIdentityProjectConfig.authorizedDomains.filter(
      (domain) => domain !== identityIapAuthDomain
    )
  }).status,
  0,
  "Die fuer den External-IAP-Flow erforderliche Domain iap.googleapis.com darf nicht fehlen."
);
assert.notEqual(
  verifyIdentityProjectConfig({
    ...lockedIdentityProjectConfig,
    authorizedDomains: [
      ...lockedIdentityProjectConfig.authorizedDomains,
      "legacy-login.example.invalid"
    ]
  }).status,
  0,
  "Eine zusaetzliche alte oder fremde autorisierte Domain muss fail-closed stoppen."
);
assert.notEqual(
  verifyIdentityProjectConfig(lockedIdentityProjectConfig, "login.example.invalid").status,
  0,
  "Der Custom-Login-Host muss exakt dem kanonischen API-/Frontend-Host entsprechen."
);

assert.doesNotMatch(
  identityPlatformPreflightScript,
  /\.client\.apiKey/u,
  "Der Browser-Key darf nicht gegen das ungeeignete Admin-Config-Feld validiert werden."
);
assert.match(
  identityPlatformPreflightScript,
  /identity_project_number="\$GCP_PROJECT_NUMBER"/u,
  "Der Browser-Key-Probe muss die bereits verifizierte geschuetzte Projektnummer verwenden."
);
assert.match(
  identityPlatformPreflightScript,
  /\/v1\/projects\?key=%s&projectNumber=%s/u
);
assert.match(
  identityPlatformPreflightScript,
  /referer = "%s"[\s\S]*"\$IAP_EXTERNAL_LOGIN_PAGE_URI"/u
);
assert.match(
  identityPlatformPreflightScript,
  /curl --config "\$browser_key_curl_config"[\s\S]*--output "\$browser_key_project_config"/u
);
const browserKeyProjectConfigFilter = identityPlatformPreflightScript.match(
  /--arg api_host "\$API_HOST" '\n([\s\S]*?)\n\s*' "\$browser_key_project_config"/
)?.[1];
assert.ok(
  browserKeyProjectConfigFilter,
  "Der oeffentliche Browser-Key-Projektvertrag fehlt oder ist nicht eindeutig begrenzt."
);
function verifyBrowserKeyProjectConfig(config) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "project_id", identityProject,
      "--arg", "project_number", identityProjectNumber,
      "--arg", "api_host", identityApiHost,
      browserKeyProjectConfigFilter
    ],
    { input: JSON.stringify(config), encoding: "utf8" }
  );
}
const browserKeyProjectConfig = {
  projectId: identityProjectNumber,
  authorizedDomains: lockedIdentityProjectConfig.authorizedDomains
};
assert.equal(
  verifyBrowserKeyProjectConfig(browserKeyProjectConfig).status,
  0,
  "Der eingeschraenkte Browser-Key muss die numerische Projektnummer und die drei Domains aufloesen."
);
assert.notEqual(
  verifyBrowserKeyProjectConfig({
    ...browserKeyProjectConfig,
    projectId: "765190393968"
  }).status,
  0,
  "Ein Browser-Key eines fremden numerischen Projekts muss fail-closed stoppen."
);
for (const authorizedDomains of [
  browserKeyProjectConfig.authorizedDomains.slice(1),
  [...browserKeyProjectConfig.authorizedDomains, "extra.example.invalid"]
]) {
  assert.notEqual(
    verifyBrowserKeyProjectConfig({
      ...browserKeyProjectConfig,
      authorizedDomains
    }).status,
    0,
    "Der Browser-Key-Vertrag muss fehlende und zusaetzliche Domains ablehnen."
  );
}

const passwordPolicyCanonicalFilter = identityPlatformPreflightScript.match(
  /canonical_password_policy="\$\(jq --compact-output --sort-keys '\n([\s\S]*?)\n\s*' "\$project_config"\)"/u
)?.[1];
assert.ok(
  passwordPolicyCanonicalFilter,
  "Der kanonische Passwort-Policy-Filter fehlt oder ist nicht eindeutig begrenzt."
);
const canonicalPasswordPolicyResult = spawnSync(
  "jq",
  ["--compact-output", "--sort-keys", passwordPolicyCanonicalFilter],
  {
    input: JSON.stringify(lockedIdentityProjectConfig),
    encoding: "utf8"
  }
);
assert.equal(
  canonicalPasswordPolicyResult.status,
  0,
  `Die Passwort-Policy kann nicht kanonisiert werden:\n${canonicalPasswordPolicyResult.stderr}`
);
assert.match(
  canonicalPasswordPolicyResult.stdout,
  /\n$/u,
  "jq muss fuer diesen Vertrag genau den von Command-Substitution entfernten Abschluss-LF liefern."
);
const canonicalPasswordPolicyWithoutLf =
  canonicalPasswordPolicyResult.stdout.slice(0, -1);
assert.doesNotMatch(
  canonicalPasswordPolicyWithoutLf,
  /[\r\n]/u,
  "Die gehashte kompakte Passwort-Policy darf keinen Zeilenumbruch enthalten."
);
const passwordPolicyHashWithoutLf = createHash("sha256")
  .update(canonicalPasswordPolicyWithoutLf, "utf8")
  .digest("hex");
const passwordPolicyHashWithLf = createHash("sha256")
  .update(canonicalPasswordPolicyResult.stdout, "utf8")
  .digest("hex");
assert.notEqual(
  passwordPolicyHashWithoutLf,
  passwordPolicyHashWithLf,
  "Der Policy-Pin muss eindeutig zwischen JSON ohne und mit Abschluss-LF unterscheiden."
);
assert.match(
  identityPlatformPreflightScript,
  /Command substitution removes jq's trailing LF[\s\S]*actual_password_policy_sha256="sha256:\$\(printf '%s' "\$canonical_password_policy"/u,
  "Der Workflow muss explizit die kompakten JSON-Bytes ohne Abschluss-LF hashen."
);
assert.doesNotMatch(
  identityPlatformPreflightScript,
  /actual_password_policy_sha256="[^"]*(?:echo|printf '%s\\n')/u,
  "Der Passwort-Policy-Hash darf keinen Abschluss-LF wieder einfuehren."
);

function identityProviderFilter(inputVariable) {
  const inputToken = `' "$${inputVariable}"`;
  const filterEnd = identityPlatformPreflightScript.indexOf(inputToken);
  assert.notEqual(filterEnd, -1, `Identity-Provider-Eingabe fehlt: ${inputVariable}`);
  const argumentToken = `--arg project_number "$GCP_PROJECT_NUMBER" '`;
  const argumentStart = identityPlatformPreflightScript.lastIndexOf(
    argumentToken,
    filterEnd
  );
  assert.notEqual(
    argumentStart,
    -1,
    `Numerisches Projektargument fehlt fuer ${inputVariable}.`
  );
  return identityPlatformPreflightScript
    .slice(argumentStart + argumentToken.length, filterEnd)
    .trim();
}

const googleProviderFilter = identityProviderFilter("google_provider");
const defaultProvidersFilter = identityProviderFilter("default_providers");
const oidcProvidersFilter = identityProviderFilter("oidc_providers");
const samlProvidersFilter = identityProviderFilter("saml_providers");
for (const [label, filter] of [
  ["Google-Provider", googleProviderFilter],
  ["Default-Provider-Liste", defaultProvidersFilter],
  ["OIDC-Provider-Liste", oidcProvidersFilter],
  ["SAML-Provider-Liste", samlProvidersFilter]
]) {
  assert.ok(filter, `${label}: numerischer Resource-Name-Filter fehlt.`);
}

function verifyIdentityProviderResource(filter, document) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "project_number", identityProjectNumber,
      filter
    ],
    {
      input: JSON.stringify(document),
      encoding: "utf8"
    }
  );
}

const canonicalGoogleProviderName =
  `projects/${identityProjectNumber}/defaultSupportedIdpConfigs/google.com`;
assert.equal(
  verifyIdentityProviderResource(googleProviderFilter, {
    name: canonicalGoogleProviderName,
    enabled: true,
    clientId: "fixture-client.apps.googleusercontent.com"
  }).status,
  0,
  "Der aktivierte Google-Provider mit numerischem Ressourcennamen muss akzeptiert werden."
);
for (const unsafeGoogleProviderName of [
  `projects/${identityProject}/defaultSupportedIdpConfigs/google.com`,
  "projects/765190393968/defaultSupportedIdpConfigs/google.com",
  `${canonicalGoogleProviderName}/extra`
]) {
  assert.notEqual(
    verifyIdentityProviderResource(googleProviderFilter, {
      name: unsafeGoogleProviderName,
      enabled: true,
      clientId: "fixture-client.apps.googleusercontent.com"
    }).status,
    0,
    "Der Google-Provider darf keinen Projekt-ID-, Fremdprojekt- oder Unterressourcennamen tragen."
  );
}

const approvedDefaultProviders = {
  defaultSupportedIdpConfigs: [
    {
      name: canonicalGoogleProviderName,
      enabled: true
    },
    {
      name: `projects/${identityProjectNumber}/defaultSupportedIdpConfigs/apple.com`,
      enabled: false
    }
  ]
};
assert.equal(
  verifyIdentityProviderResource(
    defaultProvidersFilter,
    approvedDefaultProviders
  ).status,
  0,
  "Die vollstaendige Default-Provider-Liste muss genau Google aktiviert akzeptieren."
);
for (const unsafeDefaultProviders of [
  {
    defaultSupportedIdpConfigs: [
      ...approvedDefaultProviders.defaultSupportedIdpConfigs,
      {
        name: `projects/${identityProject}/defaultSupportedIdpConfigs/facebook.com`,
        enabled: false
      }
    ]
  },
  {
    defaultSupportedIdpConfigs: [{
      name: canonicalGoogleProviderName,
      enabled: true
    }],
    nextPageToken: "hidden-page"
  },
  {
    defaultSupportedIdpConfigs: [
      {
        name: canonicalGoogleProviderName,
        enabled: true
      },
      {
        name: `projects/${identityProjectNumber}/defaultSupportedIdpConfigs/facebook.com`,
        enabled: true
      }
    ]
  }
]) {
  assert.notEqual(
    verifyIdentityProviderResource(
      defaultProvidersFilter,
      unsafeDefaultProviders
    ).status,
    0,
    "Fremde Namen, Folgeseiten oder zusaetzliche aktivierte Default-Provider muessen fail-closed stoppen."
  );
}

const approvedOidcProviders = {
  oauthIdpConfigs: [{
    name: `projects/${identityProjectNumber}/oauthIdpConfigs/oidc.disabled`,
    enabled: false
  }]
};
assert.equal(
  verifyIdentityProviderResource(oidcProvidersFilter, approvedOidcProviders).status,
  0,
  "Eine vollstaendig gelesene, deaktivierte OIDC-Liste im numerischen Projekt darf passieren."
);
for (const unsafeOidcProviders of [
  {
    oauthIdpConfigs: [{
      name: `projects/${identityProject}/oauthIdpConfigs/oidc.disabled`,
      enabled: false
    }]
  },
  {
    oauthIdpConfigs: [{
      name: `projects/${identityProjectNumber}/oauthIdpConfigs/oidc.enabled`,
      enabled: true
    }]
  },
  {
    ...approvedOidcProviders,
    nextPageToken: "hidden-page"
  }
]) {
  assert.notEqual(
    verifyIdentityProviderResource(oidcProvidersFilter, unsafeOidcProviders).status,
    0,
    "OIDC-Fremdprojekt, Aktivierung oder unvollstaendige Pagination muss fail-closed stoppen."
  );
}

const approvedSamlProviders = {
  inboundSamlConfigs: [{
    name: `projects/${identityProjectNumber}/inboundSamlConfigs/saml.disabled`,
    enabled: false
  }]
};
assert.equal(
  verifyIdentityProviderResource(samlProvidersFilter, approvedSamlProviders).status,
  0,
  "Eine vollstaendig gelesene, deaktivierte SAML-Liste im numerischen Projekt darf passieren."
);
for (const unsafeSamlProviders of [
  {
    inboundSamlConfigs: [{
      name: "projects/765190393968/inboundSamlConfigs/saml.disabled",
      enabled: false
    }]
  },
  {
    inboundSamlConfigs: [{
      name: `projects/${identityProjectNumber}/inboundSamlConfigs/saml.enabled`,
      enabled: true
    }]
  },
  {
    ...approvedSamlProviders,
    nextPageToken: "hidden-page"
  }
]) {
  assert.notEqual(
    verifyIdentityProviderResource(samlProvidersFilter, unsafeSamlProviders).status,
    0,
    "SAML-Fremdprojekt, Aktivierung oder unvollstaendige Pagination muss fail-closed stoppen."
  );
}

assert.match(
  identityPlatformTerraform,
  /identity_platform_authorized_domains = sort\(\[\s*var\.IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME,\s*"\$\{var\.GCP_PROJECT_ID\}\.firebaseapp\.com",\s*"iap\.googleapis\.com",\s*\]\)/u
);
assert.doesNotMatch(identityPlatformTerraform, /setunion/u);
assert.doesNotMatch(identityPlatformTerraform, /var\.PUBLIC_HOSTNAME/u);
assert.match(
  terraformVariables,
  /variable "IDENTITY_PLATFORM_AUTHORIZED_DOMAINS"[\s\S]*length\(var\.IDENTITY_PLATFORM_AUTHORIZED_DOMAINS\) == 0/u
);
assert.match(
  terraformVariables,
  /variable "IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME"[\s\S]*default\s*=\s*"versorgungs-kompass\.de"[\s\S]*var\.IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME == "versorgungs-kompass\.de"/u
);
const terraformIdentityHostname = terraformVariables.match(
  /variable "IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME"[\s\S]*?default\s*=\s*"([^"]+)"/u
)?.[1];
assert.equal(
  terraformIdentityHostname,
  identityApiHost,
  "Terraform und Runtime-Preflight muessen denselben kanonischen Identity-Auth-Host pinnen."
);

const connectStepPosition = workflow.indexOf(
  "      - name: Connect to GKE through the DNS endpoint\n"
);
const liveHospitationContractStepPosition = workflow.indexOf(
  "      - name: Require live Hospitations-Kompass database contract before rollout\n"
);
const nextStepAfterConnect = workflow.indexOf(
  "\n      - name: ",
  connectStepPosition + 1
) + 1;
assert.notEqual(connectStepPosition, -1, "Der GKE-Verbindungsschritt fehlt.");
assert.notEqual(
  liveHospitationContractStepPosition,
  -1,
  "Der Live-Hospitations-Kompass-Datenbankvertrag fehlt."
);
assert.equal(
  nextStepAfterConnect,
  liveHospitationContractStepPosition,
  "Der Live-Datenbankvertrag muss unmittelbar nach der GKE-Verbindung und vor jeder Rollout-Mutation laufen."
);
assert.match(liveHospitationContractScript, /deployment\/\$\{deployment_name\}/);
assert.match(liveHospitationContractScript, /--container api/);
assert.match(liveHospitationContractScript, /begin read only/);
assert.match(liveHospitationContractScript, /public\.hospitations/);
assert.match(liveHospitationContractScript, /scheduled_on/);
assert.match(liveHospitationContractScript, /data_type !== "date"/);
assert.match(
  liveHospitationContractScript,
  /\nNODE\n?$/u,
  "Der Here-Document-Abschluss des Live-Datenbankvertrags muss auf Shell-Spalte 0 stehen."
);
assert.equal(
  liveHospitationContractScript.match(/has_column_privilege\(/gu)?.length,
  3,
  "Der Live-Datenbankvertrag muss SELECT, INSERT und UPDATE einzeln und vollständig prüfen."
);
for (const privilege of ["SELECT", "INSERT", "UPDATE"]) {
  assert.ok(
    liveHospitationContractScript.includes(`'${privilege}'`),
    `Der scheduled_on-Spaltenvertrag prüft ${privilege} nicht.`
  );
}
assert.match(liveHospitationContractScript, /hospitations_status_date_idx/);
assert.match(liveHospitationContractScript, /hospitations_schedule_idx/);
assert.match(liveHospitationContractScript, /pg_get_indexdef/);
assert.match(liveHospitationContractScript, /indisvalid/);
assert.match(liveHospitationContractScript, /indisready/);
assert.match(liveHospitationContractScript, /indislive/);
assert.match(liveHospitationContractScript, /indisunique/);
assert.match(liveHospitationContractScript, /indpred is null as unpredicated/);
assert.match(liveHospitationContractScript, /amname !== "btree"/);
assert.match(
  liveHospitationContractScript,
  /order by scheduled_on desc nulls last,\s+starts_at desc nulls last,\s+updated_at desc nulls last\s+limit 0/
);
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
  /deploy_release "\$current_iap_audience" true/,
  "Jeder Release muss die Routing- und Image-Aktualisierung hinter Public-IAP beginnen."
);
assert.doesNotMatch(
  iapScript,
  /phase_a_public_iap=false/,
  "Auch ein etablierter Public-Einstieg darf waehrend des Ingress-Reconcile nicht offen bleiben."
);
assert.match(
  iapScript,
  /printf '%s\\n' "\$existing_public_backend" > "\$restore_marker"[\s\S]*force_public_iap_enabled "\$existing_public_backend"[\s\S]*deploy_release "\$current_iap_audience" true/,
  "Ein bestehendes Public-Backend muss vor jeder Helm-/Ingress-Aenderung mit bewaffnetem Restore hinter IAP konvergieren."
);
assert.match(
  iapScript,
  /The public-entry backend did not become IAP-protected with load-balancer logging disabled before the release reconcile/
);
assert.match(
  iapScript,
  /public_backend_logging_is_disabled\(\)[\s\S]*\.name == \$expected_backend and[\s\S]*\.logConfig\.enable == false/,
  "Der Workflow muss den tatsaechlich aufgeloesten Public-BackendService fail-closed auf logConfig.enable=false lesen."
);
assert.match(
  iapScript,
  /wait_for_boundary\(\)[\s\S]*public_backend_logging_is_disabled "\$public_frontend_backend_service"/,
  "Jeder Boundary-Wait muss deaktiviertes Load-Balancer-Logging am Public-Backend mitpruefen."
);
assert.match(iapScript, /public_ingress_ref_count/);
assert.match(iapScript, /preflight_url_map_name=/);
assert.match(
  iapScript,
  /Apply the reviewed Terraform IAM update before this application rollout/,
  "Die neue URL-Map-Leseberechtigung muss vor jeder Ingress-Aenderung fail-closed geprueft werden."
);
assert.match(
  iapScript,
  /deploy_release "\$iap_audience" false/,
  "IAP darf auf dem Public-Backend erst in der zweiten, verifizierten Phase deaktiviert werden."
);
assert.match(iapScript, /gcloud compute url-maps describe/);
assert.match(iapScript, /The live GCE URL map does not isolate the public backend/);
assert.match(iapScript, /wait_for_boundary/);
assert.match(iapScript, /backend-services get-health/);
assert.match(iapScript, /restore_public_iap/);
assert.match(iapScript, /public-entry-restore-armed/);
const protectedPublicBackendConfigPatch =
  "{spec:{logging:{enable:false},iap:{enabled:true,oauthclientCredentials:{secretName:$secret}}}}";
assert.equal(
  iapScript.split(protectedPublicBackendConfigPatch).length - 1,
  2,
  "Sowohl Force- als auch interner Restore-Patch muessen IAP aktivieren und Public-Load-Balancer-Logging deaktivieren."
);
assert.equal(
  failClosedRestoreScript.split(protectedPublicBackendConfigPatch).length - 1,
  1,
  "Auch der jobweite Fail-closed-Restore muss Load-Balancer-Logging explizit deaktivieren."
);
assert.match(
  failClosedRestoreScript,
  /\.iap\.enabled == true and\s+\.logConfig\.enable == false/,
  "Der jobweite Restore darf erst nach Readback von IAP=true und logConfig.enable=false erfolgreich sein."
);

const publicLoggingFilter = iapScript.match(
  /public_backend_logging_is_disabled\(\) \{[\s\S]*?--arg expected_backend "\$public_backend" '\n([\s\S]*?)\n\s*' <<< "\$public_backend_state"/
)?.[1];
assert.ok(
  publicLoggingFilter,
  "Der Compute-Readback fuer deaktiviertes Public-Load-Balancer-Logging fehlt oder ist nicht eindeutig begrenzt."
);
function verifyPublicLogging(backendState) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg",
      "expected_backend",
      "release-frontend-public",
      publicLoggingFilter
    ],
    { input: JSON.stringify(backendState), encoding: "utf8" }
  );
}
assert.equal(
  verifyPublicLogging({
    name: "release-frontend-public",
    logConfig: { enable: false }
  }).status,
  0,
  "Nur der exakt aufgeloeste BackendService mit explizitem logConfig.enable=false darf freigegeben werden."
);
for (const unsafeBackendState of [
  { name: "release-frontend-public" },
  { name: "release-frontend-public", logConfig: { enable: true } },
  { name: "unexpected-public-backend", logConfig: { enable: false } }
]) {
  assert.notEqual(
    verifyPublicLogging(unsafeBackendState).status,
    0,
    "Fehlendes, aktiviertes oder vom aufgeloesten Backend abweichendes Logging muss fail-closed stoppen."
  );
}
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
          paths: [
            "/",
            "/anmelden",
            "/konto/passwort-festlegen",
            "/public/auth/assets/action.css",
            "/public/auth/assets/action.js",
            "/public/auth/assets/app.css",
            "/public/auth/assets/app.js",
            "/public/auth/brand/versorgungs-kompass.svg",
            "/public/auth/portal-config.js",
            "/public/media/social/mitmachen-share-v3.png"
          ],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/public"
        },
        {
          paths: ["/__/auth", "/__/auth/*"],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/auth-proxy"
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
      pathRules: [
        {
          paths: ["/"],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/public"
        },
        {
          paths: ["/*"],
          service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/protected"
        }
      ]
    }
  ]
};

const prePortalUrlMap = structuredClone(validUrlMap);
prePortalUrlMap.pathMatchers[0].pathRules[0].paths = [
  "/",
  "/anmelden",
  "/public/media/social/mitmachen-share-v3.png"
];
const legacyUrlMap = structuredClone(prePortalUrlMap);
legacyUrlMap.pathMatchers[0].pathRules[0].paths = ["/", "/anmelden"];
legacyUrlMap.pathMatchers[1].pathRules =
  legacyUrlMap.pathMatchers[1].pathRules.filter(
    ({ service }) => !service.endsWith("/backendServices/public")
  );

function verifyUrlMap(value, contract = "desired") {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "canonical_host", "versorgungs-kompass.de",
      "--arg", "root_alias_host", "www.versorgungs-kompass.de",
      "--arg", "contract", contract,
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
assert.equal(
  verifyUrlMap(prePortalUrlMap, "pre_portal").status,
  0,
  "Der URL-Map-Prueffilter muss waehrend des Preflights den bisherigen Public-Entry-Vertrag akzeptieren."
);
assert.equal(
  verifyUrlMap(legacyUrlMap, "legacy").status,
  0,
  "Der URL-Map-Prueffilter muss waehrend des Preflights den engen Legacy-Vertrag akzeptieren."
);
assert.notEqual(
  verifyUrlMap(validUrlMap, "pre_portal").status,
  0,
  "Der Pre-Portal-Vertrag darf die bereits erweiterte Soll-Map nicht akzeptieren."
);
assert.notEqual(
  verifyUrlMap(prePortalUrlMap).status,
  0,
  "Der Soll-Vertrag darf die bisherige Public-Entry-Map nicht akzeptieren."
);
assert.notEqual(
  verifyUrlMap(validUrlMap, "legacy").status,
  0,
  "Der Legacy-Vertrag darf die bereits erweiterte Soll-Map nicht als Legacy-Zustand akzeptieren."
);
assert.notEqual(
  verifyUrlMap(legacyUrlMap).status,
  0,
  "Der Soll-Vertrag darf die noch nicht erweiterte Legacy-Map nicht akzeptieren."
);
const widenedPublicMap = structuredClone(validUrlMap);
widenedPublicMap.pathMatchers[0].pathRules[0].paths.push("/public/*");
assert.notEqual(
  verifyUrlMap(widenedPublicMap).status,
  0,
  "Der URL-Map-Prueffilter muss einen verbreiterten Public-Pfad fail-closed ablehnen."
);
const aliasPublicMap = structuredClone(validUrlMap);
aliasPublicMap.pathMatchers[1].pathRules[0].paths.push("/anmelden");
assert.notEqual(
  verifyUrlMap(aliasPublicMap).status,
  0,
  "Der URL-Map-Prueffilter muss jede zusaetzliche Public-Route auf dem www-Alias ablehnen."
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

const authUrlMapFilter = iapScript.match(
  /--arg auth_proxy_suffix "\/backendServices\/\$\{auth_proxy_backend\}" '([\s\S]*?)' <<< "\$url_map_state"/
)?.[1];
assert.ok(
  authUrlMapFilter,
  "Der Live-Auth-Helper-URL-Map-Prueffilter fehlt oder ist nicht eindeutig begrenzt."
);
function verifyAuthUrlMap(value) {
  return spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "canonical_host", "versorgungs-kompass.de",
      "--arg", "auth_proxy_suffix", "/backendServices/auth-proxy",
      authUrlMapFilter
    ],
    { input: JSON.stringify(value), encoding: "utf8" }
  );
}
assert.equal(
  verifyAuthUrlMap(validUrlMap).status,
  0,
  "Der Auth-Helper-URL-Map-Filter muss exakt GKEs normalisiertes Basis-/Wildcard-Paar akzeptieren."
);
const nearMissAuthMap = structuredClone(validUrlMap);
nearMissAuthMap.pathMatchers[0].pathRules[1].paths[0] = "/__/auth/";
assert.notEqual(
  verifyAuthUrlMap(nearMissAuthMap).status,
  0,
  "Der Auth-Helper-URL-Map-Filter darf den abweichenden Slash-Near-Miss nicht akzeptieren."
);
const incompleteAuthMap = structuredClone(validUrlMap);
incompleteAuthMap.pathMatchers[0].pathRules[1].paths = ["/__/auth/*"];
assert.notEqual(
  verifyAuthUrlMap(incompleteAuthMap).status,
  0,
  "Der Auth-Helper-URL-Map-Filter muss das vollständige GKE-Basis-/Wildcard-Paar verlangen."
);
const widenedAuthMap = structuredClone(validUrlMap);
widenedAuthMap.pathMatchers[0].pathRules[1].paths.push("/__/firebase/*");
assert.notEqual(
  verifyAuthUrlMap(widenedAuthMap).status,
  0,
  "Der Auth-Helper-URL-Map-Filter muss einen verbreiterten Pfad fail-closed ablehnen."
);
const aliasAuthMap = structuredClone(validUrlMap);
aliasAuthMap.pathMatchers[1].pathRules.push({
  paths: ["/__/auth/*"],
  service: "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/auth-proxy"
});
assert.notEqual(
  verifyAuthUrlMap(aliasAuthMap).status,
  0,
  "Der Auth-Helper darf nicht auf einem getrennten Alias-Matcher erscheinen."
);
const sharedAuthMatcherMap = structuredClone(validUrlMap);
sharedAuthMatcherMap.hostRules[1].pathMatcher = "canonical";
assert.notEqual(
  verifyAuthUrlMap(sharedAuthMatcherMap).status,
  0,
  "Der kanonische Auth-Helper-Matcher darf mit keinem Alias-Host geteilt werden."
);
const authDefaultMap = structuredClone(validUrlMap);
authDefaultMap.pathMatchers[0].defaultService =
  "https://www.googleapis.com/compute/v1/projects/p/global/backendServices/auth-proxy";
assert.notEqual(
  verifyAuthUrlMap(authDefaultMap).status,
  0,
  "Das Auth-Helper-Backend darf kein defaultService sein."
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
  'deploy_release "$current_iap_audience" true'
);
const urlMapPermissionPreflight = iapScript.indexOf('preflight_url_map_name=');
const audienceProtected = iapScript.indexOf('deploy_release "$iap_audience" true');
const publicIapDisabled = iapScript.indexOf(
  'deploy_release "$iap_audience" false'
);
const finalPublicLoggingConfigRead = iapScript.indexOf(
  'rendered_public_logging=',
  publicIapDisabled
);
const finalPublicBackendResolution = iapScript.indexOf(
  'resolved_public_backend_after_logging_reconcile=',
  finalPublicLoggingConfigRead
);
const finalPublicLoggingWait = iapScript.indexOf(
  'if ! wait_for_public_backend_logging_disabled "$resolved_public_backend_after_logging_reconcile"',
  finalPublicBackendResolution
);
const computePublicIapDisable = iapScript.indexOf(
  'gcloud compute backend-services update "$public_frontend_backend_service"',
  finalPublicLoggingWait
);
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
  ["Audience-Reconcile hinter Public-IAP", audienceProtected],
  ["Finaler Public-BackendConfig-Reconcile", publicIapDisabled],
  ["Finaler Logging-Sollzustand", finalPublicLoggingConfigRead],
  ["Erneute Public-Backend-Aufloesung", finalPublicBackendResolution],
  ["Logging-Readback vor Freigabe", finalPublicLoggingWait],
  ["Verifizierte Oeffnung des Public-Backends", computePublicIapDisable]
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
    audienceProtected < policyRead &&
    policyVerify < publicIapDisabled,
  "Geschuetzte Policies muessen vor der abschliessenden Public-Oeffnung verifiziert werden."
);
assert.ok(
  publicIapDisabled < finalPublicLoggingConfigRead &&
    finalPublicLoggingConfigRead < finalPublicBackendResolution &&
    finalPublicBackendResolution < finalPublicLoggingWait &&
    finalPublicLoggingWait < computePublicIapDisable,
  "Der aufgeloeste Public-BackendService darf erst nach BackendConfig- und Compute-Readback von deaktiviertem Logging geoeffnet werden."
);
assert.doesNotMatch(
  iapScript,
  /AUTO_ENROLLMENT|autoEnrollment|auto-enrollment/i,
  "Der Deployment-Workflow darf die entfernte Self-Service-Registrierung nicht reaktivieren."
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
  /\$publicRootAliasHosts := \.Values\.frontend\.publicEntry\.rootAliasHosts \| default \(list\)/
);
assert.match(
  ingressTemplate,
  /if and \$\.Values\.frontend\.publicEntry\.enabled \(or \(eq \$host \$\.Values\.ingress\.host\) \(hasKey \$publicRootAliasHostSet \$host\)\)[\s\S]*path: \/\s+pathType: Exact/
);
for (const publicPath of [
  "/anmelden",
  "/konto/passwort-festlegen",
  "/public/auth/portal-config.js",
  "/public/auth/assets/app.css",
  "/public/auth/assets/app.js",
  "/public/auth/assets/action.css",
  "/public/auth/assets/action.js",
  "/public/auth/brand/versorgungs-kompass.svg",
  "/public/media/social/mitmachen-share-v3.png"
]) {
  assert.match(
    ingressTemplate,
    new RegExp(`path: ${publicPath.replaceAll("/", "\\/").replaceAll(".", "\\.")}\\s+pathType: Exact`),
    `Der Ingress pinnt den oeffentlichen Portalpfad nicht exakt: ${publicPath}`
  );
}
assert.doesNotMatch(
  ingressTemplate,
  /path:\s*\/(?:public\/auth|konto\/passwort-festlegen)\s+pathType:\s*Prefix/,
  "Die Public-Ingress-Allowlist darf weder Identity-Assets noch Passwortaktion per Prefix verbreitern."
);
assert.match(
  ingressTemplate,
  /frontend\.publicEntry\.rootAliasHosts host %q must also be listed in ingress\.aliasHosts/
);
assert.match(
  ingressTemplate,
  /frontend\.publicEntry\.rootAliasHosts host %q must also be listed in frontend\.hostRedirects/
);
assert.match(ingressTemplate, /path: \/api[\s\S]*pathType: Prefix/);
assert.match(ingressTemplate, /path: \/\n\s+pathType: Prefix/);
assert.match(
  publicBackendConfigTemplate,
  /spec:\s+timeoutSec:[^\n]*\s+logging:\s+enable: false\s+healthCheck:/,
  "Der Public-BackendConfig-Vertrag muss Load-Balancer-Request-Logging explizit deaktivieren."
);
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
  /deploy_release "\$iap_audience" false[\s\S]*jsonpath='\{\.spec\.iap\}'[\s\S]*--iap=disabled[\s\S]*wait_for_boundary false/,
  "Die finale Phase muss IAP aus BackendConfig entfernen und den Custom-OAuth-Backend direkt oeffnen."
);
assert.match(
  iapScript,
  /patch\s+\\\s+backendconfig\.cloud\.google\.com "\$public_backend_config_name"[\s\S]*--type json[\s\S]*"op":"remove","path":"\/spec\/iap"/,
  "Die finale Phase muss ein von Helm beibehaltenes Public-IAP-Feld explizit und nur am validierten BackendConfig entfernen."
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
assert.match(
  publicDockerfile,
  /COPY --chown=101:101 dist\/target\/public\/media\/social\/mitmachen-share-v3\.png \/usr\/share\/nginx\/html\/public\/media\/social\/mitmachen-share-v3\.png/
);
assert.match(
  publicDockerfile,
  /find \/usr\/share\/nginx\/html -type f \| wc -l \| tr -d ' '\)" = "10"/
);
assert.match(
  publicDockerfile,
  /find \/usr\/share\/nginx\/html\/public\/auth -type f \| wc -l \| tr -d ' '\)" = "8"/
);
for (const portalArtifact of [
  "index.html",
  "konto/passwort-festlegen/index.html",
  "portal-config.js",
  "assets/app.js",
  "assets/app.css",
  "assets/action.js",
  "assets/action.css",
  "brand/versorgungs-kompass.svg"
]) {
  assert.match(
    publicDockerfile,
    new RegExp(`dist\\/target\\/public\\/auth\\/${portalArtifact.replaceAll("/", "\\/").replaceAll(".", "\\.")}`),
    `Das Public-Image kopiert das freigegebene Portal-Artefakt nicht: ${portalArtifact}`
  );
}
assert.match(
  publicDockerfile,
  /test -f \/usr\/share\/nginx\/html\/public\/media\/social\/mitmachen-share-v3\.png/
);
assert.match(publicDockerfile, /grep -Fq 'property="og:image"'/);
assert.match(publicDockerfile, /grep -Fq 'data-public-login-button'/);
assert.match(publicDockerfile, /grep -Fq 'data-identity-portal="signin"'/);
assert.match(publicDockerfile, /grep -Fq 'data-identity-portal="password"'/);
assert.doesNotMatch(publicDockerfile, /public-login\.html/);
assert.match(publicDockerfile, /COPY --chown=101:101 .*frontend-public\.conf/);
assert.match(
  publicDockerfile,
  /apk del --no-network curl libcurl/,
  "Das statische Public-Image darf die nicht benoetigten curl-/libcurl-Laufzeitpakete nicht behalten."
);
assert.match(publicDockerfile, /USER 101:101/);
assert.match(publicNginxConfig, /map \$request_uri \$public_entry_document/);
assert.match(publicNginxConfig, /map \$request_uri \$public_share_image_document/);
assert.match(publicNginxConfig, /map \$request_uri \$public_auth_document/);
assert.match(
  publicNginxConfig,
  /~\^\/public\/media\/social\/mitmachen-share-v3\\\.png\(\?:\\\?\[\^#\]\*\)\?\$ public\/media\/social\/mitmachen-share-v3\.png;/
);
for (const publicAuthAsset of [
  "portal-config.js",
  "assets/app.js",
  "assets/app.css",
  "assets/action.js",
  "assets/action.css",
  "brand/versorgungs-kompass.svg"
]) {
  assert.match(
    publicNginxConfig,
    new RegExp(
      `public\\/auth\\/${publicAuthAsset.replaceAll("/", "\\/").replaceAll(".", "\\.")}`
    ),
    `nginx erlaubt das freigegebene Portal-Artefakt nicht: ${publicAuthAsset}`
  );
}
assert.match(publicNginxConfig, /merge_slashes off/);
assert.match(publicNginxConfig, /absolute_redirect off/);
assert.match(publicNginxConfig, /if \(\$public_entry_document = ""\)/);
assert.match(publicNginxConfig, /!\-f \$document_root\/public-index\.html/);
assert.match(
  publicNginxConfig,
  /!\-f \$document_root\/public\/media\/social\/mitmachen-share-v3\.png/
);
assert.doesNotMatch(publicNginxConfig, /public-login\.html/);
assert.match(
  publicNginxConfig,
  /location = \/anmelden[\s\S]*limit_except GET HEAD[\s\S]*try_files \/public\/auth\/index\.html =404;/
);
assert.match(
  publicNginxConfig,
  /location = \/konto\/passwort-festlegen[\s\S]*limit_except GET HEAD[\s\S]*try_files \/public\/auth\/konto\/passwort-festlegen\/index\.html =404;/
);
assert.doesNotMatch(
  publicNginxConfig,
  /~\^\/public\/auth\/(?:index|konto\/passwort-festlegen\/index)\\\.html/,
  "Die internen Portal-HTML-Dateien duerfen nicht direkt oeffentlich geroutet werden."
);
assert.match(
  publicNginxConfig,
  /location \^~ \/public\/auth\/[\s\S]*if \(\$public_auth_document = ""\)[\s\S]*limit_except GET HEAD[\s\S]*try_files \/\$public_auth_document =404;/
);
assert.match(
  publicNginxConfig,
  /location = \/public\/media\/social\/mitmachen-share-v3\.png[\s\S]*if \(\$public_share_image_document = ""\)[\s\S]*limit_except GET HEAD[\s\S]*try_files \/\$public_share_image_document =404;/
);
assert.match(publicNginxConfig, /default-src 'none'/);
assert.match(publicNginxConfig, /script-src 'none'/);
assert.match(
  publicNginxConfig,
  /~\^\/anmelden[\s\S]*"default-src 'none'[\s\S]*script-src 'self' https:\/\/apis\.google\.com;/
);
assert.doesNotMatch(
  publicNginxConfig,
  /~\^\/anmelden[^\n]*(?:script-src[^;"]*(?:\*|'unsafe-inline'|'unsafe-eval'))/
);
assert.match(publicNginxConfig, /~\^\/konto\/passwort-festlegen[\s\S]*"default-src 'none'[\s\S]*script-src 'self'/);
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
assert.equal(
  workflow.split("npm ci --prefix frontend/identity-portal").length - 1,
  2,
  "Validierung und Deployment muessen die gepinnten Portal-Abhaengigkeiten separat installieren."
);
assert.match(
  workflow,
  /Build target frontend artifact[\s\S]*--identity-platform-api-key AIzaA{35}[\s\S]*--identity-platform-project-id steam-capsule-341212/
);
assert.match(
  workflow,
  /Build and publish target frontend artifact[\s\S]*--identity-platform-api-key "\$IDENTITY_PLATFORM_API_KEY"[\s\S]*--identity-platform-project-id "\$GCP_PROJECT_ID"/
);
assert.match(
  validationScript,
  /IDENTITY_PLATFORM_API_KEY must provide the browser-visible Identity Platform Web API key in every identity mode/
);
assert.match(
  validationScript,
  /\[\[ "\$IDENTITY_PLATFORM_API_KEY" != "\$IAP_EXTERNAL_AUTH_API_KEY" \]\]/
);
assert.match(
  validationScript,
  /\[\[ "\$IAP_EXTERNAL_LOGIN_PAGE_URI" != "\$\{FRONTEND_BASE_URL\}\/anmelden" \]\]/
);
const externalCanonicalGate = validationScript.match(
  /(if \[\[ "\$IAP_IDENTITY_MODE" == "external" && "\$domain_mode" != "canonical" \]\]; then[\s\S]*?\nfi)/
)?.[1];
assert.ok(
  externalCanonicalGate,
  "External Identity Platform muss bereits in der Env-Validierung auf den kanonischen Host begrenzt sein."
);
function verifyExternalCanonicalGate(identityMode, domainMode) {
  return spawnSync(
    "bash",
    ["-c", `${externalCanonicalGate}\nprintf 'accepted\\n'`],
    {
      env: {
        ...process.env,
        IAP_IDENTITY_MODE: identityMode,
        domain_mode: domainMode
      },
      encoding: "utf8"
    }
  );
}
assert.equal(verifyExternalCanonicalGate("external", "canonical").status, 0);
assert.notEqual(
  verifyExternalCanonicalGate("external", "prepare").status,
  0,
  "External Identity darf den Legacy-Vorbereitungs-Origin nicht scheinbar akzeptieren."
);
assert.equal(
  verifyExternalCanonicalGate("iam", "prepare").status,
  0,
  "Der weiterhin freigegebene IAM-Zertifikatsvorbereitungsmodus darf bestehen bleiben."
);
assert.match(workflow, /\/\/anmelden/);

for (const publicContract of [
  'data-public-entry="home"',
  "data-public-login-button",
  'href="/start"',
  'data-identity-portal="signin"',
  'data-identity-portal="password"',
  "/konto/passwort-festlegen",
  "/public/auth/portal-config.js",
  "/public/auth/assets/app.js",
  'signin_status" != "200"',
  'password_status" != "200"',
  "post_status",
  "public_probe=must-not-reflect"
]) {
  assert.ok(
    externalBoundaryScript.includes(publicContract),
    `Der externe Boundary-Smoke prueft den Public-Vertrag nicht: ${publicContract}`
  );
}
for (const whatsappContract of [
  "WhatsApp/2.24.7.75 A",
  "whatsapp_public_status",
  "whatsapp_share_status",
  "whatsapp_preview_probe",
  "WhatsApp cannot retrieve the exact approved share image as a public PNG"
]) {
  assert.ok(
    externalBoundaryScript.includes(whatsappContract),
    `Der externe Boundary-Smoke prueft den WhatsApp-Crawler-Vertrag nicht: ${whatsappContract}`
  );
}
for (const protectedPath of [
  "/start",
  "/enrollment.html",
  "/login.html",
  "/api/healthz",
  "/data/runtime-config.js",
  "/anmelden/",
  "/konto/passwort-festlegen/",
  "/public/auth/index.html",
  "/public/auth/konto/passwort-festlegen/index.html",
  "/public/auth/assets/unknown.js",
  "/public/auth/assets/app.js/"
]) {
  assert.ok(
    externalBoundaryScript.includes(`"${protectedPath}"`),
    `Der externe Boundary-Smoke prueft den geschuetzten Pfad nicht: ${protectedPath}`
  );
}

const protectedPathsBlock = externalBoundaryScript.match(
  /protected_paths=\([\s\S]*?\n\s*\)/
)?.[0];
const authHelperBoundaryBlock = externalBoundaryScript.match(
  /auth_helper_headers=[\s\S]*?\n\s*bare_auth_headers=/
)?.[0];
const bareAuthBoundaryBlock = externalBoundaryScript.match(
  /bare_auth_headers=[\s\S]*?The bare Firebase Auth namespace must fail closed[\s\S]*?\n\s*fi/
)?.[0];
const rejectedAuthAliasesBlock = externalBoundaryScript.match(
  /rejected_auth_aliases=\([\s\S]*?\n\s*\)/
)?.[0];
const rejectedAuthBoundaryBlock = externalBoundaryScript.match(
  /rejected_auth_aliases=\([\s\S]*?\n\s*done/
)?.[0];
const normalizedAliasesBlock = externalBoundaryScript.match(
  /normalized_aliases=\([\s\S]*?\n\s*\)/
)?.[0];
const normalizedBoundaryBlock = externalBoundaryScript.match(
  /normalized_aliases=\([\s\S]*?\n\s*done/
)?.[0];
const authTraversalAliasesBlock = externalBoundaryScript.match(
  /auth_traversal_redirect_aliases=\([\s\S]*?\n\s*\)/
)?.[0];
const authTraversalBoundaryBlock = externalBoundaryScript.match(
  /auth_traversal_redirect_aliases=\([\s\S]*?\n\s*done/
)?.[0];
const matrixAliasesBlock = externalBoundaryScript.match(
  /matrix_aliases=\([\s\S]*?\n\s*\)/
)?.[0];
const matrixBoundaryBlock = externalBoundaryScript.match(
  /matrix_aliases=\([\s\S]*?\n\s*done/
)?.[0];
assert.ok(protectedPathsBlock, "Die Protected-Path-Matrix fehlt.");
assert.ok(authHelperBoundaryBlock, "Der Auth-Handler-Vertrag fehlt.");
assert.ok(bareAuthBoundaryBlock, "Der exakte Bare-Auth-404-Vertrag fehlt.");
assert.ok(rejectedAuthAliasesBlock, "Die Auth-Proxy-Near-Miss-Matrix fehlt.");
assert.ok(rejectedAuthBoundaryBlock, "Der lokale Auth-Proxy-404-Vertrag fehlt.");
assert.ok(normalizedAliasesBlock, "Die sichere Near-Miss-Matrix fehlt.");
assert.ok(normalizedBoundaryBlock, "Der sichere Near-Miss-Vertrag fehlt.");
assert.ok(authTraversalAliasesBlock, "Die GFE-Auth-Traversal-Matrix fehlt.");
assert.ok(authTraversalBoundaryBlock, "Der GFE-Auth-Traversal-Vertrag fehlt.");
assert.ok(matrixAliasesBlock, "Die Matrix-Parameter-Matrix fehlt.");
assert.ok(matrixBoundaryBlock, "Der Matrix-Parameter-Vertrag fehlt.");
for (const authHelperContract of [
  '"${auth_helper_origin}/__/auth/handler?boundary_probe=${GITHUB_RUN_ID}"',
  'auth_helper_status" != "200"',
  "fireauth.oauthhelper.widget.initialize",
  'auth_helper_head_status" == "200"',
  'auth_helper_post_status" == "200"'
]) {
  assert.ok(
    authHelperBoundaryBlock.includes(authHelperContract),
    `Der Auth-Handler-200-Vertrag ist unvollstaendig: ${authHelperContract}`
  );
}
assert.doesNotMatch(
  protectedPathsBlock,
  /"\/__\/auth"/,
  "Der exakte Bare-Auth-Pfad darf nicht als IAP-geschuetzter Pfad geprueft werden."
);
assert.match(
  protectedPathsBlock,
  /"\/__\/authx\/handler"/,
  "Ein Auth-Namespace-Near-Miss muss weiterhin IAP-geschuetzt bleiben."
);
for (const bareAuthContract of [
  '"${auth_helper_origin}/__/auth"',
  'bare_auth_status" != "404"',
  "data-public-entry=",
  "data-identity-portal=",
  "fireauth.",
  "location|set-cookie|x-goog-iap"
]) {
  assert.ok(
    bareAuthBoundaryBlock.includes(bareAuthContract),
    `Der Bare-Auth-404-Vertrag ist unvollstaendig: ${bareAuthContract}`
  );
}
assert.doesNotMatch(
  bareAuthBoundaryBlock,
  /\$\{auth_helper_origin\}\/__\/auth\//,
  "Der Bare-Auth-Probe darf nicht versehentlich den Handler oder einen breiteren Prefix pruefen."
);
for (const rejectedAuthAlias of [
  "/__/auth/%68andler",
  "/__/auth/handler%2ejs",
  "/__/auth//handler",
  "/__/auth/handler/",
  "/__/auth/handler;probe",
  "/__/auth/%252e%252e/start",
  "/__/auth/foo/%252e%252e/handler",
  "/__/auth/%2e%2e%2fstart",
  "/__/auth/%5chandler",
  "/__/auth/action"
]) {
  assert.ok(
    rejectedAuthAliasesBlock.includes(`"${rejectedAuthAlias}"`),
    `Der lokal abzuweisende Auth-Alias fehlt: ${rejectedAuthAlias}`
  );
}
for (const rejectedAuthContract of [
  '"${auth_helper_origin}${rejected_auth_alias}"',
  'rejected_auth_status" != "404"',
  "data-public-entry=",
  "data-identity-portal=",
  "fireauth.",
  "location|set-cookie|x-goog-iap"
]) {
  assert.ok(
    rejectedAuthBoundaryBlock.includes(rejectedAuthContract),
    `Der lokale Auth-Alias-404-Vertrag ist unvollstaendig: ${rejectedAuthContract}`
  );
}
assert.doesNotMatch(
  normalizedAliasesBlock,
  /"\/__\/auth\/%2e%2e\/start"/,
  "Der von GFE kanonisierte Auth-Traversal-Pfad darf nicht den generischen IAP-Marker-Vertrag verwenden."
);
for (const authTraversalAlias of [
  "/__/auth/%2e%2e/start",
  "/__/auth/%2E%2E/start",
  "/__/auth/%2e./start",
  "/__/auth/.%2e/start",
  "/__/auth/../start"
]) {
  assert.ok(
    authTraversalAliasesBlock.includes(`"${authTraversalAlias}"`),
    `Der GFE-kanonisierte Auth-Traversal-Alias fehlt: ${authTraversalAlias}`
  );
}
for (const authTraversalContract of [
  'auth_traversal_status" != "302"',
  'auth_traversal_location" != "${auth_helper_origin}/__/start"',
  '[[ -s "$auth_traversal_body" ]]',
  "set-cookie|x-goog-iap",
  '"${auth_helper_origin}/__/start"',
  "302|401|403",
  "x-goog-iap-generated-response:"
]) {
  assert.ok(
    authTraversalBoundaryBlock.includes(authTraversalContract),
    `Der GFE-Auth-Traversal-Vertrag ist unvollstaendig: ${authTraversalContract}`
  );
}
assert.ok(
  !authTraversalBoundaryBlock.includes("--location"),
  "Der Traversal-Smoke muss Redirect und geschuetztes Ziel als getrennte Sicherheitsgrenzen pruefen."
);
assert.doesNotMatch(
  protectedPathsBlock,
  /"\/anmelden;probe"/,
  "Der vom Load Balancer zum Minimal-Backend geroutete Semikolon-Pfad darf nicht zwingend einen IAP-Header erwarten."
);
assert.doesNotMatch(
  protectedPathsBlock,
  /"\/public\/auth\/assets\/%61pp\.js"/,
  "Der vom Load Balancer zum Minimal-Backend geroutete percent-kodierte Asset-Pfad darf nicht zwingend einen IAP-Header erwarten."
);
assert.ok(
  normalizedAliasesBlock.includes('"/public/auth/assets/%61pp.js"'),
  "Der percent-kodierte Asset-Near-Miss muss als gehaerteter 404 oder als IAP-Antwort geprueft werden."
);
for (const matrixAlias of [
  "/;",
  "/;;probe",
  "/;probe",
  "/;probe=1",
  "/anmelden;",
  "/anmelden;probe",
  "/anmelden;probe=1",
  "/anmelden;probe/weiter",
  "/anmelden;%2Fprobe",
  "/anmelden;;probe",
  "/konto/passwort-festlegen;",
  "/konto/passwort-festlegen;probe",
  "/public/auth/assets/app.js;probe"
]) {
  assert.ok(
    matrixAliasesBlock.includes(`"${matrixAlias}"`),
    `Der Matrix-Alias fehlt im externen Boundary-Smoke: ${matrixAlias}`
  );
}
assert.match(
  normalizedBoundaryBlock,
  /404\)[\s\S]*data-public-entry=[\s\S]*data-identity-portal=/,
  "Ein Near-Miss-404 darf weder Public-Entry- noch Identity-Portal-Inhalt ausliefern."
);
assert.match(
  normalizedBoundaryBlock,
  /302\|401\|403\)[\s\S]*x-goog-iap-generated-response/,
  "Authentifizierungsantworten fuer Near-Misses muessen von IAP erzeugt sein."
);
assert.match(
  matrixBoundaryBlock,
  /404\)[\s\S]*data-public-entry=[\s\S]*data-identity-portal=[\s\S]*set-cookie:[\s\S]*location:[\s\S]*x-goog-iap-generated-response:/,
  "Ein Matrix-404 muss ohne Public-/Portal-Inhalt, zustandslos und ohne Redirect oder IAP-Mischzustand bleiben."
);
for (const hardenedHeader of [
  "cache-control: no-store",
  "content-security-policy:",
  "x-content-type-options: nosniff"
]) {
  assert.ok(
    matrixBoundaryBlock.toLowerCase().includes(hardenedHeader),
    `Der Matrix-404 prueft den Haertungsheader nicht: ${hardenedHeader}`
  );
}
assert.ok(
  matrixBoundaryBlock.includes(
    "content-security-policy: default-src 'none'; base-uri 'none'; object-src 'none'"
  ),
  "Der Matrix-404 muss durch den exakten restriktiven CSP-Vertrag eindeutig dem Minimal-Backend zugeordnet werden."
);
assert.match(
  matrixBoundaryBlock,
  /302\|401\|403\)[\s\S]*x-goog-iap-generated-response/,
  "Authentifizierungsantworten fuer Matrix-Aliase muessen von IAP erzeugt sein."
);
assert.match(externalBoundaryScript, /x-goog-iap-generated-response/i);
assert.doesNotMatch(
  externalBoundaryScript,
  /awk '[^\n]*\\"/u,
  "Ein einfach quotiertes awk-Programm darf doppelte Anführungszeichen nicht mit Shell-Backslashes maskieren."
);
assert.match(
  externalBoundaryScript,
  /edge_ready=0[\s\S]*edge_consecutive_successes=0[\s\S]*required_edge_successes=6[\s\S]*for attempt in \{1\.\.60\}[\s\S]*data-public-entry="home"[\s\S]*data-public-login-button[\s\S]*href="\/start"[\s\S]*Testzugang aktivieren[\s\S]*edge_consecutive_successes=\$\(\(edge_consecutive_successes \+ 1\)\)[\s\S]*edge_ready=1[\s\S]*edge_consecutive_successes=0/,
  "Der externe Smoke muss mehrere konsistente Edge-Antworten abwarten und bei einem Mischzustand neu zaehlen."
);
assert.match(
  externalBoundaryScript,
  /public_headers="\$edge_probe_headers"[\s\S]*public_body="\$edge_probe_body"[\s\S]*status="\$edge_status"/,
  "Der externe Smoke muss die letzte stabil bestaetigte Edge-Antwort fuer den Public-Entry-Vertrag verwenden."
);
for (const dotSegmentAlias of [
  "/foo/../anmelden",
  "/anmelden/../anmelden",
  "/./anmelden",
  "/foo/../konto/passwort-festlegen",
  "/konto/./passwort-festlegen"
]) {
  assert.ok(
    externalBoundaryScript.includes(`"${dotSegmentAlias}"`),
    `Der externe Boundary-Smoke prueft den vom Load Balancer normalisierten Pfad nicht: ${dotSegmentAlias}`
  );
}
assert.match(
  externalBoundaryScript,
  /canonical_redirect_path="\/anmelden"[\s\S]*canonical_redirect_path="\/konto\/passwort-festlegen"[\s\S]*redirect_location" != "\$canonical_redirect_path"[\s\S]*redirect_location" != "\$\{FRONTEND_BASE_URL\}\$\{canonical_redirect_path\}"/,
  "Ein Load-Balancer-302 darf nur auf den kanonischen Portalpfad desselben Origins zeigen."
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
