#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceOperator = fileURLToPath(new URL("./gke-writer-freeze.mjs", import.meta.url));
const sourceConfigExample = fileURLToPath(new URL("./gke-writer-freeze.config.example", import.meta.url));
const temporaryRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), "vk-gke-writer-freeze-test-"));
const projectId = "example-pre-gematik-project";
const projectNumber = "123456789012";
const location = "europe-west3";
const clusterName = "versorgungs-kompass-pre-gematik";
const namespace = "pre-gematik";
const namespaceUid = "11111111-1111-4111-8111-111111111111";
const deployment = "versorgungs-kompass-api";
const deploymentUid = "22222222-2222-4222-8222-222222222222";
const replicaSetUid = "33333333-3333-4333-8333-333333333333";
const frontendDeploymentUid = "77777777-7777-4777-8777-777777777777";
const frontendReplicaSetUid = "88888888-8888-4888-8888-888888888888";
const imageDigest = "b".repeat(64);
const otherImageDigest = "c".repeat(64);
const image = `${location}-docker.pkg.dev/${projectId}/versorgungs-kompass/api@sha256:${imageDigest}`;
const imageId = `containerd://sha256:${imageDigest}`;
const selector = "app.kubernetes.io/component=api,app.kubernetes.io/instance=versorgungs-kompass,app.kubernetes.io/name=versorgungs-kompass";
const frontendLabels = {
  "app.kubernetes.io/component": "frontend",
  "app.kubernetes.io/instance": "versorgungs-kompass",
  "app.kubernetes.io/name": "versorgungs-kompass"
};
const apiServer = "https://gke.example.invalid";
const clusterCa = Buffer.from("synthetic-gke-cluster-ca", "utf8");
const clusterCaBase64 = clusterCa.toString("base64");
const clusterCaSha256 = createHash("sha256").update(clusterCa).digest("hex");
const kubeContext = `gke_${projectId}_${location}_${clusterName}`;

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, { encoding: "utf8", ...options });
  assert.equal(result.error, undefined, `Prozess konnte nicht gestartet werden: ${command}`);
  return result;
}

function mustSucceed(command, argumentsList, options = {}) {
  const result = run(command, argumentsList, options);
  assert.equal(result.status, 0, `${command} fehlgeschlagen:\n${result.stderr || result.stdout}`);
  return result;
}

function writeExecutable(file, source) {
  writeFileSync(file, source, { mode: 0o700 });
  chmodSync(file, 0o700);
}

function mode(file) {
  return statSync(file).mode & 0o777;
}

