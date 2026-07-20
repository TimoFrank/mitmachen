import { X509Certificate } from "node:crypto";
import { constants as fsConstants, accessSync, readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOOPBACK_HOSTS = new Set(["localhost", "::1"]);

export class TargetDatabaseConnectionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "TargetDatabaseConnectionError";
    this.code = code;
  }
}

function targetConnectionError(message, code) {
  return new TargetDatabaseConnectionError(message, code);
}

function normalizedHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function isLoopbackHostname(hostname) {
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(hostname);
  return Boolean(octets && octets.slice(1).every((octet) => Number(octet) <= 255) && Number(octets[1]) === 127);
}

function parsedTargetConnection(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw targetConnectionError("The target database connection URL is invalid.", "TARGET_URL_INVALID");
  }
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  } catch {
    throw targetConnectionError("The target database connection URL is invalid.", "TARGET_URL_INVALID");
  }
  const hostname = normalizedHostname(parsed.hostname);
  if (
    !POSTGRES_PROTOCOLS.has(parsed.protocol)
    || !hostname
    || !database
    || database.includes("/")
    || parsed.hash
  ) {
    throw targetConnectionError(
      "The target database connection must identify one PostgreSQL host and database.",
      "TARGET_URL_INVALID"
    );
  }
  return Object.freeze({ parsed, hostname, database });
}

function assertSingleParameter(parsed, parameter, expectedValue, code, message) {
  const values = parsed.searchParams.getAll(parameter);
  if (values.length !== 1 || values[0] !== expectedValue) {
    throw targetConnectionError(message, code);
  }
}

function assertExactParameterNames(parsed, expectedNames, code, message) {
  const actualNames = [...parsed.searchParams.keys()].sort();
  const expected = [...expectedNames].sort();
  if (
    actualNames.length !== expected.length
    || actualNames.some((name, index) => name !== expected[index])
  ) {
    throw targetConnectionError(message, code);
  }
}

function assertRemoteRootCertificate(parsed) {
  const certificatePaths = parsed.searchParams.getAll("sslrootcert");
  if (certificatePaths.length !== 1 || !isAbsolute(certificatePaths[0])) {
    throw targetConnectionError(
      "Remote target database TLS requires exactly one absolute sslrootcert path.",
      "TARGET_TLS_ROOT_CERT_REQUIRED"
    );
  }
  try {
    accessSync(certificatePaths[0], fsConstants.R_OK);
    if (!statSync(certificatePaths[0]).isFile()) throw new Error("not-a-file");
    const certificate = new X509Certificate(readFileSync(certificatePaths[0]));
    if (!certificate.ca) throw new Error("not-a-ca");
  } catch {
    throw targetConnectionError(
      "The configured target sslrootcert is not a readable CA certificate file.",
      "TARGET_TLS_ROOT_CERT_INVALID"
    );
  }
  return certificatePaths[0];
}

export function validateTargetDatabaseConnection(connectionString) {
  const { parsed, hostname, database } = parsedTargetConnection(connectionString);
  const loopback = isLoopbackHostname(hostname);
  if (loopback) {
    assertSingleParameter(
      parsed,
      "sslmode",
      "disable",
      "TARGET_LOOPBACK_SSLMODE_INVALID",
      "A loopback target must use exactly sslmode=disable for the local Cloud SQL Auth Proxy hop."
    );
    assertExactParameterNames(
      parsed,
      ["sslmode"],
      "TARGET_LOOPBACK_PARAMETERS_INVALID",
      "A loopback target accepts only the explicit sslmode=disable connection parameter."
    );
    return Object.freeze({
      hostname,
      port: parsed.port || "5432",
      database,
      transport: "cloud-sql-auth-proxy-loopback",
      sslMode: "disable",
      rootCertificateVerified: false
    });
  }

  assertSingleParameter(
    parsed,
    "sslmode",
    "verify-full",
    "TARGET_REMOTE_SSLMODE_INVALID",
    "A remote target database must use exactly sslmode=verify-full."
  );
  assertRemoteRootCertificate(parsed);
  assertExactParameterNames(
    parsed,
    ["sslmode", "sslrootcert"],
    "TARGET_REMOTE_PARAMETERS_INVALID",
    "A remote target accepts only sslmode=verify-full and one absolute sslrootcert parameter."
  );
  return Object.freeze({
    hostname,
    port: parsed.port || "5432",
    database,
    transport: "remote-verify-full",
    sslMode: "verify-full",
    rootCertificateVerified: true
  });
}
