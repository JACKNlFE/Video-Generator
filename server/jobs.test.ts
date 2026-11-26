import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchToMediaWorker } from "./dispatch";
import { loadConfig } from "./config";
import { applyWebhook, cancelJob, createJob, getJob, openDatabase, retryJob, updateProgress } from "./persist.mjs";
import { mediaWorkerSignature, verifyFalSignature, verifyMediaWorkerSignature } from "./webhooks";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "vg-jobs-"));
  dirs.push(dir);
  return join(dir, "jobs.sqlite");
}

const now = "2026-11-25T18:00:00.000Z";

describe("persistent jobs", () => {
  it("survives reopening the database and does not run the work", () => {
    const file = tempFile();
    const db = openDatabase(file);
    const created = createJob(db, { kind: "media.render", payload: { clip: "city" }, now, idempotencyKey: "render-1" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.job.status).toBe("queued");
    expect(created.replayed).toBe(false);
    db.close();
    const reopened = openDatabase(file);
    const job = getJob(reopened, created.job.id);
    expect(job?.status).toBe("queued");
    expect(job?.payload).toEqual({ clip: "city" });
    const replay = createJob(reopened, { kind: "media.render", payload: { clip: "city" }, now, idempotencyKey: "render-1" });
    expect(replay.ok && replay.replayed && replay.job.id === created.job.id).toBe(true);
    const conflict = createJob(reopened, { kind: "media.render", payload: { clip: "other" }, now, idempotencyKey: "render-1" });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("idempotency_conflict");
    reopened.close();
  });

  it("cancels, retries, and records progress without leaving the queued path inside the request", () => {
    const db = openDatabase(tempFile());
    const created = createJob(db, { kind: "audio.transcribe", payload: {}, now });
    if (!created.ok) throw new Error(created.message);
    const progress = updateProgress(db, created.job.id, 25, now);
    expect(progress.ok && progress.job.status === "processing" && progress.job.progress === 25).toBe(true);
    const cancelled = cancelJob(db, created.job.id, now);
    expect(cancelled.ok && cancelled.job.status === "cancelled").toBe(true);
    const retried = retryJob(db, created.job.id, now);
    expect(retried.ok && retried.job.status === "queued" && retried.job.attempt === 2).toBe(true);
    expect(updateProgress(db, created.job.id, 101, now).ok).toBe(false);
    db.close();
  });

  it("verifies Fal signatures and applies one delivery once", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const jwk = publicKey.export({ format: "jwk" }) as { x: string };
    const body = Buffer.from(JSON.stringify({ request_id: "req-1", status: "OK", payload: { url: "https://example.test/a" } }));
    const timestamp = "1764100000";
    const message = Buffer.from(["req-1", "user-1", timestamp, createHash("sha256").update(body).digest("hex")].join("\n"));
    const signature = sign(null, message, privateKey).toString("hex");
    expect(verifyFalSignature({ requestId: "req-1", userId: "user-1", timestamp, signatureHex: signature, body, keys: [{ x: jwk.x }], nowSeconds: 1764100000 })).toBe(true);
    expect(verifyFalSignature({ requestId: "req-1", userId: "user-1", timestamp, signatureHex: "ab", body, keys: [{ x: jwk.x }], nowSeconds: 1764100000 })).toBe(false);
    expect(verifyFalSignature({ requestId: "req-1", userId: "user-1", timestamp: "1764100401", signatureHex: signature, body, keys: [{ x: jwk.x }], nowSeconds: 1764100000 })).toBe(false);

    const db = openDatabase(tempFile());
    const created = createJob(db, { kind: "video.generate", payload: {}, now, providerRequestId: "req-1" });
    if (!created.ok) throw new Error(created.message);
    const payload = JSON.parse(body.toString("utf8")) as { payload: unknown };
    const first = applyWebhook(db, { provider: "fal", deliveryId: "req-1", providerRequestId: "req-1", body: payload, now, outcome: "completed", result: payload.payload });
    const second = applyWebhook(db, { provider: "fal", deliveryId: "req-1", providerRequestId: "req-1", body: { payload: { url: "other" } }, now, outcome: "completed", result: { url: "other" } });
    expect(first.ok && first.applied && first.job?.status === "completed").toBe(true);
    expect(second.ok && second.duplicate).toBe(true);
    expect(getJob(db, created.job.id)?.result).toEqual({ url: "https://example.test/a" });
    db.close();
  });

  it("rejects a cancelled job's later success webhook", () => {
    const db = openDatabase(tempFile());
    const created = createJob(db, { kind: "audio.align", payload: {}, now, providerRequestId: "align-1" });
    if (!created.ok) throw new Error(created.message);
    cancelJob(db, created.job.id, now);
    const applied = applyWebhook(db, { provider: "media-worker", deliveryId: "delivery-1", providerRequestId: "align-1", now, outcome: "completed", result: { aligned: true } });
    expect(applied.ok && applied.applied).toBe(false);
    expect(getJob(db, created.job.id)?.status).toBe("cancelled");
    db.close();
  });

  it("checks the media worker HMAC and can post a queued job without transcoding locally", async () => {
    const body = Buffer.from(JSON.stringify({ jobId: "job-1", status: "processing", progress: 10 }));
    const signature = mediaWorkerSignature("worker-secret", "1764100000", body);
    expect(verifyMediaWorkerSignature({ secret: "worker-secret", timestamp: "1764100000", signatureHex: signature, body, nowSeconds: 1764100000 })).toBe(true);
    expect(verifyMediaWorkerSignature({ secret: "worker-secret", timestamp: "1764100000", signatureHex: createHmac("sha256", "other").update("1764100000.").update(body).digest("hex"), body, nowSeconds: 1764100000 })).toBe(false);

    const db = openDatabase(tempFile());
    const created = createJob(db, { kind: "audio.separate", payload: { source: "song.wav" }, now });
    if (!created.ok) throw new Error(created.message);
    const calls: string[] = [];
    const undispatched = await dispatchToMediaWorker(created.job, loadConfig({}), async () => {
      calls.push("fetch");
      return new Response(null, { status: 202 });
    });
    expect(undispatched.dispatched).toBe(false);
    expect(calls).toEqual([]);
    expect(getJob(db, created.job.id)?.status).toBe("queued");
    const dispatched = await dispatchToMediaWorker(created.job, loadConfig({ MEDIA_WORKER_URL: "https://worker.example/base", MEDIA_WORKER_SECRET: "worker-secret" }), async (input) => {
      calls.push(String(input));
      return new Response(null, { status: 202 });
    });
    expect(dispatched.dispatched).toBe(true);
    expect(calls[0]).toBe("https://worker.example/base/jobs");
    expect(getJob(db, created.job.id)?.status).toBe("queued");
    db.close();
  });
});