try {
  const repository = path.join(temporaryRoot, "repository");
  const migrationDirectory = path.join(repository, "deploy", "single-server", "migration");
  const protectedDirectory = path.join(temporaryRoot, "protected");
  const fakeBin = path.join(temporaryRoot, "bin");
  for (const directory of [repository, migrationDirectory, protectedDirectory, fakeBin]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
  const operator = path.join(migrationDirectory, "gke-writer-freeze.mjs");
  copyFileSync(sourceOperator, operator);
  chmodSync(operator, 0o755);
  const kubeconfig = path.join(protectedDirectory, "kubeconfig");
  writeFileSync(kubeconfig, "synthetic protected kubeconfig\n", { mode: 0o600 });
  chmodSync(kubeconfig, 0o600);
  const fixtureFile = path.join(protectedDirectory, "cluster-fixture.json");
  const commandLog = path.join(protectedDirectory, "command-log.jsonl");

  function initialFixture(overrides = {}) {
    return {
      activeProject: projectId,
      apiServer,
      clusterCaBase64,
      clusterName,
      deploymentUid,
      generation: 7,
      hpaTargetsApi: false,
      image,
      imageId,
      kubeContext,
      location,
      namespace,
      namespaceUid,
      projectId,
      projectNumber,
      replicas: 2,
      resourceVersion: 100,
      scaleCalls: 0,
      ...overrides
    };
  }

  function writeFixture(value) {
    writeFileSync(fixtureFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    chmodSync(fixtureFile, 0o600);
  }

  function readFixture() {
    return JSON.parse(readFileSync(fixtureFile, "utf8"));
  }

  writeFixture(initialFixture());
  writeFileSync(commandLog, "", { mode: 0o600 });
  chmodSync(commandLog, 0o600);

  writeExecutable(path.join(fakeBin, "gcloud"), `#!/usr/bin/env node
const fs = require("node:fs");
const fixtureFile = ${JSON.stringify(fixtureFile)};
const commandLog = ${JSON.stringify(commandLog)};
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
fs.appendFileSync(commandLog, JSON.stringify({ tool: "gcloud", args }) + "\\n");
if (args[0] === "config" && args[1] === "get-value" && args[2] === "project") {
  process.stdout.write(state.activeProject + "\\n");
} else if (args[0] === "projects" && args[1] === "describe") {
  process.stdout.write(JSON.stringify({
    projectId: state.projectId,
    projectNumber: state.projectNumber,
    lifecycleState: "ACTIVE"
  }));
} else if (args[0] === "container" && args[1] === "clusters" && args[2] === "describe") {
  process.stdout.write(JSON.stringify({
    name: state.clusterName,
    location: state.location,
    status: "RUNNING",
    selfLink: "https://container.googleapis.com/v1/projects/" + state.projectId
      + "/locations/" + state.location + "/clusters/" + state.clusterName,
    controlPlaneEndpointsConfig: { dnsEndpointConfig: { endpoint: state.apiServer } },
    masterAuth: { clusterCaCertificate: state.clusterCaBase64 }
  }));
} else {
  process.stderr.write("unexpected synthetic gcloud command\\n");
  process.exitCode = 41;
}
`);

  writeExecutable(path.join(fakeBin, "kubectl"), `#!/usr/bin/env node
const fs = require("node:fs");
const fixtureFile = ${JSON.stringify(fixtureFile)};
const commandLog = ${JSON.stringify(commandLog)};
const selector = ${JSON.stringify(selector)};
const selectorLabels = Object.fromEntries(selector.split(",").map((entry) => entry.split("=")));
const frontendLabels = ${JSON.stringify(frontendLabels)};
const replicaSetUid = ${JSON.stringify(replicaSetUid)};
const frontendDeploymentUid = ${JSON.stringify(frontendDeploymentUid)};
const frontendReplicaSetUid = ${JSON.stringify(frontendReplicaSetUid)};
const args = process.argv.slice(2);
let state = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
fs.appendFileSync(commandLog, JSON.stringify({ tool: "kubectl", args }) + "\\n");
const commandIndex = args.findIndex((argument) => ["config", "get", "scale"].includes(argument));
if (commandIndex < 0) {
  process.stderr.write("missing synthetic kubectl command\\n");
  process.exit(42);
}
const command = args[commandIndex];
const rest = args.slice(commandIndex + 1);
function metadata(name, uid, resourceVersion) {
  return { name, namespace: state.namespace, uid, resourceVersion: String(resourceVersion) };
}
function deploymentObject() {
  const replicas = state.replicas;
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      ...metadata(${JSON.stringify(deployment)}, state.deploymentUid, state.resourceVersion),
      generation: state.generation
    },
    spec: {
      replicas,
      selector: { matchLabels: selectorLabels },
      template: {
        spec: {
          serviceAccountName: "versorgungs-kompass-api",
          containers: [{
            name: "api",
            image: state.image,
            envFrom: [{ configMapRef: { name: "versorgungs-kompass-api" } }],
            env: [{ name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: "versorgungs-kompass-db", key: "password" } } }]
          }, {
            name: "cloud-sql-proxy",
            image: "proxy.invalid/cloud-sql-proxy@sha256:" + "d".repeat(64)
          }]
        }
      }
    },
    status: {
      observedGeneration: state.generation,
      replicas,
      updatedReplicas: replicas,
      readyReplicas: replicas,
      availableReplicas: replicas
    }
  };
}
function frontendDeploymentObject() {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      ...metadata("versorgungs-kompass-frontend", frontendDeploymentUid, state.resourceVersion + 300),
      generation: 3,
      labels: frontendLabels
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: frontendLabels },
      template: {
        metadata: { labels: frontendLabels },
        spec: {
          serviceAccountName: "versorgungs-kompass-frontend",
          containers: [{ name: "frontend", image: "nginx.example.invalid/frontend@sha256:" + "e".repeat(64) }]
        }
      }
    },
    status: { observedGeneration: 3, replicas: 1, readyReplicas: 1, availableReplicas: 1 }
  };
}
function rogueDeploymentObject() {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      ...metadata("rogue-db-writer", "99999999-9999-4999-8999-999999999999", state.resourceVersion + 400),
      generation: 1,
      labels: { "app.kubernetes.io/component": "worker" }
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "rogue-db-writer" } },
      template: {
        spec: {
          serviceAccountName: "versorgungs-kompass-frontend",
          containers: [{
            name: "worker",
            image: "worker.example.invalid/app@sha256:" + "f".repeat(64),
            env: [{ name: "DATABASE_URL", value: "postgresql://synthetic.invalid/example" }]
          }]
        }
      }
    },
    status: { observedGeneration: 1, replicas: 1, readyReplicas: 1, availableReplicas: 1 }
  };
}
function replicaSetsObject() {
  const replicas = state.replicas;
  return {
    apiVersion: "v1",
    kind: "List",
    items: [{
      apiVersion: "apps/v1",
      kind: "ReplicaSet",
      metadata: {
        ...metadata("versorgungs-kompass-api-abc123", replicaSetUid, state.resourceVersion + 100),
        ownerReferences: [{
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: ${JSON.stringify(deployment)},
          uid: state.deploymentUid,
          controller: true
        }]
      },
      spec: {
        replicas,
        selector: { matchLabels: selectorLabels },
        template: { spec: { containers: [{ name: "api", image: state.image }] } }
      },
      status: { replicas, readyReplicas: replicas }
    }, {
      apiVersion: "apps/v1",
      kind: "ReplicaSet",
      metadata: {
        ...metadata("versorgungs-kompass-frontend-abc123", frontendReplicaSetUid, state.resourceVersion + 310),
        labels: frontendLabels,
        ownerReferences: [{
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: "versorgungs-kompass-frontend",
          uid: frontendDeploymentUid,
          controller: true
        }]
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: frontendLabels },
        template: {
          spec: {
            serviceAccountName: "versorgungs-kompass-frontend",
            containers: [{ name: "frontend", image: "nginx.example.invalid/frontend@sha256:" + "e".repeat(64) }]
          }
        }
      },
      status: { replicas: 1, readyReplicas: 1 }
    }]
  };
}
function podsObject() {
  return {
    apiVersion: "v1",
    kind: "List",
    items: [...Array.from({ length: state.replicas }, (_, index) => ({
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        ...metadata(
          "versorgungs-kompass-api-abc123-pod" + (index + 1),
          "44444444-4444-4444-8444-" + String(index + 1).padStart(12, "0"),
          state.resourceVersion + 200 + index
        ),
        labels: selectorLabels,
        ownerReferences: [{
          apiVersion: "apps/v1",
          kind: "ReplicaSet",
          name: "versorgungs-kompass-api-abc123",
          uid: replicaSetUid,
          controller: true
        }]
      },
      spec: { containers: [{ name: "api", image: state.image }] },
      status: {
        phase: "Running",
        conditions: [{ type: "Ready", status: "True" }],
        containerStatuses: [{ name: "api", image: state.image, imageID: state.imageId, ready: true }]
      }
    })), {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        ...metadata("versorgungs-kompass-frontend-abc123-pod1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", state.resourceVersion + 320),
        labels: frontendLabels,
        ownerReferences: [{
          apiVersion: "apps/v1",
          kind: "ReplicaSet",
          name: "versorgungs-kompass-frontend-abc123",
          uid: frontendReplicaSetUid,
          controller: true
        }]
      },
      spec: {
        serviceAccountName: "versorgungs-kompass-frontend",
        containers: [{ name: "frontend", image: "nginx.example.invalid/frontend@sha256:" + "e".repeat(64) }]
      },
      status: {
        phase: "Running",
        conditions: [{ type: "Ready", status: "True" }],
        containerStatuses: [{
          name: "frontend",
          image: "nginx.example.invalid/frontend@sha256:" + "e".repeat(64),
          imageID: "containerd://sha256:" + "e".repeat(64),
          ready: true
        }]
      }
    }, ...(state.standaloneWriter ? [{
      apiVersion: "v1",
      kind: "Pod",
      metadata: metadata(
        "rogue-standalone-db-writer",
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        state.resourceVersion + 500
      ),
      spec: {
        serviceAccountName: "versorgungs-kompass-frontend",
        containers: [{
          name: "worker",
          image: "worker.example.invalid/app@sha256:" + "f".repeat(64),
          env: [{ name: "DATABASE_URL", value: "postgresql://synthetic.invalid/example" }]
        }]
      },
      status: { phase: "Running" }
    }] : [])]
  };
}
if (command === "config" && rest[0] === "current-context") {
  process.stdout.write(state.kubeContext + "\\n");
} else if (command === "config" && rest[0] === "view") {
  process.stdout.write(state.apiServer + "\\n\\n\\nfalse\\n\\n\\nEND\\n");
} else if (command === "get") {
  const kind = rest[0];
  if (kind === "namespace") {
    process.stdout.write(JSON.stringify({
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: state.namespace, uid: state.namespaceUid, resourceVersion: "10" }
    }));
  } else if (kind === "deployment") {
    process.stdout.write(JSON.stringify(deploymentObject()));
  } else if (kind === "deployments") {
    process.stdout.write(JSON.stringify({
      apiVersion: "v1",
      kind: "List",
      items: [deploymentObject(), frontendDeploymentObject(), ...(state.foreignWriter ? [rogueDeploymentObject()] : [])]
    }));
  } else if (kind === "horizontalpodautoscalers") {
    process.stdout.write(JSON.stringify({
      apiVersion: "v1",
      kind: "List",
      items: state.hpaTargetsApi ? [{ spec: { scaleTargetRef: { kind: "Deployment", name: ${JSON.stringify(deployment)} } } }] : []
    }));
  } else if (kind === "replicasets") {
    process.stdout.write(JSON.stringify(replicaSetsObject()));
  } else if (kind === "pods") {
    process.stdout.write(JSON.stringify(podsObject()));
  } else if (["statefulsets", "daemonsets", "jobs", "cronjobs"].includes(kind)) {
    process.stdout.write(JSON.stringify({ apiVersion: "v1", kind: "List", items: [] }));
  } else if (kind === "serviceaccounts") {
    process.stdout.write(JSON.stringify({
      apiVersion: "v1",
      kind: "List",
      items: [{
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          ...metadata("versorgungs-kompass-api", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "20"),
          annotations: { "iam.gke.io/gcp-service-account": "api@" + state.projectId + ".iam.gserviceaccount.com" }
        }
      }, {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          ...metadata("versorgungs-kompass-frontend", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "21"),
          annotations: { "iam.gke.io/gcp-service-account": "frontend@" + state.projectId + ".iam.gserviceaccount.com" }
        }
      }]
    }));
  } else {
    process.stderr.write("unexpected synthetic get kind\\n");
    process.exitCode = 43;
  }
} else if (command === "scale") {
  const replicaArgument = rest.find((argument) => argument.startsWith("--replicas="));
  const currentArgument = rest.find((argument) => argument.startsWith("--current-replicas="));
  const resourceVersionArgument = rest.find((argument) => argument.startsWith("--resource-version="));
  const nextReplicas = Number(replicaArgument?.split("=")[1]);
  const expectedCurrent = Number(currentArgument?.split("=")[1]);
  const expectedResourceVersion = resourceVersionArgument?.split("=")[1];
  if (
    rest[0] !== "deployment"
    || rest[1] !== ${JSON.stringify(deployment)}
    || expectedCurrent !== state.replicas
    || expectedResourceVersion !== String(state.resourceVersion)
    || ![0, 2].includes(nextReplicas)
  ) {
    process.stderr.write("synthetic scale precondition mismatch\\n");
    process.exit(44);
  } else if (state.rejectScale === true) {
    process.stderr.write("synthetic scale rejection\\n");
    process.exit(46);
  } else {
    state.replicas = nextReplicas;
    state.resourceVersion += 1;
    state.generation += 1;
    state.scaleCalls += 1;
    fs.writeFileSync(fixtureFile, JSON.stringify(state, null, 2) + "\\n", { mode: 0o600 });
    if (state.mutateThenRejectScale === true) {
      process.stderr.write("synthetic scale mutated before transport failure\\n");
      process.exit(47);
    } else {
      process.stdout.write("deployment.apps/" + ${JSON.stringify(deployment)} + " scaled\\n");
    }
  }
} else {
  process.stderr.write("unexpected synthetic kubectl command\\n");
  process.exitCode = 45;
}
`);

  const mainStateFile = path.join(protectedDirectory, "cutover-state.json");
  const configValues = (stateFile, overrides = {}) => ({
    FORMAT_VERSION: "1",
    GCP_PROJECT_ID: projectId,
    GKE_CLUSTER_NAME: clusterName,
    GKE_LOCATION: location,
    GKE_CLUSTER_CA_SHA256: clusterCaSha256,
    KUBECONFIG_PATH: kubeconfig,
    KUBE_CONTEXT: kubeContext,
    KUBE_API_SERVER: apiServer,
    K8S_NAMESPACE: namespace,
    K8S_NAMESPACE_UID: namespaceUid,
    API_DEPLOYMENT: deployment,
    API_DEPLOYMENT_UID: deploymentUid,
    API_CONTAINER: "api",
    API_POD_SELECTOR: selector,
    ALLOWED_NON_DB_CONTROLLERS: "Deployment/versorgungs-kompass-frontend",
    API_IMAGE: image,
    API_IMAGE_ID: imageId,
    ORIGINAL_REPLICAS: "2",
    STATE_FILE: stateFile,
    READBACK_TIMEOUT_SECONDS: "30",
    ...overrides
  });

  function writeConfig(file, values) {
    writeFileSync(file, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
  }

  const exampleKeys = readFileSync(sourceConfigExample, "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")))
    .sort();
  assert.deepEqual(
    exampleKeys,
    Object.keys(configValues(mainStateFile)).sort(),
    "Versionierte Konfigurationsvorlage und Operatorvertrag muessen dieselben Felder enthalten."
  );

  const configFile = path.join(protectedDirectory, "target.conf");
  writeConfig(configFile, configValues(mainStateFile));
  const insideConfig = path.join(repository, "inside-target.conf");
  writeConfig(insideConfig, configValues(path.join(protectedDirectory, "inside-state.json")));

  mustSucceed("git", ["init", "-q", repository]);
  mustSucceed("git", ["-C", repository, "config", "user.name", "Writer-Freeze-Test"]);
  mustSucceed("git", ["-C", repository, "config", "user.email", "writer-freeze@test.invalid"]);
  mustSucceed("git", ["-C", repository, "add", "deploy/single-server/migration/gke-writer-freeze.mjs", "inside-target.conf"]);
  mustSucceed("git", ["-C", repository, "commit", "-q", "-m", "Writer-Freeze-Operator testen"]);

  const testEnvironment = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
  };
  function operatorRun(argumentsList) {
    return run(operator, argumentsList, { env: testEnvironment });
  }
  function operatorSuccess(argumentsList) {
    const result = operatorRun(argumentsList);
    assert.equal(result.status, 0, `Operator fehlgeschlagen (${argumentsList.join(" ")}):\n${result.stderr || result.stdout}`);
    return result;
  }
  function operatorFailure(argumentsList, expectedPattern) {
    const result = operatorRun(argumentsList);
    assert.notEqual(result.status, 0, `Negativtest muss fail-closed abbrechen: ${argumentsList.join(" ")}`);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedPattern);
    return result;
  }
  function tokenFrom(result, action) {
    const match = result.stdout.match(new RegExp(`BESTAETIGUNG=(${action.toUpperCase()}:[a-f0-9]{64})`, "u"));
    assert.ok(match, `${action}-Vorschau muss eine zustandsgebundene Bestaetigung liefern.`);
    return match[1];
  }

  const runningStatus = operatorSuccess(["status", "--config", configFile]);
  assert.match(runningStatus.stdout, /PHASE=running/u);
  assert.match(runningStatus.stdout, /REPLICAS=2/u);
  assert.match(runningStatus.stdout, /API_PODS=2/u);
  assert.equal(readFixture().scaleCalls, 0);

  const firstFreezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const staleFreezeToken = tokenFrom(firstFreezePreview, "freeze");
  assert.equal(readFixture().scaleCalls, 0, "Preview darf keine Cluster-Aenderung ausloesen.");
  writeFixture({ ...readFixture(), resourceVersion: 101 });
  operatorFailure(
    ["freeze", "--config", configFile, "--apply", "--confirm", staleFreezeToken],
    /Bestaetigung ist veraltet/u
  );
  assert.equal(readFixture().scaleCalls, 0, "Veraltete Bestaetigung darf nicht skalieren.");
  assert.equal(lstatSync(protectedDirectory).isDirectory(), true);
  assert.equal(mode(protectedDirectory), 0o700);

  const freezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const freezeToken = tokenFrom(freezePreview, "freeze");
  writeFixture({ ...readFixture(), rejectScale: true });
  operatorFailure(
    ["freeze", "--config", configFile, "--apply", "--confirm", freezeToken],
    /Scale-auf-0.*fehlgeschlagen/u
  );
  assert.equal(readFixture().replicas, 2);
  let operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "freeze-pending", "Replica-Zahl muss vor jedem Scale gesichert sein.");
  writeFixture({ ...readFixture(), rejectScale: false });
  const resumedFreezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const resumedFreezeToken = tokenFrom(resumedFreezePreview, "freeze");
  assert.equal(resumedFreezeToken, freezeToken, "Unveraenderter Freeze-Pending-Zustand muss exakt wiederaufnehmbar sein.");
  const freezeApply = operatorSuccess([
    "freeze", "--config", configFile, "--apply", "--confirm", resumedFreezeToken
  ]);
  assert.match(freezeApply.stdout, /PHASE=applied-readback-frozen/u);
  assert.match(freezeApply.stdout, /REPLICAS=0/u);
  assert.match(freezeApply.stdout, /API_PODS=0/u);
  assert.equal(readFixture().replicas, 0);
  assert.equal(readFixture().scaleCalls, 1);
  assert.equal(mode(mainStateFile), 0o600);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "frozen");
  assert.equal(operationState.original_replicas, 2);

  const frozenStatus = operatorSuccess(["status", "--config", configFile]);
  assert.match(frozenStatus.stdout, /PHASE=frozen/u);
  assert.match(frozenStatus.stdout, /STATUSDATEI_PHASE=frozen/u);

  operationState.phase = "freeze-pending";
  operationState.frozen_at = "";
  operationState.frozen_deployment_generation = 0;
  operationState.frozen_deployment_resource_version = "";
  writeFileSync(mainStateFile, `${JSON.stringify(operationState, null, 2)}\n`, { mode: 0o600 });
  chmodSync(mainStateFile, 0o600);
  const freezeReadback = operatorSuccess(["freeze", "--config", configFile, "--readback"]);
  assert.match(freezeReadback.stdout, /PHASE=readback-frozen/u);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "frozen", "Readback muss einen unterbrochenen Freeze abschliessen.");

  const unfreezePreview = operatorSuccess(["unfreeze", "--config", configFile]);
  const unfreezeToken = tokenFrom(unfreezePreview, "unfreeze");
  operatorFailure(
    ["unfreeze", "--config", configFile, "--apply", "--confirm", `UNFREEZE:${"0".repeat(64)}`],
    /Bestaetigung ist veraltet/u
  );
  assert.equal(readFixture().replicas, 0, "Falsche Unfreeze-Bestaetigung darf keine Writer starten.");
  writeFixture({ ...readFixture(), rejectScale: true });
  operatorFailure(
    ["unfreeze", "--config", configFile, "--apply", "--confirm", unfreezeToken],
    /Scale-auf-2.*fehlgeschlagen/u
  );
  assert.equal(readFixture().replicas, 0);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "unfreeze-pending");
  writeFixture({ ...readFixture(), rejectScale: false });
  const resumedUnfreezePreview = operatorSuccess(["unfreeze", "--config", configFile]);
  const resumedUnfreezeToken = tokenFrom(resumedUnfreezePreview, "unfreeze");
  const unfreezeApply = operatorSuccess([
    "unfreeze", "--config", configFile, "--apply", "--confirm", resumedUnfreezeToken
  ]);
  assert.match(unfreezeApply.stdout, /PHASE=applied-readback-running/u);
  assert.match(unfreezeApply.stdout, /REPLICAS=2/u);
  assert.match(unfreezeApply.stdout, /API_PODS=2/u);
  assert.equal(readFixture().replicas, 2);
  assert.equal(readFixture().scaleCalls, 2);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "unfrozen");
  assert.equal(operationState.original_replicas, 2);

  operationState.phase = "unfreeze-pending";
  operationState.unfrozen_at = "";
  operationState.unfrozen_deployment_generation = 0;
  operationState.unfrozen_deployment_resource_version = "";
  writeFileSync(mainStateFile, `${JSON.stringify(operationState, null, 2)}\n`, { mode: 0o600 });
  chmodSync(mainStateFile, 0o600);
  const unfreezeReadback = operatorSuccess(["unfreeze", "--config", configFile, "--readback"]);
  assert.match(unfreezeReadback.stdout, /PHASE=readback-running/u);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "unfrozen", "Readback muss einen unterbrochenen Unfreeze abschliessen.");

  const closePreview = operatorSuccess(["close", "--config", configFile]);
  const closeToken = tokenFrom(closePreview, "close");
  const firstArchiveMatch = closePreview.stdout.match(/^ARCHIV_ZIEL=(.+)$/mu);
  assert.ok(firstArchiveMatch, "Close-Vorschau muss den gebundenen Archivpfad ausweisen.");
  operatorFailure(
    ["close", "--config", configFile, "--apply", "--confirm", `CLOSE:${"0".repeat(64)}`],
    /Close-Bestaetigung ist veraltet/u
  );
  assert.equal(existsSync(mainStateFile), true, "Falsche Close-Bestaetigung darf STATE_FILE nicht freigeben.");
  const closeApply = operatorSuccess(["close", "--config", configFile, "--apply", "--confirm", closeToken]);
  assert.match(closeApply.stdout, /PHASE=archived-new-cycle-ready/u);
  assert.equal(existsSync(mainStateFile), false, "Close muss erst nach gebundener Archivierung einen neuen Zyklus freigeben.");
  assert.equal(existsSync(firstArchiveMatch[1]), true);
  assert.equal(mode(firstArchiveMatch[1]), 0o600);

  const secondFreezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const secondFreezeToken = tokenFrom(secondFreezePreview, "freeze");
  operatorSuccess(["freeze", "--config", configFile, "--apply", "--confirm", secondFreezeToken]);
  assert.equal(readFixture().replicas, 0, "Zweiter gebundener Freeze-Zyklus muss nach Close moeglich sein.");
  const secondUnfreezePreview = operatorSuccess(["unfreeze", "--config", configFile]);
  const secondUnfreezeToken = tokenFrom(secondUnfreezePreview, "unfreeze");
  operatorSuccess(["unfreeze", "--config", configFile, "--apply", "--confirm", secondUnfreezeToken]);
  assert.equal(readFixture().replicas, 2);
  const secondClosePreview = operatorSuccess(["close", "--config", configFile]);
  const secondCloseToken = tokenFrom(secondClosePreview, "close");
  operatorSuccess(["close", "--config", configFile, "--apply", "--confirm", secondCloseToken]);
  assert.equal(existsSync(mainStateFile), false);
  assert.equal(readFixture().scaleCalls, 4);

  const interruptedFreezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const interruptedFreezeToken = tokenFrom(interruptedFreezePreview, "freeze");
  writeFixture({ ...readFixture(), mutateThenRejectScale: true });
  operatorFailure(
    ["freeze", "--config", configFile, "--apply", "--confirm", interruptedFreezeToken],
    /Scale-auf-0.*fehlgeschlagen/u
  );
  assert.equal(readFixture().replicas, 0);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "freeze-pending");
  writeFixture({ ...readFixture(), mutateThenRejectScale: false });
  const pendingToUnfreezePreview = operatorSuccess(["unfreeze", "--config", configFile]);
  const pendingToUnfreezeToken = tokenFrom(pendingToUnfreezePreview, "unfreeze");
  operatorSuccess(["unfreeze", "--config", configFile, "--apply", "--confirm", pendingToUnfreezeToken]);
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "unfrozen", "Unfreeze aus freeze-pending muss einen validen State erzeugen.");
  assert.ok(operationState.frozen_at, "Direktes Unfreeze muss den beobachteten Freeze zuerst beweissicher abschliessen.");
  const interruptedCycleClosePreview = operatorSuccess(["close", "--config", configFile]);
  operatorSuccess([
    "close", "--config", configFile, "--apply", "--confirm", tokenFrom(interruptedCycleClosePreview, "close")
  ]);
  assert.equal(existsSync(mainStateFile), false);
  assert.equal(readFixture().scaleCalls, 6);

  const abortableFreezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const abortableFreezeToken = tokenFrom(abortableFreezePreview, "freeze");
  writeFixture({ ...readFixture(), rejectScale: true });
  operatorFailure(
    ["freeze", "--config", configFile, "--apply", "--confirm", abortableFreezeToken],
    /Scale-auf-0.*fehlgeschlagen/u
  );
  operationState = JSON.parse(readFileSync(mainStateFile, "utf8"));
  assert.equal(operationState.phase, "freeze-pending");
  assert.equal(readFixture().replicas, 2, "Abgelehnter Scale darf die API nicht veraendern.");
  const driftedFixture = readFixture();
  writeFixture({
    ...driftedFixture,
    rejectScale: false,
    resourceVersion: driftedFixture.resourceVersion + 1
  });
  operatorFailure(
    ["freeze", "--config", configFile],
    /nicht sicher wiederaufgenommen/u
  );
  const abortedClosePreview = operatorSuccess(["close", "--config", configFile]);
  const abortedCloseApply = operatorSuccess([
    "close", "--config", configFile, "--apply", "--confirm", tokenFrom(abortedClosePreview, "close")
  ]);
  assert.match(abortedCloseApply.stdout, /PHASE=archived-aborted-freeze-new-cycle-ready/u);
  assert.equal(existsSync(mainStateFile), false, "Abgebrochener Freeze muss beweissicher fuer einen neuen Zyklus schliessbar sein.");
  const postAbortFreezePreview = operatorSuccess(["freeze", "--config", configFile]);
  const postAbortFreezeToken = tokenFrom(postAbortFreezePreview, "freeze");

  const applyLockFile = `${mainStateFile}.lock`;
  writeFileSync(applyLockFile, `${process.pid}\n2026-09-11T00:00:00.000Z\n`, { mode: 0o600 });
  chmodSync(applyLockFile, 0o600);
  operatorFailure(
    ["freeze", "--config", configFile, "--apply", "--confirm", postAbortFreezeToken],
    /lebenden oder nicht sicher pruefbaren Prozess.*PID-Reuse bleibt gesperrt/u
  );
  assert.equal(existsSync(applyLockFile), true, "Lock eines lebenden oder wiederverwendeten PID darf nicht entfernt werden.");
  rmSync(applyLockFile, { force: true });

  writeFileSync(applyLockFile, "999999\n2026-09-11T00:00:00.000Z\nunerlaubte-dritte-zeile\n", { mode: 0o600 });
  chmodSync(applyLockFile, 0o600);
  operatorFailure(
    ["freeze", "--config", configFile, "--apply", "--confirm", postAbortFreezeToken],
    /exakt zwei Zeilen mit PID und ISO-Zeitstempel/u
  );
  assert.equal(existsSync(applyLockFile), true, "Unlesbares Lock-Format muss fail-closed erhalten bleiben.");
  rmSync(applyLockFile, { force: true });

  let missingPid = 2_147_483_647;
  while (missingPid > 2_147_483_600) {
    try {
      process.kill(missingPid, 0);
      missingPid -= 1;
    } catch (error) {
      if (error?.code === "ESRCH") break;
      missingPid -= 1;
    }
  }
  assert.ok(missingPid > 2_147_483_600, "Test benoetigt eine nachweislich nicht existente PID.");
  writeFileSync(applyLockFile, `${missingPid}\n2026-09-11T00:00:00.000Z\n`, { mode: 0o600 });
  chmodSync(applyLockFile, 0o600);
  const recoveredFreeze = operatorSuccess([
    "freeze", "--config", configFile, "--apply", "--confirm", postAbortFreezeToken
  ]);
  assert.match(recoveredFreeze.stdout, /PHASE=applied-readback-frozen/u);
  assert.equal(existsSync(applyLockFile), false, "Eigene Sperrdatei muss nach erfolgreichem Apply entfernt werden.");
  const staleArchivePrefix = `${path.basename(applyLockFile)}.stale-2026-09-11T00-00-00.000Z-${missingPid}-`;
  const archivedLockFiles = readdirSync(protectedDirectory)
    .filter((entry) => entry.startsWith(staleArchivePrefix));
  assert.equal(archivedLockFiles.length, 1, "Verwaistes Lock muss unter eindeutigem Namen archiviert werden.");
  assert.equal(
    readFileSync(path.join(protectedDirectory, archivedLockFiles[0]), "utf8"),
    `${missingPid}\n2026-09-11T00:00:00.000Z\n`
  );
  const recoveredUnfreezePreview = operatorSuccess(["unfreeze", "--config", configFile]);
  operatorSuccess([
    "unfreeze", "--config", configFile, "--apply", "--confirm", tokenFrom(recoveredUnfreezePreview, "unfreeze")
  ]);
  const recoveredClosePreview = operatorSuccess(["close", "--config", configFile]);
  operatorSuccess([
    "close", "--config", configFile, "--apply", "--confirm", tokenFrom(recoveredClosePreview, "close")
  ]);

  const finalStatus = operatorSuccess(["status", "--config", configFile]);
  assert.match(finalStatus.stdout, /PHASE=running/u);
  assert.match(finalStatus.stdout, /STATUSDATEI_PHASE=absent/u);
  assert.match(finalStatus.stdout, /FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0/u);
  assert.match(finalStatus.stdout, /NACHWEIS_GRENZE=konfiguriertes-namespace-und-api-deployment/u);
  assert.match(finalStatus.stdout, /NICHT_ERFASST=externe-db-clients-und-andere-namespaces/u);
  assert.match(finalStatus.stdout, /EXTERNER_GLOBALER_WRITER_NACHWEIS=separat-erforderlich/u);

  const commandRecords = readFileSync(commandLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const clusterReads = commandRecords.filter((record) =>
    record.tool === "gcloud"
    && record.args[0] === "container"
    && record.args[1] === "clusters"
  );
  assert.ok(clusterReads.length > 0);
  assert.ok(clusterReads.every((record) =>
    record.args.includes(`--project=${projectId}`)
    && record.args.includes(`--location=${location}`)
    && record.args.includes(clusterName)
  ), "Jeder GKE-Readback muss Projekt, Location und Cluster explizit binden.");
  const clusterKubectlCalls = commandRecords.filter((record) =>
    record.tool === "kubectl" && record.args.some((argument) => ["get", "scale"].includes(argument))
  );
  assert.ok(clusterKubectlCalls.every((record) =>
    record.args.includes(`--kubeconfig=${kubeconfig}`)
    && record.args.includes(`--context=${kubeContext}`)
  ), "Jeder Workload-Aufruf muss Kubeconfig und Kontext explizit binden.");
  const requiredInventoryKinds = [
    "cronjobs",
    "daemonsets",
    "deployments",
    "horizontalpodautoscalers",
    "jobs",
    "pods",
    "replicasets",
    "serviceaccounts",
    "statefulsets"
  ];
  for (const kind of requiredInventoryKinds) {
    const reads = commandRecords.filter((record) =>
      record.tool === "kubectl"
      && record.args.includes("get")
      && record.args.includes(kind)
    );
    assert.ok(reads.length > 0, `Namespace-Inventur muss ${kind} explizit lesen.`);
    assert.ok(reads.every((record) => record.args.includes(`--namespace=${namespace}`)),
      `Namespace-Inventur muss ${kind} an das konfigurierte Namespace binden.`);
  }
  const scaleRecords = commandRecords.filter((record) => record.tool === "kubectl" && record.args.includes("scale"));
  assert.equal(scaleRecords.length, 11, "Nur bestaetigte Apply-, Wiederaufnahme- und Folgezyklen duerfen skalieren.");
  assert.ok(scaleRecords.every((record) =>
    record.args.some((argument) => argument.startsWith("--current-replicas="))
    && record.args.some((argument) => argument.startsWith("--resource-version="))
  ), "Scale muss Replica- und ResourceVersion-Vorbedingungen verwenden.");

  writeFixture(initialFixture({ imageId: `containerd://sha256:${otherImageDigest}` }));
  operatorFailure(["status", "--config", configFile], /ImageID weicht/u);
  writeFixture(initialFixture({ image: `${location}-docker.pkg.dev/${projectId}/versorgungs-kompass/api@sha256:${otherImageDigest}` }));
  operatorFailure(["status", "--config", configFile], /bestaetigte Image/u);
  writeFixture(initialFixture({ replicas: 1 }));
  operatorFailure(["status", "--config", configFile], /weder.*Running.*Frozen/u);
  writeFixture(initialFixture({ hpaTargetsApi: true }));
  operatorFailure(["status", "--config", configFile], /HorizontalPodAutoscaler/u);
  writeFixture(initialFixture({ foreignWriter: true }));
  operatorFailure(["status", "--config", configFile], /Namespace-Inventur.*rogue-db-writer/u);
  writeFixture(initialFixture({ standaloneWriter: true }));
  operatorFailure(["status", "--config", configFile], /Namespace-Inventur.*rogue-standalone-db-writer.*Standalone-Pod/u);
  writeFixture(initialFixture({ activeProject: "wrong-project" }));
  operatorFailure(["status", "--config", configFile], /gcloud-Projekt weicht/u);
  writeFixture(initialFixture({ clusterName: "wrong-cluster" }));
  operatorFailure(["status", "--config", configFile], /GKE-Cluster ist nicht/u);
  writeFixture(initialFixture({ namespaceUid: "55555555-5555-4555-8555-555555555555" }));
  operatorFailure(["status", "--config", configFile], /Namespace-UID weicht/u);
  writeFixture(initialFixture({ deploymentUid: "66666666-6666-4666-8666-666666666666" }));
  operatorFailure(["status", "--config", configFile], /Deployment-UID weicht/u);
  writeFixture(initialFixture());

  chmodSync(configFile, 0o644);
  operatorFailure(["status", "--config", configFile], /Modus 0600/u);
  chmodSync(configFile, 0o600);
  operatorFailure(["status", "--config", insideConfig], /in beide Richtungen unverschachtelt/u);
  const configSymlink = path.join(protectedDirectory, "target-link.conf");
  symlinkSync(configFile, configSymlink, "file");
  operatorFailure(["status", "--config", configSymlink], /symlinkfreie Datei/u);
  const kubeconfigSymlink = path.join(protectedDirectory, "kubeconfig-link");
  symlinkSync(kubeconfig, kubeconfigSymlink, "file");
  assert.equal(lstatSync(kubeconfigSymlink).isSymbolicLink(), true);
  const symlinkConfig = path.join(protectedDirectory, "symlink-target.conf");
  writeConfig(symlinkConfig, configValues(path.join(protectedDirectory, "symlink-state.json"), {
    KUBECONFIG_PATH: kubeconfigSymlink
  }));
  operatorFailure(["status", "--config", symlinkConfig], /symlinkfreie Datei/u);
  const stateSymlink = path.join(protectedDirectory, "state-link.json");
  symlinkSync(firstArchiveMatch[1], stateSymlink, "file");
  const stateSymlinkConfig = path.join(protectedDirectory, "state-symlink-target.conf");
  writeConfig(stateSymlinkConfig, configValues(stateSymlink));
  operatorFailure(["status", "--config", stateSymlinkConfig], /Statusdatei.*symlinkfreie Datei|STATE_FILE ist ein Symlink/u);

  assert.equal(mode(protectedDirectory), 0o700);
  assert.equal(mode(configFile), 0o600);
  assert.equal(mode(kubeconfig), 0o600);
  console.log("GKE writer freeze operator test OK: preview/apply/readback, exact target binding, zero-pod freeze and replica rollback are enforced.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
