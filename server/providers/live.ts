import type { AppConfig } from "../config";
import { r2Endpoint } from "../config";
import { httpStatusOf, redact } from "./classify";
import type { ProbeOutcome } from "./types";

export async function probeAnthropic(config: AppConfig): Promise<ProbeOutcome> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: config.anthropicApiKey ?? "",
    maxRetries: 0,
    timeout: 10_000,
    defaultHeaders: config.anthropicWorkspaceId ? { "anthropic-workspace-id": config.anthropicWorkspaceId } : undefined,
  });
  try {
    const ids: string[] = [];
    for await (const model of client.models.list({ limit: 1000 })) ids.push(model.id);
    return { ok: true, modelIds: ids };
  } catch (error) {
    return { ok: false, httpStatus: httpStatusOf(error), modelMissing: httpStatusOf(error) === 404 };
  }
}

export async function probeOpenAi(config: AppConfig, modelIds: string[]): Promise<ProbeOutcome> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: config.openAiApiKey ?? "", maxRetries: 0, timeout: 10_000 });
  try {
    if (modelIds.length === 0) {
      await client.models.list();
      return { ok: true, modelIds: null };
    }
    const found: string[] = [];
    for (const id of modelIds) {
      try {
        await client.models.retrieve(id);
        found.push(id);
      } catch (error) {
        if (httpStatusOf(error) !== 404) throw error;
      }
    }
    return { ok: true, modelIds: found };
  } catch (error) {
    return { ok: false, httpStatus: httpStatusOf(error), modelMissing: httpStatusOf(error) === 404 };
  }
}

export async function probeAssemblyAi(config: AppConfig): Promise<ProbeOutcome> {
  const { AssemblyAI } = await import("assemblyai");
  const client = new AssemblyAI({
    apiKey: config.assemblyAiApiKey ?? "",
    ...(config.assemblyAiBaseUrl ? { baseUrl: config.assemblyAiBaseUrl } : {}),
  });
  try {
    await client.transcripts.list({ limit: 1 });
    return { ok: true, modelIds: null };
  } catch (error) {
    return { ok: false, httpStatus: httpStatusOf(error), modelMissing: false };
  }
}

export async function probeFal(config: AppConfig, fetchImpl: typeof fetch = fetch): Promise<ProbeOutcome> {
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: config.falKey ?? "" });
  const endpointIds = [config.falImageModel, config.falVideoModel].filter((id): id is string => Boolean(id));
  const url = new URL("https://api.fal.ai/v1/models/pricing");
  if (endpointIds.length > 0) url.searchParams.set("endpoint_id", endpointIds.join(","));
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Authorization: `Key ${config.falKey ?? ""}` }, redirect: "manual" });
  } catch {
    return { ok: false, httpStatus: null, modelMissing: false };
  }
  if (response.status >= 300 && response.status < 400) return { ok: false, httpStatus: response.status, modelMissing: false };
  if (response.status === 401) return { ok: false, httpStatus: 401, modelMissing: false };
  if (response.status === 403) return { ok: false, httpStatus: 403, modelMissing: false };
  if (response.status === 404) return { ok: false, httpStatus: 404, modelMissing: true };
  if (response.status === 400 && endpointIds.length === 0) {
    const body = (await response.json().catch(() => null)) as { error?: { type?: string } } | null;
    if (body?.error?.type === "validation_error") return { ok: true, modelIds: null };
    return { ok: false, httpStatus: 400, modelMissing: false };
  }
  if (response.status !== 200) return { ok: false, httpStatus: response.status, modelMissing: false };
  const body = (await response.json().catch(() => null)) as { prices?: Array<{ endpoint_id?: string }> } | null;
  const modelIds = (body?.prices ?? []).map((price) => price.endpoint_id).filter((id): id is string => Boolean(id));
  return { ok: true, modelIds: endpointIds.length > 0 ? modelIds : null };
}

export async function probeR2(config: AppConfig): Promise<ProbeOutcome> {
  const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
  const endpoint = r2Endpoint(config);
  const client = new S3Client({
    region: "auto",
    endpoint: endpoint ?? undefined,
    credentials: {
      accessKeyId: config.r2.accessKeyId ?? "",
      secretAccessKey: config.r2.secretAccessKey ?? "",
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.r2.bucket ?? "" }));
    return { ok: true, modelIds: null };
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
    if (name === "NotFound" || name === "NoSuchBucket") return { ok: false, httpStatus: 404, modelMissing: true };
    if (name === "AccessDenied") return { ok: false, httpStatus: 403, modelMissing: false };
    if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch") return { ok: false, httpStatus: 401, modelMissing: false };
    const status = httpStatusOf(error);
    return { ok: false, httpStatus: status === 403 ? 403 : status, modelMissing: status === 404 };
  } finally {
    client.destroy();
  }
}

export async function probeNeon(config: AppConfig): Promise<ProbeOutcome> {
  const { neon } = await import("@neondatabase/serverless");
  try {
    const sql = neon(config.databaseUrl ?? "");
    await sql`SELECT 1 AS ok`;
    return { ok: true, modelIds: null };
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "", [config.databaseUrl]);
    if (/permission denied/i.test(message)) return { ok: false, httpStatus: 403, modelMissing: false };
    return { ok: false, httpStatus: null, modelMissing: false };
  }
}

export async function probeTrigger(config: AppConfig, fetchImpl: typeof fetch = fetch): Promise<ProbeOutcome> {
  const root = config.triggerApiUrl.replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${root}/api/v1/runs?page[size]=10`, {
      headers: { Authorization: `Bearer ${config.triggerSecretKey ?? ""}` },
      redirect: "manual",
    });
    if (response.status === 200) return { ok: true, modelIds: null };
    if (response.status === 403) return { ok: false, httpStatus: 403, modelMissing: false };
    return { ok: false, httpStatus: response.status, modelMissing: false };
  } catch {
    return { ok: false, httpStatus: null, modelMissing: false };
  }
}

export async function probeMediaWorker(config: AppConfig, fetchImpl: typeof fetch = fetch): Promise<ProbeOutcome> {
  const root = config.mediaWorkerUrl?.endsWith("/") ? config.mediaWorkerUrl : `${config.mediaWorkerUrl ?? ""}/`;
  try {
    const response = await fetchImpl(new URL("health", root), { redirect: "manual" });
    if (response.status === 200) return { ok: true, modelIds: null };
    if (response.status === 403) return { ok: false, httpStatus: 403, modelMissing: false };
    if (response.status === 404) return { ok: false, httpStatus: 404, modelMissing: true };
    return { ok: false, httpStatus: response.status, modelMissing: false };
  } catch {
    return { ok: false, httpStatus: null, modelMissing: false };
  }
}
