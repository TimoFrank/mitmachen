import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdtemp,
  realpath,
  rm
} from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import {
  TargetDatabaseConnectionError,
  validateTargetDatabaseConnection
} from "./target-database-connection.mjs";

const { Client } = pg;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const CONNECTION_NAME_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?:[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const PROXY_SOCKET_NAME = ".s.PGSQL.5432";
const PROXY_START_TIMEOUT_MS = 30_000;
const PROXY_STOP_TIMEOUT_MS = 5_000;
const MANAGED_PROXY_ENVIRONMENT = Object.freeze([
  "CLOUDSDK_CONFIG",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LANG",
  "LC_ALL",
  "NO_PROXY",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "http_proxy",
  "https_proxy",
  "no_proxy"
]);
const managedProxySessions = new WeakSet();

export class CloudSqlManagedProxyError extends Error {
  constructor(message, code = "TARGET_MANAGED_PROXY_INVALID") {
    super(message);
    this.name = "CloudSqlManagedProxyError";
    this.code = code;
  }
}

function proxyError(message, code) {
  return new CloudSqlManagedProxyError(message, code);
}

function fingerprintsEqual(left, right) {
  if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function connectionNamesEqual(left, right) {
  if (!CONNECTION_NAME_PATTERN.test(left) || !CONNECTION_NAME_PATTERN.test(right)) return false;
  if (Buffer.byteLength(left) !== Buffer.byteLength(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function assertCloudSqlGateTarget(gateResult) {
  const target = gateResult?.targetDatabase;
  if (
    gateResult?.ok !== true
    || !SHA256_PATTERN.test(gateResult?.fingerprint || "")
    || !target
    || typeof target !== "object"
    || Array.isArray(target)
    || Object.keys(target).length !== 1
    || !CONNECTION_NAME_PATTERN.test(target.connectionName || "")
  ) {
    throw proxyError(
      "The GCP gate did not provide one complete Cloud SQL target identity.",
      "TARGET_GCP_GATE_INVALID"
    );
  }
  return Object.freeze({ connectionName: target.connectionName });
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

export async function validateCloudSqlProxyExecutable(executablePath, expectedFingerprint) {
  if (!isAbsolute(String(executablePath || "")) || !SHA256_PATTERN.test(expectedFingerprint || "")) {
    throw proxyError(
      "An absolute Cloud SQL Auth Proxy executable and an approved SHA-256 pin are required.",
      "TARGET_PROXY_BINARY_PIN_REQUIRED"
    );
  }

  let resolvedPath;
  let metadata;
  try {
    resolvedPath = await realpath(executablePath);
    metadata = await lstat(resolvedPath);
    await access(resolvedPath, fsConstants.X_OK);
  } catch {
    throw proxyError(
      "The pinned Cloud SQL Auth Proxy executable is not a readable executable file.",
      "TARGET_PROXY_BINARY_INVALID"
    );
  }

  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (
    !metadata.isFile()
    || (metadata.mode & 0o022) !== 0
    || (currentUid !== null && metadata.uid !== currentUid && metadata.uid !== 0)
  ) {
    throw proxyError(
      "The Cloud SQL Auth Proxy executable has unsafe ownership or permissions.",
      "TARGET_PROXY_BINARY_PERMISSIONS_INVALID"
    );
  }

  const actualFingerprint = await sha256File(resolvedPath);
  if (!fingerprintsEqual(actualFingerprint, expectedFingerprint)) {
    throw proxyError(
      "The Cloud SQL Auth Proxy executable does not match the independently approved SHA-256 pin.",
      "TARGET_PROXY_BINARY_PIN_MISMATCH"
    );
  }
  return Object.freeze({ resolvedPath, fingerprint: actualFingerprint });
}

export function cloudSqlProxyArguments(connectionName, socketPath) {
  if (!CONNECTION_NAME_PATTERN.test(String(connectionName || "")) || !isAbsolute(String(socketPath || ""))) {
    throw proxyError("The managed Cloud SQL Auth Proxy target is invalid.");
  }
  const instanceQuery = new URLSearchParams({ "unix-socket-path": socketPath });
  return Object.freeze([
    "--sql-data",
    "--run-connection-test",
    "--max-connections=8",
    "--max-sigterm-delay=0s",
    "--exit-zero-on-sigterm",
    "--quiet",
    `${connectionName}?${instanceQuery.toString()}`
  ]);
}

export function managedProxyClientOptions(connectionString, socketDirectory, applicationName) {
  let target;
  try {
    target = validateTargetDatabaseConnection(connectionString);
  } catch (error) {
    if (error instanceof TargetDatabaseConnectionError) {
      throw proxyError(error.message, error.code);
    }
    throw error;
  }
  if (target.transport !== "cloud-sql-auth-proxy-loopback" || !isAbsolute(socketDirectory)) {
    throw proxyError(
      "Apply requires a loopback credential template and the tool-managed Cloud SQL Auth Proxy.",
      "TARGET_MANAGED_PROXY_REQUIRED"
    );
  }

  const parsed = new URL(connectionString);
  let user;
  let password;
  try {
    user = decodeURIComponent(parsed.username || "");
    password = decodeURIComponent(parsed.password || "");
  } catch {
    throw proxyError("The target database credentials are malformed.", "TARGET_CREDENTIALS_INVALID");
  }
  if (!user || !password || /[\u0000-\u001f\u007f]/u.test(`${user}${password}`)) {
    throw proxyError(
      "Apply requires non-empty protected target database credentials.",
      "TARGET_CREDENTIALS_INVALID"
    );
  }

  return Object.freeze({
    user,
    password,
    database: target.database,
    host: socketDirectory,
    port: 5432,
    ssl: false,
    application_name: applicationName,
    connectionTimeoutMillis: 15_000,
    keepAlive: true
  });
}

function childEnvironment(environment) {
  return Object.fromEntries(MANAGED_PROXY_ENVIRONMENT
    .filter((name) => typeof environment[name] === "string" && environment[name].length > 0)
    .map((name) => [name, environment[name]]));
}

async function waitForProxySocket(child, socketPath) {
  let launchFailed = false;
  child.once("error", () => {
    launchFailed = true;
  });
  child.stdout?.resume();
  child.stderr?.resume();

  const deadline = Date.now() + PROXY_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (launchFailed || child.exitCode !== null) {
      throw proxyError(
        "The pinned Cloud SQL Auth Proxy could not start for the approved instance.",
        "TARGET_PROXY_START_FAILED"
      );
    }
    try {
      const socketMetadata = await lstat(socketPath);
      if (socketMetadata.isSocket()) return;
      throw proxyError("The managed proxy path is not a Unix socket.", "TARGET_PROXY_SOCKET_INVALID");
    } catch (error) {
      if (error instanceof CloudSqlManagedProxyError) throw error;
    }
    await delay(50);
  }
  throw proxyError(
    "The pinned Cloud SQL Auth Proxy did not become ready in time.",
    "TARGET_PROXY_START_TIMEOUT"
  );
}

async function waitForChildExit(child, timeoutMilliseconds) {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMilliseconds);
    child.once("exit", () => finish(true));
  });
}

export async function startManagedCloudSqlAuthProxy({
  gateResult,
  targetDatabaseUrl,
  environment = process.env
}, {
  spawnProcess = spawn,
  waitForSocket = waitForProxySocket,
  ClientClass = Client
} = {}) {
  const target = assertCloudSqlGateTarget(gateResult);
  const binary = await validateCloudSqlProxyExecutable(
    environment.CLOUD_SQL_AUTH_PROXY_EXECUTABLE,
    environment.CLOUD_SQL_AUTH_PROXY_SHA256
  );

  // Validate the credential template before creating any local artifact.
  managedProxyClientOptions(
    targetDatabaseUrl,
    "/tmp",
    "versorgungs-kompass-cloud-sql-proxy-validation"
  );

  const socketDirectory = await mkdtemp("/tmp/vk-cloud-sql-proxy-");
  await chmod(socketDirectory, 0o700);
  const socketPath = join(socketDirectory, PROXY_SOCKET_NAME);
  let clientOptions;
  let child;
  try {
    clientOptions = managedProxyClientOptions(
      targetDatabaseUrl,
      socketDirectory,
      "versorgungs-kompass-cloud-sql-proxy-validation"
    );
    child = spawnProcess(
      binary.resolvedPath,
      cloudSqlProxyArguments(target.connectionName, socketPath),
      {
        env: childEnvironment(environment),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
  } catch (error) {
    await rm(socketDirectory, { recursive: true, force: true }).catch(() => {});
    if (error instanceof CloudSqlManagedProxyError) throw error;
    throw proxyError(
      "The pinned Cloud SQL Auth Proxy could not be launched safely.",
      "TARGET_PROXY_START_FAILED"
    );
  }

  let active = true;
  const stop = async () => {
    if (!active) return;
    active = false;
    try {
      if (child.exitCode === null) child.kill("SIGTERM");
      if (!(await waitForChildExit(child, PROXY_STOP_TIMEOUT_MS)) && child.exitCode === null) {
        child.kill("SIGKILL");
        await waitForChildExit(child, PROXY_STOP_TIMEOUT_MS);
      }
    } finally {
      await rm(socketDirectory, { recursive: true, force: true }).catch(() => {});
    }
  };

  try {
    await waitForSocket(child, socketPath);
  } catch (error) {
    await stop();
    throw error;
  }

  const session = Object.freeze({
    connectionName: target.connectionName,
    gateFingerprint: gateResult.fingerprint,
    createClient(applicationName) {
      if (!active || child.exitCode !== null) {
        throw proxyError("The managed Cloud SQL Auth Proxy is no longer active.", "TARGET_PROXY_NOT_ACTIVE");
      }
      return new ClientClass({ ...clientOptions, application_name: applicationName });
    },
    isActive() {
      return active && child.exitCode === null;
    },
    stop
  });
  managedProxySessions.add(session);
  return session;
}

export function assertManagedCloudSqlProxyMatchesGate(session, gateResult) {
  const target = assertCloudSqlGateTarget(gateResult);
  if (
    !session
    || !managedProxySessions.has(session)
    || typeof session.isActive !== "function"
    || !session.isActive()
  ) {
    throw proxyError(
      "Apply is not connected through the tool-managed Cloud SQL Auth Proxy.",
      "TARGET_MANAGED_PROXY_REQUIRED"
    );
  }
  if (!connectionNamesEqual(session.connectionName, target.connectionName)) {
    throw proxyError(
      "The running Cloud SQL Auth Proxy is not bound to the instance approved by the fresh GCP gate.",
      "TARGET_MANAGED_PROXY_INSTANCE_MISMATCH"
    );
  }
  return Object.freeze({ verified: true, connectionName: target.connectionName });
}
