import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASSWORD_RESET_ACCEPTED_RESPONSE,
  PASSWORD_RESET_BROKER_PATH,
  PASSWORD_INVITATION_INVALID_MESSAGE,
  PasswordInvitationInvalidError,
  PasswordResetInfrastructureError,
  createIdentityPlatformPasswordResetClient,
  createMetadataAccessTokenProvider,
  createPasswordInvitationStore,
  createPasswordResetBroker,
  trustedPasswordResetClientIp
} from "./password-reset-broker.mjs";
import {
  createPasswordResetEmailSender,
  validatePasswordResetSmtpPassword
} from "./password-reset-email.mjs";

const DEFAULT_PORT = 8080;
const BODY_LIMIT_BYTES = 1024;
const SHUTDOWN_TIMEOUT_MS = 25_000;

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateOrigin(value, production) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PASSWORD_RESET_ALLOWED_ORIGIN ist ungültig.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || (production && parsed.protocol !== "https:")
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || parsed.origin !== value
  ) {
    throw new Error("PASSWORD_RESET_ALLOWED_ORIGIN muss ein exakter HTTPS-Origin sein.");
  }
  return parsed;
}

export function passwordResetServerConfiguration(env = process.env) {
  const production = env.NODE_ENV === "production";
  if (env.PASSWORD_RESET_BROKER_ENABLED !== "1") {
    throw new Error("PASSWORD_RESET_BROKER_ENABLED muss explizit aktiviert sein.");
  }
  const allowedOrigin = validateOrigin(
    String(env.PASSWORD_RESET_ALLOWED_ORIGIN || "").trim(),
    production
  );
  const projectId = String(env.IAP_GCIP_PROJECT_ID || "").trim();
  const tenantId = String(env.IAP_GCIP_TENANT_ID || "").trim();
  const apiKey = String(env.IAP_EXTERNAL_AUTH_API_KEY || "").trim();
  const invitationBucketName = String(env.PASSWORD_INVITATION_BUCKET || "").trim();
  validatePasswordResetSmtpPassword(env.PASSWORD_RESET_SMTP_PASSWORD);
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId)) {
    throw new Error("IAP_GCIP_PROJECT_ID ist ungültig.");
  }
  if (tenantId) {
    throw new Error("Der Passwort-Reset-Pilot unterstützt keine Identity-Platform-Tenants.");
  }
  if (!/^AIza[0-9A-Za-z_-]{35}$/u.test(apiKey)) {
    throw new Error("IAP_EXTERNAL_AUTH_API_KEY ist ungültig.");
  }
  if (
    invitationBucketName.length < 3
    || invitationBucketName.length > 63
    || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/u.test(invitationBucketName)
    || invitationBucketName.startsWith("goog")
    || invitationBucketName.includes("google")
  ) {
    throw new Error("PASSWORD_INVITATION_BUCKET ist ungültig.");
  }
  const port = Number(env.PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT ist ungültig.");
  }
  return Object.freeze({
    production,
    port,
    projectId,
    tenantId,
    apiKey,
    invitationBucketName,
    allowedOrigin: allowedOrigin.origin,
    allowedHost: allowedOrigin.host,
    continueUrl: `${allowedOrigin.origin}/start`
  });
}

function responseHeaders(production) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    ...(production
      ? { "strict-transport-security": "max-age=31536000; includeSubDomains" }
      : {}),
    "x-content-type-options": "nosniff"
  };
}

function sendJson(response, status, payload, production) {
  response.writeHead(status, responseHeaders(production));
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const declaredLength = Number(request.headers["content-length"] || "0");
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
    const error = new Error("Request Body ist zu groß.");
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      const error = new Error("Request Body ist zu groß.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!plainObject(payload)) throw new Error("Body is not an object.");
    return payload;
  } catch (cause) {
    const error = new Error("Request Body ist ungültig.", { cause });
    error.status = 400;
    throw error;
  }
}

function assertBrowserRequest(request, configuration) {
  const contentType = String(request.headers["content-type"] || "").trim().toLowerCase();
  const origin = String(request.headers.origin || "").trim();
  const fetchSite = String(request.headers["sec-fetch-site"] || "").trim().toLowerCase();
  const fetchMode = String(request.headers["sec-fetch-mode"] || "").trim().toLowerCase();
  const fetchDest = String(request.headers["sec-fetch-dest"] || "").trim().toLowerCase();
  if (
    String(request.headers.host || "").trim() !== configuration.allowedHost
    || origin !== configuration.allowedOrigin
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(contentType)
    || (fetchSite && fetchSite !== "same-origin")
    || (fetchMode && fetchMode !== "cors")
    || (fetchDest && fetchDest !== "empty")
    || request.headers.authorization
    || request.headers.cookie
  ) {
    const error = new Error("Anfrage ist nicht zulässig.");
    error.status = 403;
    throw error;
  }
}

