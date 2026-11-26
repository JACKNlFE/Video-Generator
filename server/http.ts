import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { z } from "zod";
import { anthropicPlanner, runAgentTurn } from "./agent/loop";
import { limitsFrom, reserveForOperation } from "./cost";
import { usdToMicros } from "./money";
import type { Platform } from "./platform";
import {
  applyWebhook,
  cancelJob,
  createJob,
  getJob,
  getReservation,
  reconcile,
  releaseReservation,
  retryJob,
  updateProgress,
} from "./persist.mjs";
import { allowRequest, authorized } from "./security";
import { editorFor, handleStudio, saveEditor } from "./studio";
import { serveStatic } from "./static";
import { loadFalJwks, verifyFalSignature, verifyMediaWorkerSignature, verifySharedSecret, type FalJwk } from "./webhooks";

const JOB_KINDS = ["video.generate", "image.generate", "audio.transcribe", "audio.separate", "audio.align", "media.render", "media.probe"] as const;

const jobBody = z.object({
  kind: z.enum(JOB_KINDS),
  payload: z.unknown().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  providerRequestId: z.string().min(1).max(200).optional(),
  projectId: z.string().min(1).max(200).optional(),
}).strict();

const reserveBody = z.object({
  amountUsd: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  projectId: z.string().min(1).max(200).optional(),
  runId: z.string().min(1).max(200).optional(),
  providerId: z.string().min(1).max(100),
  operation: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200).optional(),
  jobId: z.string().min(1).max(200).optional(),
  quantity: z.number().nonnegative().optional(),
  useRegistryPrice: z.boolean().optional(),
}).strict();

const reconcileBody = z.object({ actualUsd: z.string().regex(/^\d+(?:\.\d{1,6})?$/) }).strict();
const progressBody = z.object({ progress: z.number().int().min(0).max(100) }).strict();

export type ServerHandle = { server: Server; port: number; editorRoot: string | null; close: () => Promise<void> };

export function startServer(platform: Platform, options: { port?: number; fetchImpl?: typeof fetch; now?: () => Date; staticRoot?: string | null } = {}): Promise<ServerHandle> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const staticRoot = options.staticRoot === undefined ? defaultEditorRoot() : options.staticRoot;
  const jwksCache: { keys: FalJwk[] | null; fetchedAt: number } = { keys: null, fetchedAt: 0 };
  const server = createServer(async (request, response) => {
    try {
      await route(platform, request, response, { fetchImpl, now, jwksCache, staticRoot });
    } catch (error) {
      if (error instanceof SyntaxError) {
        send(response, 400, { error: { code: "validation", message: "The request body is not JSON." } });
        return;
      }
      const tooLarge = error instanceof Error && "code" in error && error.code === "body_too_large";
      send(response, tooLarge ? 413 : 500, { error: { code: tooLarge ? "body_too_large" : "internal", message: tooLarge ? "The request body is too large." : "The request failed." } });
    }
  });
  const port = options.port ?? platform.config.port;
  const host = platform.config.host;
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        port: actual,
        editorRoot: staticRoot,
        close: () => new Promise((done, reject) => server.close((error) => (error ? reject(error) : done()))),
      });
    });
  });
}

