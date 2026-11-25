import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

export const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
export const FAL_WEBHOOK_TOLERANCE_SECONDS = 300;
export const MEDIA_WORKER_TOLERANCE_SECONDS = 300;

export type FalJwk = { x?: string };

export function verifyFalSignature(input: {
  requestId: string;
  userId: string;
  timestamp: string;
  signatureHex: string;
  body: Buffer;
  keys: FalJwk[];
  nowSeconds: number;
}): boolean {
  if (!input.requestId || !input.userId || !input.timestamp || !input.signatureHex) return false;
  if (!/^\d+$/.test(input.timestamp) || !/^[0-9a-fA-F]+$/.test(input.signatureHex) || input.signatureHex.length % 2 !== 0) return false;
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(input.nowSeconds - timestamp) > FAL_WEBHOOK_TOLERANCE_SECONDS) return false;
  const digest = createHash("sha256").update(input.body).digest("hex");
  const message = Buffer.from([input.requestId, input.userId, input.timestamp, digest].join("\n"), "utf8");
  const signature = Buffer.from(input.signatureHex, "hex");
  for (const key of input.keys) {
    if (!key.x) continue;
    try {
      const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" });
      if (verify(null, message, publicKey, signature)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function loadFalJwks(input: {
  fetchImpl: typeof fetch;
  nowMs: number;
  cache: { keys: FalJwk[] | null; fetchedAt: number };
  url?: string;
}): Promise<FalJwk[]> {
  const maxAge = 24 * 60 * 60 * 1000;
  if (input.cache.keys && input.nowMs - input.cache.fetchedAt < maxAge) return input.cache.keys;
  const response = await input.fetchImpl(input.url ?? FAL_JWKS_URL);
  if (!response.ok) throw new Error(`JWKS fetch failed with HTTP ${response.status}.`);
  const body = (await response.json()) as { keys?: FalJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  input.cache.keys = keys;
  input.cache.fetchedAt = input.nowMs;
  return keys;
}

export function verifySharedSecret(actual: string | null, expected: string | null): boolean {
  if (!actual || !expected) return false;
  const left = createHash("sha256").update(actual).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function mediaWorkerSignature(secret: string, timestamp: string, body: Buffer): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
}

export function verifyMediaWorkerSignature(input: {
  secret: string | null;
  timestamp: string | null;
  signatureHex: string | null;
  body: Buffer;
  nowSeconds: number;
}): boolean {
  if (!input.secret || !input.timestamp || !input.signatureHex) return false;
  if (!/^\d+$/.test(input.timestamp) || !/^[0-9a-fA-F]+$/.test(input.signatureHex) || input.signatureHex.length % 2 !== 0) return false;
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(input.nowSeconds - timestamp) > MEDIA_WORKER_TOLERANCE_SECONDS) return false;
  const expected = mediaWorkerSignature(input.secret, input.timestamp, input.body);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(input.signatureHex, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
