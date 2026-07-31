import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), "utf8");

const nginx = read("deploy/helm/versorgungs-kompass/files/frontend-auth-proxy.conf");
const deployment = read(
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-deployment.yaml"
);
const service = read(
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-service.yaml"
);
const serviceAccount = read(
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-serviceaccount.yaml"
);
const backendConfig = read(
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-backendconfig.yaml"
);
const configMap = read(
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-configmap.yaml"
);
const ingress = read("deploy/helm/versorgungs-kompass/templates/ingress.yaml");
const networkPolicy = read(
  "deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml"
);
const values = read("deploy/helm/versorgungs-kompass/values.yaml");
const gcpValues = read("deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml");
const schema = JSON.parse(
  read("deploy/helm/versorgungs-kompass/values.schema.json")
);
const portalConfig = read("frontend/identity-portal/public/portal-config.js");
const portalHtml = read("frontend/identity-portal/public/index.html");
const publicNginx = read(
  "deploy/helm/versorgungs-kompass/files/frontend-public.conf"
);
const frontendBuilder = read("scripts/build_static_frontend.sh");
const workflow = read(".github/workflows/deploy-pre-gematik.yml");

const fixedUpstream = "steam-capsule-341212.firebaseapp.com";
assert.equal(
  nginx.match(/proxy_pass\s+https:\/\/steam-capsule-341212\.firebaseapp\.com;/gu)?.length,
  1,
  "Der Auth-Helper darf exakt einen festen HTTPS-Upstream besitzen."
);
assert.doesNotMatch(
  nginx,
  /proxy_pass\s+https?:\/\/\$/u,
  "Der Auth-Helper darf kein variablenbasiertes Open-Proxy-Ziel besitzen."
);
for (const contract of [
  /location = \/__\/auth \{[\s\S]*return 404;/u,
  /location \^~ \/__\/auth\//u,
  /if \(\$request_uri !~ "\^\/__\/auth\/"\)[\s\S]*return 404;/u,
  /if \(\$request_method !~ "\^\(GET\|HEAD\|POST\)\$"\)[\s\S]*return 405;/u,
  /limit_except GET HEAD POST/u,
  /proxy_pass_request_headers off;/u,
  /proxy_ssl_server_name on;/u,
  /proxy_ssl_name steam-capsule-341212\.firebaseapp\.com;/u,
  /proxy_ssl_verify on;/u,
  /proxy_ssl_trusted_certificate \/etc\/ssl\/certs\/ca-certificates\.crt;/u,
  /proxy_set_header Host steam-capsule-341212\.firebaseapp\.com;/u,
  /proxy_redirect off;/u,
  /access_log off;/u,
  /merge_slashes off;/u,
  /location \/ \{[\s\S]*return 404;/u
]) {
  assert.match(nginx, contract, `Auth-Proxy-Vertrag fehlt: ${contract}`);
}
for (const sensitiveHeader of [
  "Authorization",
  "Cookie",
  "Proxy-Authorization",
  "X-Forwarded-Access-Token",
  "X-Goog-Authenticated-User-Email",
  "X-Goog-Authenticated-User-ID",
  "X-Goog-IAP-Authorization",
  "X-Goog-IAP-Generated-Response",
  "X-Goog-IAP-JWT-Assertion"
]) {
  assert.match(
    nginx,
    new RegExp(`proxy_set_header ${sensitiveHeader} "";`, "u"),
    `${sensitiveHeader} muss vor dem festen Upstream entfernt werden.`
  );
}
assert.equal(
  nginx.match(new RegExp(fixedUpstream.replaceAll(".", "\\."), "gu"))?.length,
  3,
  "Upstream, TLS-SNI und Host-Header müssen auf denselben festen Host gepinnt sein."
);

for (const contract of [
  /automountServiceAccountToken:/u,
  /enableServiceLinks: false/u,
  /serviceAccountName: \{\{ include "versorgungs-kompass\.frontendAuthProxyServiceAccountName"/u,
  /readOnly: true/u,
  /checksum\/frontend-auth-proxy-nginx/u,
  /readinessProbe:[\s\S]*path: \/_healthz/u,
  /livenessProbe:[\s\S]*path: \/_healthz/u,
  /frontendAuthProxySelectorLabels/u
]) {
  assert.match(deployment, contract, `Gehärteter Auth-Proxy-Deploymentvertrag fehlt: ${contract}`);
}
assert.match(deployment, /\.Values\.frontend\.authProxy\.image/u);
assert.match(deployment, /\.Values\.frontend\.authProxy\.podSecurityContext/u);
assert.match(deployment, /\.Values\.frontend\.authProxy\.securityContext/u);
assert.doesNotMatch(
  deployment,
  /\.Values\.frontend\.(?:nginx\.image|nginx\.securityContext|podSecurityContext)/u,
  "Das Auth-Proxy-Deployment darf keine gemeinsam überschreibbaren Frontend-Image- oder Security-Werte erben."
);
assert.doesNotMatch(
  deployment,
  /\benv(?:From)?:|secretKeyRef|secretName:/u,
  "Das Auth-Proxy-Deployment darf weder Laufzeit-Secrets noch Umgebungsvariablen erhalten."
);
assert.match(serviceAccount, /automountServiceAccountToken:/u);
assert.doesNotMatch(serviceAccount, /annotations:/u);
assert.match(service, /cloud\.google\.com\/neg/u);
assert.match(service, /cloud\.google\.com\/backend-config/u);
assert.match(configMap, /\.Files\.Get "files\/frontend-auth-proxy\.conf"/u);
assert.match(
  configMap,
  /if and \.Values\.frontend\.authProxy\.enabled \(not \.Values\.ingress\.enabled\)[\s\S]*fail "ingress\.enabled must be true when frontend\.authProxy\.enabled is true"/u
);
assert.match(
  backendConfig,
  /logging:[\s\S]*enable: false[\s\S]*iap:[\s\S]*enabled: false/u
);
assert.doesNotMatch(backendConfig, /oauthclientCredentials|secretName/u);

assert.match(ingress, /\$authProxyCanonicalHost := "versorgungs-kompass\.de"/u);
assert.match(
  ingress,
  /if and \$\.Values\.frontend\.authProxy\.enabled \(eq \$host \$authProxyCanonicalHost\)[\s\S]*path: \/__\/auth\/[\s\S]*pathType: Prefix[\s\S]*frontendAuthProxyFullname/u
);
assert.doesNotMatch(
  ingress,
  /authProxyCanonicalHost[\s\S]*hasKey \$redirectHosts \$host[\s\S]*frontendAuthProxyFullname/u,
  "Der Auth-Helper darf nicht über Redirect-/Alias-Hosts geroutet werden."
);
const authRoutePosition = ingress.indexOf("- path: /__/auth/");
const protectedCatchAllPosition = ingress.lastIndexOf("- path: /");
assert.ok(
  authRoutePosition >= 0 && authRoutePosition < protectedCatchAllPosition,
  "Der kanonische Auth-Prefix muss vor dem geschützten Catch-all gerendert werden."
);

const authPolicyStart = networkPolicy.indexOf(
  'name: {{ include "versorgungs-kompass.frontendAuthProxyFullname" . }}'
);
assert.ok(authPolicyStart >= 0, "Die dedizierte Auth-Proxy-NetworkPolicy fehlt.");
const authPolicy = networkPolicy.slice(authPolicyStart);
assert.match(authPolicy, /policyTypes:[\s\S]*- Ingress[\s\S]*- Egress/u);
assert.match(authPolicy, /port: 53[\s\S]*port: 443/u);
const authEgress = authPolicy.slice(authPolicy.indexOf("  egress:"));
assert.doesNotMatch(
  authEgress,
  /metadataServer|port: 80\b|port: 8080\b/u,
  "Der Auth-Proxy darf weder Metadata-Server- noch sonstigen Anwendungs-Egress besitzen."
);

assert.match(values, /authProxy:[\s\S]*enabled: false[\s\S]*replicaCount: 2/u);
assert.match(
  gcpValues,
  /authProxy:[\s\S]*enabled: true[\s\S]*name: versorgungs-kompass-frontend-auth-proxy[\s\S]*automountServiceAccountToken: false/u
);
assert.equal(
  schema.properties.frontend.properties.authProxy.properties.serviceAccount
    .properties.automountServiceAccountToken.const,
  false
);
assert.equal(
  schema.properties.frontend.properties.authProxy.properties.replicaCount.minimum,
  2
);
const authProxySchema = schema.properties.frontend.properties.authProxy;
assert.match(authProxySchema.properties.image.const, /@sha256:[a-f0-9]{64}$/u);
assert.equal(authProxySchema.properties.imagePullPolicy.const, "IfNotPresent");
assert.deepEqual(authProxySchema.properties.podSecurityContext.const, {
  runAsNonRoot: true,
  runAsUser: 101,
  runAsGroup: 101,
  fsGroup: 101,
  fsGroupChangePolicy: "OnRootMismatch",
  seccompProfile: { type: "RuntimeDefault" }
});
assert.deepEqual(authProxySchema.properties.securityContext.const, {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  runAsNonRoot: true,
  runAsUser: 101,
  runAsGroup: 101,
  capabilities: { drop: ["ALL"] }
});

for (const source of [portalConfig, frontendBuilder]) {
  assert.match(source, /authDomain:\s*"versorgungs-kompass\.de"/u);
}
for (const source of [portalConfig, portalHtml, publicNginx]) {
  assert.doesNotMatch(
    source,
    /authDomain:[^\n]*firebaseapp|frame-src[^\n]*firebaseapp/u,
    "Browser-Konfiguration und CSP dürfen keine Firebase-Hosting-Domain sichtbar verwenden."
  );
}
assert.match(portalHtml, /frame-src 'self'/u);
assert.match(publicNginx, /frame-src 'self'/u);

assert.match(
  workflow,
  /google_redirect_uri="https:\/\/versorgungs-kompass\.de\/__\/auth\/handler"/u
);
assert.doesNotMatch(
  workflow,
  /google_redirect_uri="https:\/\/steam-capsule-341212\.firebaseapp\.com\/__\/auth\/handler"/u
);
for (const workflowGate of [
  /auth_proxy_url_map_is_isolated/u,
  /\.pathMatcher == \$canonical_matchers\[0\][\s\S]*\| sort[\s\S]*== \[\$canonical_host\]/u,
  /services_for\("versorgungs-kompass\.de"; "\/__\/auth\/"; "Prefix"\) == \[\$auth_proxy_service\]/u,
  /deployment\/\$\{HELM_RELEASE\}-frontend-auth-proxy/u,
  /backendconfig\.cloud\.google\.com "\$\{HELM_RELEASE\}-frontend-auth-proxy"/u,
  /fireauth\.oauthhelper\.widget\.initialize/u,
  /\/__\/authx\/handler/u,
  /https:\/\/www\.versorgungs-kompass\.de\$\{www_protected_path\}/u,
  /Alias auth-helper path/u,
  /\.spec\.logging\.enable == false/u,
  /\.spec\.iap\.enabled == false/u
]) {
  assert.match(workflow, workflowGate, `Workflow-Gate fehlt: ${workflowGate}`);
}
assert.match(
  workflow,
  /auth_helper_origin="https:\/\/versorgungs-kompass\.de"[\s\S]*\$\{auth_helper_origin\}\/__\/auth\/handler/u
);
assert.match(
  workflow,
  /if \[\[ "\$alias_origin" == "\$auth_helper_origin" \]\]; then[\s\S]*continue/u,
  "Im Prepare-Modus darf der kanonische Helper-Origin nicht als IAP-geschützter Alias bewertet werden."
);
