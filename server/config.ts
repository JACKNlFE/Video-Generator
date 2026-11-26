import { usdToMicros } from "./money";
import { ANTHROPIC_DEFAULTS, ASSEMBLYAI_DEFAULTS, OPENAI_TRANSCRIPTION_DEFAULT } from "./providers/documented";

export type TranscriptionChoice = "auto" | "assemblyai" | "openai";
export type R2Jurisdiction = "eu" | "us" | "fedramp";

export type AppConfig = {
  anthropicApiKey: string | null;
  anthropicWorkspaceId: string | null;
  llm: { creative: string[]; execution: string[]; review: string[] };
  falKey: string | null;
  falVideoModel: string | null;
  falImageModel: string | null;
  assemblyAiApiKey: string | null;
  assemblyAiBaseUrl: string | null;
  assemblyAiModels: string[];
  assemblyAiWebhookHeaderName: string | null;
  assemblyAiWebhookHeaderValue: string | null;
  openAiApiKey: string | null;
  openAiTranscriptionModels: string[];
  transcriptionProvider: TranscriptionChoice;
  databaseUrl: string | null;
  databaseUrlUnpooled: string | null;
  r2: {
    accountId: string | null;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    bucket: string | null;
    jurisdiction: R2Jurisdiction | null;
    endpoint: string | null;
  };
  triggerSecretKey: string | null;
  triggerApiUrl: string;
  mediaWorkerUrl: string | null;
  mediaWorkerSecret: string | null;
  webhookBaseUrl: string | null;
  budgets: { projectMicros: number | null; runMicros: number | null; dailyMicros: number | null; monthlyMicros: number | null };
  jobsDbPath: string;
  mediaRoot: string;
  providerHealthVerify: boolean;
  port: number;
  host: string;
  appAuthToken: string | null;
  mediaSigningSecret: string | null;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const transcription = optional(env, "TRANSCRIPTION_PROVIDER") ?? "auto";
  if (transcription !== "auto" && transcription !== "assemblyai" && transcription !== "openai") {
    throw new Error("TRANSCRIPTION_PROVIDER must be auto, assemblyai, or openai.");
  }
  const jurisdiction = optional(env, "R2_JURISDICTION");
  if (jurisdiction && jurisdiction !== "eu" && jurisdiction !== "us" && jurisdiction !== "fedramp") {
    throw new Error("R2_JURISDICTION must be eu, us, or fedramp.");
  }
  return {
    anthropicApiKey: optional(env, "ANTHROPIC_API_KEY"),
    anthropicWorkspaceId: optional(env, "ANTHROPIC_WORKSPACE_ID"),
    llm: {
      creative: chain(env, "ANTHROPIC_CREATIVE_MODEL", "ANTHROPIC_CREATIVE_FALLBACKS", ANTHROPIC_DEFAULTS.creative, []),
      execution: chain(env, "ANTHROPIC_EXECUTION_MODEL", "ANTHROPIC_EXECUTION_FALLBACKS", ANTHROPIC_DEFAULTS.execution, []),
      review: chain(env, "ANTHROPIC_REVIEW_MODEL", "ANTHROPIC_REVIEW_FALLBACKS", ANTHROPIC_DEFAULTS.review, []),
    },
    falKey: optional(env, "FAL_KEY"),
    falVideoModel: optional(env, "FAL_VIDEO_MODEL"),
    falImageModel: optional(env, "FAL_IMAGE_MODEL"),
    assemblyAiApiKey: optional(env, "ASSEMBLYAI_API_KEY"),
    assemblyAiBaseUrl: optional(env, "ASSEMBLYAI_BASE_URL"),
    assemblyAiModels: chain(env, "ASSEMBLYAI_SPEECH_MODEL", "ASSEMBLYAI_SPEECH_MODEL_FALLBACK", ASSEMBLYAI_DEFAULTS.primary, [ASSEMBLYAI_DEFAULTS.fallback]),
    assemblyAiWebhookHeaderName: optional(env, "ASSEMBLYAI_WEBHOOK_HEADER_NAME"),
    assemblyAiWebhookHeaderValue: optional(env, "ASSEMBLYAI_WEBHOOK_HEADER_VALUE"),
    openAiApiKey: optional(env, "OPENAI_API_KEY"),
    openAiTranscriptionModels: chain(env, "OPENAI_TRANSCRIPTION_MODEL", "OPENAI_TRANSCRIPTION_FALLBACKS", OPENAI_TRANSCRIPTION_DEFAULT, []),
    transcriptionProvider: transcription,
    databaseUrl: optional(env, "DATABASE_URL"),
    databaseUrlUnpooled: optional(env, "DATABASE_URL_UNPOOLED"),
    r2: {
      accountId: optional(env, "R2_ACCOUNT_ID"),
      accessKeyId: optional(env, "R2_ACCESS_KEY_ID"),
      secretAccessKey: optional(env, "R2_SECRET_ACCESS_KEY"),
      bucket: optional(env, "R2_BUCKET_NAME"),
      jurisdiction: (jurisdiction as R2Jurisdiction | null) ?? null,
      endpoint: optional(env, "R2_ENDPOINT"),
    },
    triggerSecretKey: optional(env, "TRIGGER_SECRET_KEY"),
    triggerApiUrl: optional(env, "TRIGGER_API_URL") ?? "https://api.trigger.dev",
    mediaWorkerUrl: optional(env, "MEDIA_WORKER_URL"),
    mediaWorkerSecret: optional(env, "MEDIA_WORKER_SECRET"),
    webhookBaseUrl: optional(env, "WEBHOOK_BASE_URL"),
    budgets: {
      projectMicros: usd(env, "DEFAULT_PROJECT_BUDGET_USD"),
      runMicros: usd(env, "MAX_RUN_SPEND_USD"),
      dailyMicros: usd(env, "MAX_DAILY_SPEND_USD"),
      monthlyMicros: usd(env, "MAX_MONTHLY_SPEND_USD"),
    },
    jobsDbPath: optional(env, "JOBS_DB_PATH") ?? "data/platform.sqlite",
    mediaRoot: optional(env, "MEDIA_ROOT") ?? "data/media",
    providerHealthVerify: flag(env, "PROVIDER_HEALTH_VERIFY"),
    port: port(env),
    host: optional(env, "HOST") ?? "127.0.0.1",
    appAuthToken: optional(env, "APP_AUTH_TOKEN"),
    mediaSigningSecret: optional(env, "MEDIA_SIGNING_SECRET"),
  };
}