async function route(platform: Platform, request: IncomingMessage, response: ServerResponse, deps: { fetchImpl: typeof fetch; now: () => Date; jwksCache: { keys: FalJwk[] | null; fetchedAt: number }; staticRoot: string | null }) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";
  const apiPrefixed = url.pathname === "/api" || url.pathname.startsWith("/api/");
  if (url.pathname === "/api") url.pathname = "/";
  else if (url.pathname.startsWith("/api/")) url.pathname = url.pathname.slice(4);
  if (!allowRequest(request.socket.remoteAddress ?? "local", deps.now().getTime())) {
    send(response, 429, { error: { code: "rate_limited", message: "Too many requests." } });
    return;
  }
  if (!authorized(platform.config.appAuthToken, request.headers.authorization, method)) {
    send(response, 401, { error: { code: "unauthorized", message: "This action needs the owner token." } });
    return;
  }
  if (url.pathname.startsWith("/editor") || url.pathname === "/media/upload" || url.pathname === "/agent/turns") {
    const body = await readBody(request, url.pathname === "/media/upload" ? 100_000_000 : 1_000_000);
    if (url.pathname === "/agent/turns") {
      const payload = JSON.parse(body.toString("utf8")) as { projectId?: string; text?: string };
      const selection = platform.select("llm", "execution");
      if (!platform.config.anthropicApiKey || !selection.ok || !selection.modelId) {
        send(response, 200, { configured: false, liveVerified: false, provider: "anthropic", text: "", results: [], stopped: "not-configured" });
        return;
      }
      const store = editorFor(platform.db);
      const model = await anthropicPlanner(platform.config.anthropicApiKey, selection.modelId);
      const turn = await runAgentTurn({
        model,
        store,
        projectId: payload.projectId ?? "",
        userText: payload.text ?? "",
        maxIterations: 4,
        beforeIteration: () => {
          const reserved = reserveForOperation(platform.db, {
            providerId: "anthropic",
            modelId: selection.modelId,
            operation: "input_tokens",
            quantity: 1000,
            limits: limitsFrom(platform.config),
            now: deps.now().toISOString(),
            projectId: payload.projectId,
          });
          return reserved.ok ? { ok: true } : { ok: false, reason: "budget" };
        },
      });
      saveEditor(platform.db, store);
      send(response, 200, { configured: true, ...turn });
      return;
    }
    const handled = await handleStudio({
      db: platform.db,
      config: platform.config,
      method,
      pathname: url.pathname,
      body,
      request,
      response,
      send,
    });
    if (handled) return;
  }
  if (method === "GET" && url.pathname === "/health") {
    const verify = url.searchParams.get("verify") === "1" || platform.config.providerHealthVerify;
    const reports = await platform.health(verify);
    send(response, 200, { ok: true, reports });
    return;
  }
  if (method === "GET" && url.pathname === "/providers") {
    const reports = await platform.health(false);
    send(response, 200, {
      providers: platform.providers.map((provider) => ({
        id: provider.id,
        kinds: provider.kinds,
        displayName: provider.displayName,
        configured: provider.configured,
        capabilities: provider.capabilities(),
      })),
      reports,
      webhooks: webhookUrls(platform),
    });
    return;
  }
  if (method === "POST" && url.pathname === "/jobs") {
    const parsed = jobBody.safeParse(await readJson(request));
    if (!parsed.success) return send(response, 400, { error: { code: "validation", message: "Invalid job.", details: parsed.error.issues } });
    const result = createJob(platform.db, { ...parsed.data, now: deps.now().toISOString() });
    if (!result.ok) return send(response, result.code === "idempotency_conflict" ? 409 : 500, { error: result });
    send(response, 202, { job: result.job, replayed: result.replayed, runsInsideRequest: false });
    return;
  }
  const jobMatch = /^\/jobs\/([^/]+)(?:\/(cancel|retry|progress))?$/.exec(url.pathname);
  if (jobMatch && jobMatch[1]) {
    const id = decodeURIComponent(jobMatch[1]);
    const action = jobMatch[2];
    if (method === "GET" && !action) {
      const job = getJob(platform.db, id);
      if (!job) return send(response, 404, { error: { code: "not_found", message: "Job not found." } });
      return send(response, 200, { job });
    }
    if (method === "POST" && action === "cancel") {
      const result = cancelJob(platform.db, id, deps.now().toISOString());
      if (!result.ok) return send(response, result.code === "not_found" ? 404 : 409, { error: result });
      return send(response, 200, { job: result.job });
    }
    if (method === "POST" && action === "retry") {
      const result = retryJob(platform.db, id, deps.now().toISOString());
      if (!result.ok) return send(response, result.code === "not_found" ? 404 : 409, { error: result });
      return send(response, 200, { job: result.job });
    }
    if (method === "POST" && action === "progress") {
      const body = await readBody(request);
      const headerTimestamp = header(request, "x-media-worker-timestamp");
      const headerSignature = header(request, "x-media-worker-signature");
      const valid = verifyMediaWorkerSignature({
        secret: platform.config.mediaWorkerSecret,
        timestamp: headerTimestamp,
        signatureHex: headerSignature,
        body,
        nowSeconds: Math.floor(deps.now().getTime() / 1000),
      });
      if (!valid) return send(response, 401, { error: { code: "unauthorized", message: "The media worker signature is missing or invalid." } });
      const parsed = progressBody.safeParse(JSON.parse(body.toString("utf8")));
      if (!parsed.success) return send(response, 400, { error: { code: "validation", message: "Invalid progress." } });
      const result = updateProgress(platform.db, id, parsed.data.progress, deps.now().toISOString());
      if (!result.ok) return send(response, result.code === "not_found" ? 404 : 409, { error: result });
      return send(response, 200, { job: result.job });
    }
  }
  if (method === "POST" && url.pathname === "/webhooks/fal") return falWebhook(platform, request, response, deps);
  if (method === "POST" && url.pathname === "/webhooks/assemblyai") return assemblyWebhook(platform, request, response, deps);
  if (method === "POST" && url.pathname === "/webhooks/media-worker") return workerWebhook(platform, request, response, deps);
  if (method === "POST" && url.pathname === "/budgets/reservations") return createReservation(platform, request, response, deps);
  const reservationMatch = /^\/budgets\/reservations\/([^/]+)(?:\/(reconcile|release))?$/.exec(url.pathname);
  if (reservationMatch && reservationMatch[1]) {
    const id = decodeURIComponent(reservationMatch[1]);
    if (method === "GET" && !reservationMatch[2]) {
      const reservation = getReservation(platform.db, id);
      if (!reservation) return send(response, 404, { error: { code: "not_found", message: "Reservation not found." } });
      return send(response, 200, { reservation });
    }
    if (method === "POST" && reservationMatch[2] === "release") {
      const result = releaseReservation(platform.db, id, deps.now().toISOString());
      if (!result.ok) return send(response, result.code === "not_found" ? 404 : 409, { error: result });
      return send(response, 200, { reservation: result.reservation });
    }
    if (method === "POST" && reservationMatch[2] === "reconcile") {
      const parsed = reconcileBody.safeParse(await readJson(request));
      if (!parsed.success) return send(response, 400, { error: { code: "validation", message: "Invalid reconciliation." } });
      const result = reconcile(platform.db, { id, actualMicros: usdToMicros(parsed.data.actualUsd), now: deps.now().toISOString(), limits: limitsFrom(platform.config) });
      if (!result.ok) return send(response, result.code === "not_found" ? 404 : 409, { error: result });
      return send(response, 200, result);
    }
  }
  if (!apiPrefixed && (method === "GET" || method === "HEAD") && deps.staticRoot && serveStatic(deps.staticRoot, url.pathname, request, response, method)) return;
  send(response, 404, { error: { code: "not_found", message: "Not found." } });
}

