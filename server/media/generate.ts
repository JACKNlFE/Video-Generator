import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "../config";

export type GenerationRequest = {
  endpointId: string;
  prompt: string;
  projectId: string;
  estimateMicros: number | null;
};

export type GenerationSubmit = {
  requestId: string;
  liveVerified: boolean;
};

export async function submitFalGeneration(config: AppConfig, request: GenerationRequest, submit?: (endpointId: string, input: { prompt: string }) => Promise<{ request_id: string }>): Promise<{ ok: true; submission: GenerationSubmit } | { ok: false; code: "not_configured" | "price_unverified"; message: string }> {
  if (request.estimateMicros == null) {
    return { ok: false, code: "price_unverified", message: "Fal prices are unset. Pass an explicit estimate before a generation is reserved." };
  }
  if (!config.falKey) {
    return { ok: false, code: "not_configured", message: "FAL_KEY is not set. No generation was submitted." };
  }
  const send = submit ?? defaultSubmit(config.falKey);
  const submitted = await send(request.endpointId, { prompt: request.prompt });
  return { ok: true, submission: { requestId: submitted.request_id, liveVerified: submit == null } };
}

function defaultSubmit(apiKey: string) {
  return async (endpointId: string, input: { prompt: string }) => {
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: apiKey });
    const submitted = await fal.queue.submit(endpointId, { input });
    return { request_id: submitted.request_id };
  };
}

export function saveGeneratedFile(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
