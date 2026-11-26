import { createHmac, timingSafeEqual } from "node:crypto";

const buckets = new Map<string, number[]>();

export function allowRequest(key: string, nowMs: number, limit = 120, windowMs = 60_000): boolean {
  const recent = (buckets.get(key) ?? []).filter((time) => nowMs - time < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(nowMs);
  buckets.set(key, recent);
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function signMediaName(secret: string, fileName: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`${fileName}.${expiresAt}`).digest("hex");
}

export function mediaSignatureMatches(secret: string, fileName: string, expiresAt: number, signature: string, nowMs: number): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < nowMs) return false;
  const expected = signMediaName(secret, fileName, expiresAt);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorized(token: string | null, header: string | undefined, method: string): boolean {
  if (!token || method === "GET" || method === "HEAD") return true;
  return header === `Bearer ${token}`;
}
