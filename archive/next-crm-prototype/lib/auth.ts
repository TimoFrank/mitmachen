import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "crm_session";

function getSecret() {
  return process.env.SESSION_SECRET || "local-dev-session-secret";
}

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function createSessionValue(userId: number) {
  const payload = String(userId);
  return `${payload}.${sign(payload)}`;
}

export function readSessionValue(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const [payload, signature] = rawValue.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const userId = Number(payload);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export async function setSession(userId: number) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUserId() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  return readSessionValue(cookie?.value);
}

export async function requireUserId() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect("/login");
  }

  return userId;
}