function defaultEditorRoot(): string | null {
  const root = join(process.cwd(), "dist");
  return existsSync(root) ? root : null;
}

async function createReservation(platform: Platform, request: IncomingMessage, response: ServerResponse, deps: { now: () => Date }) {
  const parsed = reserveBody.safeParse(await readJson(request));
  if (!parsed.success) return send(response, 400, { error: { code: "validation", message: "Invalid reservation.", details: parsed.error.issues } });
  const result = reserveForOperation(platform.db, {
    providerId: parsed.data.providerId,
    operation: parsed.data.operation,
    modelId: parsed.data.modelId,
    projectId: parsed.data.projectId,
    runId: parsed.data.runId,
    jobId: parsed.data.jobId,
    quantity: parsed.data.quantity,
    estimatedMicros: parsed.data.useRegistryPrice ? null : usdToMicros(parsed.data.amountUsd),
    limits: limitsFrom(platform.config),
    now: deps.now().toISOString(),
    unit: "usd",
  });
  if (!result.ok) {
    const status = result.code === "budget_exceeded" ? 409 : result.code === "price_unverified" ? 409 : 400;
    return send(response, status, { error: result });
  }
  send(response, 201, result);
}

async function falWebhook(platform: Platform, request: IncomingMessage, response: ServerResponse, deps: { fetchImpl: typeof fetch; now: () => Date; jwksCache: { keys: FalJwk[] | null; fetchedAt: number } }) {
  const body = await readBody(request);
  let keys: FalJwk[] = [];
  try {
    keys = await loadFalJwks({ fetchImpl: deps.fetchImpl, nowMs: deps.now().getTime(), cache: deps.jwksCache });
  } catch {
    return send(response, 401, { error: { code: "unauthorized", message: "Fal webhook keys could not be loaded." } });
  }
  const valid = verifyFalSignature({
    requestId: header(request, "x-fal-webhook-request-id") ?? "",
    userId: header(request, "x-fal-webhook-user-id") ?? "",
    timestamp: header(request, "x-fal-webhook-timestamp") ?? "",
    signatureHex: header(request, "x-fal-webhook-signature") ?? "",
    body,
    keys,
    nowSeconds: Math.floor(deps.now().getTime() / 1000),
  });
  if (!valid) return send(response, 401, { error: { code: "unauthorized", message: "The Fal webhook signature is invalid." } });
  const payload = parseObject(body);
  const status = typeof payload.status === "string" ? payload.status : "";
  const requestId = header(request, "x-fal-webhook-request-id") ?? "";
  const providerRequestId = typeof payload.request_id === "string" ? payload.request_id : requestId;
  const outcome = status === "OK" ? "completed" : status === "ERROR" ? "failed" : "ignored";
  const result = applyWebhook(platform.db, {
    provider: "fal",
    deliveryId: requestId,
    providerRequestId,
    body: payload,
    now: deps.now().toISOString(),
    outcome,
    result: payload.payload ?? null,
    error: outcome === "failed" ? { code: "provider_failed", message: typeof payload.error === "string" ? payload.error : "Fal reported an error.", retryable: true } : null,
  });
  send(response, 200, result);
}

