import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";

const context = new AsyncLocalStorage();
export const currentSyncContext = () => context.getStore();
export function syncUuid() {
  const current = context.getStore();
  if (!current) return randomUUID();
  const bytes = createHash("sha256").update(`${current.operationId}:${current.nextId++}`).digest();
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function withinSyncTransaction(client, { operationId, profile }, work) {
  return context.run({ client, operationId, profile, nextId: 0 }, work);
}
// Internal requests only. No header can create this authenticated context.
export async function invokeApi(handler, operation, origin, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(operation.body))]);
  req.method = operation.method;
  req.url = operation.path;
  req.headers = { host: new URL(origin).host, origin, "content-type": "application/json", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.setHeader = (key, value) => { response.headers[key.toLowerCase()] = value; };
  response.getHeader = key => response.headers[key.toLowerCase()];
  response.writeHead = (status, values = {}) => { response.statusCode = status; for (const [key, value] of Object.entries(values)) response.setHeader(key, value); };
  response.end = value => {
    response.body = /application\/json/iu.test(response.headers["content-type"] || "") ? (value ? JSON.parse(String(value)) : {}) : Buffer.from(value || "");
    response.writableEnded = true;
  };
  await handler(req, response);
  if (!response.writableEnded) throw new Error("SYNC_RESPONSE_MISSING");
  return { status: response.statusCode, body: response.body, headers: response.headers };
}
