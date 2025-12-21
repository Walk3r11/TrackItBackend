import { createHash, randomBytes, randomInt } from "crypto";

export function getAppBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  throw new Error("APP_URL is not set");
}

export function getTokenSecret() {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) {
    throw new Error("TOKEN_SECRET is not set");
  }
  return secret;
}

export function hashToken(value: string) {
  const secret = getTokenSecret();
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

export function generateVerificationCode() {
  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  return code;
}

export function generateResetToken() {
  return randomBytes(32).toString("hex");
}

export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}