async function assemblyWebhook(platform: Platform, request: IncomingMessage, response: ServerResponse, deps: { now: () => Date }) {
  const name = platform.config.assemblyAiWebhookHeaderName;
  const expected = platform.config.assemblyAiWebhookHeaderValue;
  if (!name || !expected) return send(response, 401, { error: { code: "unauthorized", message: "AssemblyAI webhook authentication is not configured." } });
  const actual = header(request, name);
  if (!verifySharedSecret(actual, expected)) return send(response, 401, { error: { code: "unauthorized", message: "The AssemblyAI webhook header is invalid." } });
  const payload = parseObject(await readBody(request));
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) return send(response, 400, { error: { code: "validation", message: "The transcript id is missing." } });
  const status = payload.status === "completed" ? "completed" : payload.status === "error" ? "failed" : "ignored";
  const result = applyWebhook(platform.db, {
    provider: "assemblyai",
    deliveryId: id,
    providerRequestId: id,
    body: payload,
    now: deps.now().toISOString(),
    outcome: status,
    result: payload,
    error: status === "failed" ? { code: "transcription_failed", message: "AssemblyAI reported an error.", retryable: true } : null,
  });
  send(response, 200, result);
}

async function workerWebhook(platform: Platform, request: IncomingMessage, response: ServerResponse, deps: { now: () => Date }) {
  const body = await readBody(request);
  const valid = verifyMediaWorkerSignature({
    secret: platform.config.mediaWorkerSecret,
    timestamp: header(request, "x-media-worker-timestamp"),
    signatureHex: header(request, "x-media-worker-signature"),
    body,
    nowSeconds: Math.floor(deps.now().getTime() / 1000),
  });
  if (!valid) return send(response, 401, { error: { code: "unauthorized", message: "The media worker signature is invalid." } });
  const payload = parseObject(body);
  const jobId = typeof payload.jobId === "string" ? payload.jobId : null;
  const deliveryId = header(request, "x-media-worker-delivery-id") ?? (typeof payload.deliveryId === "string" ? payload.deliveryId : "");
  if (!deliveryId) return send(response, 400, { error: { code: "validation", message: "The delivery id is missing." } });
  const outcome = payload.status === "completed" ? "completed" : payload.status === "failed" ? "failed" : payload.status === "processing" ? "processing" : "ignored";
  const result = applyWebhook(platform.db, {
    provider: "media-worker",
    deliveryId,
    jobId,
    body: payload,
    now: deps.now().toISOString(),
    outcome,
    result: payload.result ?? null,
    progress: typeof payload.progress === "number" ? payload.progress : undefined,
    error: outcome === "failed" ? { code: "worker_failed", message: "The media worker reported a failure.", retryable: true } : null,
  });
  send(response, 200, result);
}

function webhookUrls(platform: Platform): { fal: string | null; assemblyai: string | null; mediaWorker: string | null } {
  const base = platform.config.webhookBaseUrl;
  if (!base) return { fal: null, assemblyai: null, mediaWorker: null };
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    fal: new URL("webhooks/fal", root).toString(),
    assemblyai: new URL("webhooks/assemblyai", root).toString(),
    mediaWorker: new URL("webhooks/media-worker", root).toString(),
  };
}

function header(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request);
  if (body.length === 0) return {};
  return JSON.parse(body.toString("utf8"));
}

function readBody(request: IncomingMessage, limit = 1_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { code: "body_too_large" }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseObject(body: Buffer): Record<string, unknown> {
  try {
    const value = JSON.parse(body.toString("utf8")) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function send(response: ServerResponse, status: number, body: unknown) {
  if (response.writableEnded) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}