export function createPasswordResetHttpHandler({ configuration, broker }) {
  if (!configuration || typeof broker?.request !== "function") {
    throw new TypeError("Passwort-Reset-Server ist nicht vollständig konfiguriert.");
  }
  return async function passwordResetHttpHandler(request, response) {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        return sendJson(response, 200, { ok: true }, configuration.production);
      }
      if (request.method !== "POST" || request.url !== PASSWORD_RESET_BROKER_PATH) {
        return sendJson(response, 404, { error: "Not found" }, configuration.production);
      }
      assertBrowserRequest(request, configuration);
      const body = await readRequestBody(request);
      const bodyKeys = Object.keys(body);
      const emailRequest = bodyKeys.length === 1 && typeof body.email === "string";
      const invitationRequest = bodyKeys.length === 1 && typeof body.invitationToken === "string";
      if (!emailRequest && !invitationRequest) {
        return sendJson(response, 400, { error: "Ungültige Anfrage." }, configuration.production);
      }
      const result = await broker.request({
        ...(emailRequest
          ? { email: body.email }
          : { invitationToken: body.invitationToken }),
        clientIp: trustedPasswordResetClientIp(request, {
          production: configuration.production
        })
      });
      return sendJson(response, invitationRequest ? 200 : 202, result, configuration.production);
    } catch (error) {
      const status = error instanceof PasswordInvitationInvalidError
        ? 400
        : error instanceof PasswordResetInfrastructureError
          ? 503
          : Number(error?.status || 500);
      if (status >= 500) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          severity: "ERROR",
          event: "password_reset_broker_error",
          status,
          errorClass: error?.constructor?.name || "Error"
        }));
      }
      return sendJson(
        response,
        status,
        {
          error: status >= 500
            ? "Passwort-Reset ist vorübergehend nicht erreichbar."
            : error instanceof PasswordInvitationInvalidError
              ? PASSWORD_INVITATION_INVALID_MESSAGE
              : error.message
        },
        configuration.production
      );
    }
  };
}

export function createPasswordResetServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
  accessTokenProvider,
  sendPasswordResetEmail,
  minimumResponseMs = 750
} = {}) {
  const configuration = passwordResetServerConfiguration(env);
  const resolvedAccessTokenProvider = accessTokenProvider
    || createMetadataAccessTokenProvider({ fetchImpl });
  const identityClient = createIdentityPlatformPasswordResetClient({
    projectId: configuration.projectId,
    apiKey: configuration.apiKey,
    tenantId: configuration.tenantId,
    continueUrl: configuration.continueUrl,
    fetchImpl,
    accessTokenProvider: resolvedAccessTokenProvider
  });
  const invitationStore = createPasswordInvitationStore({
    bucketName: configuration.invitationBucketName,
    fetchImpl,
    accessTokenProvider: resolvedAccessTokenProvider
  });
  const smtpPassword = env.PASSWORD_RESET_SMTP_PASSWORD;
  validatePasswordResetSmtpPassword(smtpPassword);
  const resolvedSendPasswordResetEmail = sendPasswordResetEmail
    || createPasswordResetEmailSender({
      smtpPassword
    });
  const broker = createPasswordResetBroker({
    identityClient,
    sendPasswordResetEmail: resolvedSendPasswordResetEmail,
    invitationStore,
    projectId: configuration.projectId,
    tenantId: configuration.tenantId,
    continueUrl: configuration.continueUrl,
    onDeliveryError(error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        severity: "ERROR",
        event: "password_reset_delivery_error",
        status: 503,
        errorClass: error?.constructor?.name || "Error"
      }));
    },
    minimumResponseMs
  });
  const server = http.createServer(createPasswordResetHttpHandler({ configuration, broker }));
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return Object.freeze({ broker, configuration, server });
}

const invoked = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;
if (invoked) {
  const { broker, configuration, server } = createPasswordResetServer();
  server.listen(configuration.port, "0.0.0.0", () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: "INFO",
      event: "password_reset_broker_started",
      port: configuration.port
    }));
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      severity: "INFO",
      event: "password_reset_broker_shutdown",
      signal
    }));
    server.close(async () => {
      await broker.drain();
      process.exit(0);
    });
    setTimeout(() => {
      server.closeAllConnections?.();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export { PASSWORD_RESET_ACCEPTED_RESPONSE };
