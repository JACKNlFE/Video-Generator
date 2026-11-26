import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { startServer, type ServerHandle } from "./http";
import { mediaWorkerSignature } from "./webhooks";
import { createPlatform } from "./platform";
import { openDatabase } from "./persist.mjs";
import type { PersistDatabase } from "./persist.d.mts";
import { resolveInside } from "./static";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fixedNow = () => new Date(1764100000 * 1000);

async function boot(env: Record<string, string> = {}, fetchImpl?: typeof fetch, staticRoot: string | null = null): Promise<{ handle: ServerHandle; db: PersistDatabase; base: string }> {
  const dir = mkdtempSync(join(tmpdir(), "vg-http-"));
  dirs.push(dir);
  const config = loadConfig({ ...env, JOBS_DB_PATH: join(dir, "jobs.sqlite"), MEDIA_ROOT: join(dir, "media"), HOST: "127.0.0.1" });
  const db = openDatabase(config.jobsDbPath);
  const platform = createPlatform(config, db);
  const handle = await startServer(platform, { port: 0, now: fixedNow, fetchImpl, staticRoot });
  return { handle, db, base: `http://127.0.0.1:${handle.port}` };
}

function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("http api", () => {
  it("starts with no optional keys and reports provider status", async () => {
    const { handle, db, base } = await boot();
    const health = await fetch(`${base}/health`);
    const body = await health.json() as { ok: boolean; reports: Array<{ providerId: string; status: string }> };
    expect(health.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.reports.find((report) => report.providerId === "anthropic")?.status).toBe("not configured");
    expect(body.reports.find((report) => report.providerId === "sqlite")?.status).toBe("connected and verified");
    const viaApi = await fetch(`${base}/api/health`);
    expect(viaApi.status).toBe(200);
    const address = handle.server.address();
    expect(address && typeof address === "object" ? address.address : "").toBe("127.0.0.1");
    await handle.close();
    db.close();
  });

  it("accepts a job and leaves it queued", async () => {
    const { handle, db, base } = await boot();
    const created = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "media.probe", payload: { name: "city" }, idempotencyKey: "probe-1" }),
    });
    const first = await created.json() as { job: { id: string; status: string }; replayed: boolean; runsInsideRequest: boolean };
    expect(created.status).toBe(202);
    expect(first.job.status).toBe("queued");
    expect(first.runsInsideRequest).toBe(false);
    const replay = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "media.probe", payload: { name: "city" }, idempotencyKey: "probe-1" }),
    });
    const second = await replay.json() as { replayed: boolean; job: { id: string } };
    expect(second.replayed).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    const fetched = await fetch(`${base}/jobs/${first.job.id}`);
    expect(fetched.status).toBe(200);
    await handle.close();
    db.close();
  });

  it("enforces a daily budget on the reservation route", async () => {
    const { handle, db, base } = await boot({ MAX_DAILY_SPEND_USD: "1.00" });
    const body = { amountUsd: "0.60", providerId: "anthropic", operation: "input_tokens", projectId: "p1" };
    const first = await fetch(`${base}/budgets/reservations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const second = await fetch(`${base}/budgets/reservations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, amountUsd: "0.50" }),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    const denied = await second.json() as { error: { code: string } };
    expect(denied.error.code).toBe("budget_exceeded");
    await handle.close();
    db.close();
  });

  it("accepts a signed Fal webhook and ignores a second delivery", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const jwk = publicKey.export({ format: "jwk" }) as { x: string };
    const { handle, db, base } = await boot({}, async () => Response.json({ keys: [{ x: jwk.x }] }));
    const queued = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "image.generate", providerRequestId: "req-1", payload: {} }),
    });
    const job = await queued.json() as { job: { id: string } };
    const raw = Buffer.from(JSON.stringify({ request_id: "req-1", status: "OK", payload: { stored: true } }));
    const timestamp = "1764100000";
    const message = Buffer.from(["req-1", "user-1", timestamp, createHash("sha256").update(raw).digest("hex")].join("\n"));
    const signature = sign(null, message, privateKey).toString("hex");
    const headers = {
      "content-type": "application/json",
      "x-fal-webhook-request-id": "req-1",
      "x-fal-webhook-user-id": "user-1",
      "x-fal-webhook-timestamp": timestamp,
      "x-fal-webhook-signature": signature,
    };
    const accepted = await fetch(`${base}/webhooks/fal`, { method: "POST", headers, body: raw });
    const rejected = await fetch(`${base}/webhooks/fal`, { method: "POST", headers: { ...headers, "x-fal-webhook-signature": "00" }, body: raw });
    const replay = await fetch(`${base}/webhooks/fal`, { method: "POST", headers, body: raw });
    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(401);
    expect(replay.status).toBe(200);
    const replayBody = await replay.json() as { duplicate: boolean };
    expect(replayBody.duplicate).toBe(true);
    const current = await fetch(`${base}/jobs/${job.job.id}`);
    const stored = await current.json() as { job: { status: string; result: { stored: boolean } } };
    expect(stored.job.status).toBe("completed");
    expect(stored.job.result).toEqual({ stored: true });
    await handle.close();
    db.close();
  });

  it("requires the configured AssemblyAI and media worker secrets", async () => {
    const { handle, db, base } = await boot({
      ASSEMBLYAI_WEBHOOK_HEADER_NAME: "X-Webhook-Secret",
      ASSEMBLYAI_WEBHOOK_HEADER_VALUE: "secret-value",
      MEDIA_WORKER_SECRET: "worker-secret",
    });
    const queued = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio.transcribe", providerRequestId: "tr-1", payload: {} }),
    });
    const job = await queued.json() as { job: { id: string } };
    const missing = await fetch(`${base}/webhooks/assemblyai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "tr-1", status: "completed" }) });
    expect(missing.status).toBe(401);
    const accepted = await fetch(`${base}/webhooks/assemblyai`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": "secret-value" },
      body: JSON.stringify({ id: "tr-1", status: "completed" }),
    });
    expect(accepted.status).toBe(200);
    const render = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "media.render", payload: {} }),
    });
    const renderJob = await render.json() as { job: { id: string } };
    const raw = Buffer.from(JSON.stringify({ progress: 40 }));
    const timestamp = "1764100000";
    const progress = await fetch(`${base}/jobs/${renderJob.job.id}/progress`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-media-worker-timestamp": timestamp,
        "x-media-worker-signature": mediaWorkerSignature("worker-secret", timestamp, raw),
      },
      body: raw,
    });
    expect(progress.status).toBe(200);
    const progressed = await progress.json() as { job: { status: string; progress: number } };
    expect(progressed.job).toMatchObject({ status: "processing", progress: 40 });
    const completedProgress = await fetch(`${base}/jobs/${job.job.id}/progress`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-media-worker-timestamp": timestamp,
        "x-media-worker-signature": mediaWorkerSignature("worker-secret", timestamp, raw),
      },
      body: raw,
    });
    expect(completedProgress.status).toBe(409);
    await handle.close();
    db.close();
  });

  it("serves the built editor and the API on one origin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vg-static-"));
    dirs.push(dir);
    const root = join(dir, "dist");
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(join(root, "index.html"), "<!doctype html><div id=\"root\"></div>");
    writeFileSync(join(root, "assets", "app.js"), "console.log('editor')");
    writeFileSync(join(dir, "secret.txt"), "volume-secret");
    const { handle, db, base } = await boot({}, undefined, root);
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain('id="root"');
    const script = await fetch(`${base}/assets/app.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(await script.text()).toContain("editor");
    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
    const body = await health.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    const created = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "media.probe", payload: { name: "city" } }),
    });
    expect(created.status).toBe(202);
    const deep = await fetch(`${base}/library`, { headers: { accept: "text/html" } });
    expect(await deep.text()).toContain('id="root"');
    const missing = await fetch(`${base}/assets/missing.js`);
    expect(missing.status).toBe(404);
    const missingBody = await missing.json() as { error: { code: string } };
    expect(missingBody.error.code).toBe("not_found");
    expect(resolveInside(root, "/../secret.txt")).toBeNull();
    expect(resolveInside(root, "/%2e%2e/secret.txt")).toBeNull();
    const escaped = await rawGet(handle.port, "/../secret.txt");
    const encoded = await rawGet(handle.port, "/%2e%2e/secret.txt");
    expect(escaped.body).not.toContain("volume-secret");
    expect(encoded.body).not.toContain("volume-secret");
    await handle.close();
    db.close();
  });

  it("binds 0.0.0.0 when Railway sets PORT", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vg-bind-"));
    dirs.push(dir);
    const config = loadConfig({
      PORT: "8080",
      HOST: "127.0.0.1",
      RAILWAY_ENVIRONMENT: "production",
      JOBS_DB_PATH: join(dir, "jobs.sqlite"),
      MEDIA_ROOT: join(dir, "media"),
    });
    expect(config.host).toBe("0.0.0.0");
    const db = openDatabase(config.jobsDbPath);
    const handle = await startServer(createPlatform(config, db), { port: 0, staticRoot: null });
    const address = handle.server.address();
    expect(address && typeof address === "object" ? address.address : "").toBe("0.0.0.0");
    await handle.close();
    db.close();
  });
});