export function r2Ready(config: AppConfig): boolean {
  return Boolean(config.r2.accountId && config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.bucket);
}

export function r2Endpoint(config: AppConfig): string | null {
  if (config.r2.endpoint) return config.r2.endpoint;
  if (!config.r2.accountId) return null;
  if (config.r2.jurisdiction === "eu") return `https://${config.r2.accountId}.eu.r2.cloudflarestorage.com`;
  if (config.r2.jurisdiction === "us") return `https://${config.r2.accountId}.us.r2.cloudflarestorage.com`;
  if (config.r2.jurisdiction === "fedramp") return `https://${config.r2.accountId}.fedramp.r2.cloudflarestorage.com`;
  return `https://${config.r2.accountId}.r2.cloudflarestorage.com`;
}

export function missingR2Names(config: AppConfig): string[] {
  const missing: string[] = [];
  if (!config.r2.accountId) missing.push("R2_ACCOUNT_ID");
  if (!config.r2.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!config.r2.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!config.r2.bucket) missing.push("R2_BUCKET_NAME");
  return missing;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name];
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function chain(env: NodeJS.ProcessEnv, primaryName: string, fallbackName: string, documentedPrimary: string | null, documentedFallbacks: string[]): string[] {
  const primary = env[primaryName] === undefined ? documentedPrimary : optional(env, primaryName);
  const fallbacks = env[fallbackName] === undefined ? documentedFallbacks : splitCsv(env[fallbackName] ?? "");
  const values = [primary, ...fallbacks].filter((item): item is string => Boolean(item));
  return [...new Set(values)];
}

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

function usd(env: NodeJS.ProcessEnv, name: string): number | null {
  const value = optional(env, name);
  if (!value) return null;
  try {
    return usdToMicros(value);
  } catch {
    throw new Error(`${name} must be a non-negative USD amount with at most 6 decimal places.`);
  }
}

function flag(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = optional(env, name);
  if (!value) return false;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function port(env: NodeJS.ProcessEnv): number {
  const value = optional(env, "PORT");
  if (!value) return 8787;
  if (!/^\d+$/.test(value)) throw new Error("PORT must be an integer from 0 to 65535.");
  const parsed = Number(value);
  if (parsed > 65535) throw new Error("PORT must be an integer from 0 to 65535.");
  return parsed;
}
