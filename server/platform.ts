import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "./config";
import { missingR2Names, r2Ready } from "./config";
import { findPrice } from "./providers/documented";
import { classifyProbe, reportFor } from "./providers/classify";
import {
  probeAnthropic,
  probeAssemblyAi,
  probeFal,
  probeMediaWorker,
  probeNeon,
  probeOpenAi,
  probeR2,
  probeTrigger,
} from "./providers/live";
import type { Capability, HealthReport, ProbeOutcome, Provider, ProviderKind, Selection } from "./providers/types";
import type { PersistDatabase } from "./persist.d.mts";
import { ping } from "./persist.mjs";

export type Probes = {
  anthropic?: () => Promise<ProbeOutcome>;
  openai?: (modelIds: string[]) => Promise<ProbeOutcome>;
  assemblyai?: () => Promise<ProbeOutcome>;
  fal?: () => Promise<ProbeOutcome>;
  r2?: () => Promise<ProbeOutcome>;
  neon?: () => Promise<ProbeOutcome>;
  trigger?: () => Promise<ProbeOutcome>;
  mediaWorker?: () => Promise<ProbeOutcome>;
};

export type Platform = {
  config: AppConfig;
  db: PersistDatabase;
  providers: Provider[];
  health(verify: boolean): Promise<HealthReport[]>;
  select(kind: ProviderKind, role?: string): Selection;
};

export function createPlatform(config: AppConfig, db: PersistDatabase, probes: Probes = {}): Platform {
  const providers = buildProviders(config, db, probes);
  let reports: HealthReport[] = [];
  const platform: Platform = {
    config,
    db,
    providers,
    async health(verify) {
      const next: HealthReport[] = [];
      for (const provider of providers) {
        try {
          next.push(...(await provider.health({ verify })));
        } catch {
          next.push(
            ...provider.kinds.map((kind) =>
              reportFor(kind, provider.id, { status: "connection failed", detail: "The health check threw before it could finish.", unavailableModels: [] }),
            ),
          );
        }
      }
      reports = next;
      return reports;
    },
    select(kind, role = "default") {
      return selectProvider(config, providers, reports, kind, role);
    },
  };
  return platform;
}

function buildProviders(config: AppConfig, db: PersistDatabase, probes: Probes): Provider[] {
  return [
    anthropicProvider(config, probes),
    falProvider(config, probes),
    assemblyProvider(config, probes),
    openaiProvider(config, probes),
    separationProvider(config, probes),
    alignmentProvider(config, probes),
    localStorageProvider(config),
    r2Provider(config, probes),
    sqliteJobsProvider(db),
    triggerJobsProvider(config, probes),
    renderProvider(config, probes),
    sqliteDatabaseProvider(db),
    neonProvider(config, probes),
  ];
}

function anthropicProvider(config: AppConfig, probes: Probes): Provider {
  const required = [...new Set([...config.llm.creative, ...config.llm.execution, ...config.llm.review])];
  return remoteProvider({
    id: "anthropic",
    kinds: ["llm"],
    displayName: "Anthropic",
    configured: Boolean(config.anthropicApiKey),
    requiredModelIds: required,
    probe: probes.anthropic ?? (() => probeAnthropic(config)),
    capabilities: [
      roleCapability("llm", "anthropic", "anthropic.creative", "Creative director", config.llm.creative[0] ?? null, ["text", "image-input", "tools"]),
      roleCapability("llm", "anthropic", "anthropic.execution", "Editing execution", config.llm.execution[0] ?? null, ["text", "image-input", "tools"]),
      roleCapability("llm", "anthropic", "anthropic.review", "Review", config.llm.review[0] ?? null, ["text", "image-input", "tools"]),
    ],
  });
}

function falProvider(config: AppConfig, probes: Probes): Provider {
  const required = [config.falImageModel, config.falVideoModel].filter((id): id is string => Boolean(id));
  return remoteProvider({
    id: "fal",
    kinds: ["image", "video"],
    displayName: "Fal",
    configured: Boolean(config.falKey),
    requiredModelIds: required,
    probe: probes.fal ?? (() => probeFal(config)),
    capabilities: [
      roleCapability("image", "fal", "fal.image", "Image generation", config.falImageModel, ["text-to-image"]),
      roleCapability("video", "fal", "fal.video", "Video generation", config.falVideoModel, ["text-to-video", "image-to-video"]),
    ],
    connectedDetail: required.length === 0 ? "Fal accepted the API key. No image or video endpoint id is selected, so no price was stored." : undefined,
  });
}

function assemblyProvider(config: AppConfig, probes: Probes): Provider {
  return remoteProvider({
    id: "assemblyai",
    kinds: ["transcription"],
    displayName: "AssemblyAI",
    configured: Boolean(config.assemblyAiApiKey),
    requiredModelIds: config.assemblyAiModels,
    probe: probes.assemblyai ?? (() => probeAssemblyAi(config)),
    capabilities: [
      {
        ...roleCapability("transcription", "assemblyai", "assemblyai.speech", "Speech transcription", config.assemblyAiModels[0] ?? null, ["prerecorded"]),
        wordTimestamps: true,
        notes: [
          "Pre-recorded transcript words include start and end in milliseconds.",
          "Listing transcripts checks the key. It does not submit audio, so the speech model is not checked against the account.",
        ],
      },
    ],
    connectedDetail: "AssemblyAI accepted the key. The speech model was not checked against the account because that would submit a transcription.",
  });
}

function openaiProvider(config: AppConfig, probes: Probes): Provider {
  return remoteProvider({
    id: "openai",
    kinds: ["transcription"],
    displayName: "OpenAI",
    configured: Boolean(config.openAiApiKey),
    requiredModelIds: config.openAiTranscriptionModels,
    probe: probes.openai ?? ((ids) => probeOpenAi(config, ids)),
    capabilities: [
      {
        ...roleCapability("transcription", "openai", "openai.transcription", "File transcription", config.openAiTranscriptionModels[0] ?? null, ["file"]),
        wordTimestamps: null,
        notes: [
          "gpt-transcribe is the documented file-transcription model.",
          "Word timestamps and srt/vtt are documented on deprecated whisper-1, which this stage does not select.",
        ],
      },
    ],
  });
}

function separationProvider(config: AppConfig, probes: Probes): Provider {
  return remoteProvider({
    id: "media-worker-separation",
    kinds: ["vocal-separation"],
    displayName: "Media worker vocal separation",
    configured: Boolean(config.mediaWorkerUrl),
    requiredModelIds: [],
    probe: probes.mediaWorker ?? (() => probeMediaWorker(config)),
    capabilities: [roleCapability("vocal-separation", "media-worker-separation", "worker.separation", "Vocal separation", null, ["analysis"])],
  });
}

function alignmentProvider(config: AppConfig, probes: Probes): Provider {
  return remoteProvider({
    id: "media-worker-alignment",
    kinds: ["forced-alignment"],
    displayName: "Media worker forced alignment",
    configured: Boolean(config.mediaWorkerUrl),
    requiredModelIds: [],
    probe: probes.mediaWorker ?? (() => probeMediaWorker(config)),
    capabilities: [roleCapability("forced-alignment", "media-worker-alignment", "worker.alignment", "Forced alignment", null, ["lyrics", "transcript"])],
  });
}

function renderProvider(config: AppConfig, probes: Probes): Provider {
  const remote = Boolean(config.mediaWorkerUrl);
  return {
    id: "renderer",
    kinds: ["rendering"],
    displayName: "Render seam",
    configured: true,
    capabilities: () => [
      roleCapability("rendering", "renderer", "renderer.local", "Queued render", null, ["enqueue"]),
    ],
    async health({ verify }) {
      const local = reportFor("rendering", "renderer", {
        status: "connected and verified",
        detail: "Render jobs are stored in SQLite. This stage does not invoke FFmpeg.",
        unavailableModels: [],
      });
      if (!remote) return [local];
      if (!verify) {
        return [reportFor("rendering", "renderer", { status: "configured but unverified", detail: "A media worker URL is set. No live check was requested. FFmpeg is not invoked here.", unavailableModels: [] })];
      }
      try {
        const outcome = await (probes.mediaWorker ?? (() => probeMediaWorker(config)))();
        const classified = classifyProbe({ configured: true, verify: true, probe: outcome, requiredModelIds: [] });
        return [reportFor("rendering", "renderer", { ...classified, detail: `${classified.detail} FFmpeg is not invoked in this process.` })];
      } catch {
        return [reportFor("rendering", "renderer", { status: "connection failed", detail: "The media worker health check failed. FFmpeg is not invoked in this process.", unavailableModels: [] })];
      }
    },
  };
}

function localStorageProvider(config: AppConfig): Provider {
  return {
    id: "local-disk",
    kinds: ["storage"],
    displayName: "Local disk",
    configured: true,
    capabilities: () => [roleCapability("storage", "local-disk", "storage.local", "Local media directory", null, ["put", "get", "delete"])],
    async health() {
      try {
        mkdirSync(config.mediaRoot, { recursive: true });
        const probe = join(config.mediaRoot, ".write-probe");
        writeFileSync(probe, "ok");
        rmSync(probe);
        return [reportFor("storage", "local-disk", { status: "connected and verified", detail: "The local media directory is writable.", unavailableModels: [] })];
      } catch {
        return [reportFor("storage", "local-disk", { status: "connection failed", detail: "The local media directory is not writable.", unavailableModels: [] })];
      }
    },
  };
}

function r2Provider(config: AppConfig, probes: Probes): Provider {
  const missing = missingR2Names(config);
  return remoteProvider({
    id: "r2",
    kinds: ["storage"],
    displayName: "Cloudflare R2",
    configured: r2Ready(config),
    requiredModelIds: [],
    probe: probes.r2 ?? (() => probeR2(config)),
    capabilities: [roleCapability("storage", "r2", "storage.r2", "R2 bucket", config.r2.bucket, ["put", "get", "delete"])],
    missingDetail: missing.length > 0 ? `Missing ${missing.join(", ")}.` : undefined,
  });
}

function sqliteJobsProvider(db: PersistDatabase): Provider {
  return {
    id: "sqlite",
    kinds: ["jobs"],
    displayName: "SQLite job store",
    configured: true,
    capabilities: () => [roleCapability("jobs", "sqlite", "jobs.sqlite", "Local job store", null, ["create", "track", "cancel", "retry"])],
    async health() {
      const ok = ping(db);
      return [
        reportFor("jobs", "sqlite", ok
          ? { status: "connected and verified", detail: "SQLite accepted a read. Trigger.dev is not required.", unavailableModels: [] }
          : { status: "connection failed", detail: "SQLite did not answer.", unavailableModels: [] }),
      ];
    },
  };
}

function triggerJobsProvider(config: AppConfig, probes: Probes): Provider {
  return remoteProvider({
    id: "trigger",
    kinds: ["jobs"],
    displayName: "Trigger.dev",
    configured: Boolean(config.triggerSecretKey),
    requiredModelIds: [],
    probe: probes.trigger ?? (() => probeTrigger(config)),
    capabilities: [roleCapability("jobs", "trigger", "jobs.trigger", "Trigger.dev", null, ["verify"])],
    connectedDetail: "Trigger.dev accepted the key. This stage still stores jobs in SQLite and does not dispatch tasks.",
  });
}

function sqliteDatabaseProvider(db: PersistDatabase): Provider {
  return {
    id: "sqlite-database",
    kinds: ["database"],
    displayName: "SQLite database",
    configured: true,
    capabilities: () => [roleCapability("database", "sqlite-database", "database.sqlite", "Local database", null, ["sql"])],
    async health() {
      return [reportFor("database", "sqlite-database", ping(db)
        ? { status: "connected and verified", detail: "The local database is open. Neon is not required.", unavailableModels: [] }
        : { status: "connection failed", detail: "The local database did not answer.", unavailableModels: [] })];
    },
  };
}

function neonProvider(config: AppConfig, probes: Probes): Provider {
  return remoteProvider({
    id: "neon",
    kinds: ["database"],
    displayName: "Neon",
    configured: Boolean(config.databaseUrl),
    requiredModelIds: [],
    probe: probes.neon ?? (() => probeNeon(config)),
    capabilities: [roleCapability("database", "neon", "database.neon", "Neon Postgres", null, ["sql"])],
    connectedDetail: "Neon accepted SELECT 1. Job rows in this stage stay in SQLite.",
  });
}

function remoteProvider(input: {
  id: string;
  kinds: ProviderKind[];
  displayName: string;
  configured: boolean;
  requiredModelIds: string[];
  probe: ((modelIds: string[]) => Promise<ProbeOutcome>) | (() => Promise<ProbeOutcome>);
  capabilities: Capability[];
  connectedDetail?: string;
  missingDetail?: string;
}): Provider {
  return {
    id: input.id,
    kinds: input.kinds,
    displayName: input.displayName,
    configured: input.configured,
    capabilities: () => input.capabilities,
    async health({ verify }) {
      let classified = classifyProbe({ configured: input.configured, verify, probe: null, requiredModelIds: input.requiredModelIds });
      if (input.configured && verify) {
        try {
          const outcome = await (input.probe as (modelIds: string[]) => Promise<ProbeOutcome>)(input.requiredModelIds);
          classified = classifyProbe({ configured: true, verify: true, probe: outcome, requiredModelIds: input.requiredModelIds });
        } catch {
          classified = { status: "connection failed", detail: "The live check could not be completed.", unavailableModels: [] };
        }
      }
      if (!input.configured && input.missingDetail) classified = { ...classified, detail: input.missingDetail };
      if (classified.status === "connected and verified" && classified.unavailableModels.length === 0 && input.connectedDetail) {
        classified = { ...classified, detail: input.connectedDetail };
      }
      return input.kinds.map((kind) => reportFor(kind, input.id, classified));
    },
  };
}

function roleCapability(kind: ProviderKind, providerId: string, id: string, label: string, modelId: string | null, modes: string[]): Capability {
  const price = modelId ? findPrice(providerId === "fal" ? "fal" : providerId, modelId, "input_tokens") : findPrice(providerId, null, "input_tokens");
  return {
    id,
    kind,
    providerId,
    label,
    modelId,
    modes,
    wordTimestamps: null,
    pricingVerified: price.verified,
    notes: modelId ? [] : ["No model id is selected."],
  };
}

function selectProvider(config: AppConfig, providers: Provider[], reports: HealthReport[], kind: ProviderKind, role: string): Selection {
  if (kind === "llm") return selectLlm(config, reports, role);
  if (kind === "transcription") return selectTranscription(config, reports);
  if (kind === "image" || kind === "video") return selectFal(config, reports, kind);
  if (kind === "storage") return selectStorage(config, reports);
  if (kind === "jobs") return chosen("jobs", "sqlite", role, null, false, true, verified(reports, "sqlite"));
  if (kind === "database") return chosen("database", "sqlite-database", role, null, false, true, verified(reports, "sqlite-database"));
  if (kind === "rendering") return chosen("rendering", "renderer", role, null, false, true, verified(reports, "renderer"));
  if (kind === "vocal-separation" || kind === "forced-alignment") {
    const id = kind === "vocal-separation" ? "media-worker-separation" : "media-worker-alignment";
    if (!config.mediaWorkerUrl) return { ok: false, code: "not_configured", message: "MEDIA_WORKER_URL is not set." };
    return chosen(kind, id, role, null, false, true, verified(reports, id));
  }
  const provider = providers.find((item) => item.kinds.includes(kind) && item.configured);
  if (!provider) return { ok: false, code: "not_configured", message: `No ${kind} provider is configured.` };
  return chosen(kind, provider.id, role, null, false, true, verified(reports, provider.id));
}

function selectLlm(config: AppConfig, reports: HealthReport[], role: string): Selection {
  if (!config.anthropicApiKey) return { ok: false, code: "not_configured", message: "ANTHROPIC_API_KEY is not set." };
  const candidates = role === "creative" ? config.llm.creative : role === "execution" ? config.llm.execution : role === "review" ? config.llm.review : [];
  if (role !== "creative" && role !== "execution" && role !== "review") {
    return { ok: false, code: "no_model", message: "The language-model role must be creative, execution, or review." };
  }
  return walkModels("llm", "anthropic", role, candidates, unavailable(reports, "anthropic"), verified(reports, "anthropic"));
}

function selectTranscription(config: AppConfig, reports: HealthReport[]): Selection {
  const order = config.transcriptionProvider === "openai"
    ? ["openai"]
    : config.transcriptionProvider === "assemblyai"
      ? ["assemblyai"]
      : ["assemblyai", "openai"];
  let sawUnavailable = false;
  for (const id of order) {
    const configured = id === "assemblyai" ? Boolean(config.assemblyAiApiKey) : Boolean(config.openAiApiKey);
    if (!configured) continue;
    const candidates = id === "assemblyai" ? config.assemblyAiModels : config.openAiTranscriptionModels;
    const selection = walkModels("transcription", id, "primary", candidates, unavailable(reports, id), verified(reports, id));
    if (selection.ok) return selection;
    if (selection.code === "unavailable_model") sawUnavailable = true;
  }
  if (sawUnavailable) return { ok: false, code: "unavailable_model", message: "Every configured transcription model is unavailable." };
  return { ok: false, code: "not_configured", message: "No transcription provider is configured." };
}

function selectFal(config: AppConfig, reports: HealthReport[], kind: "image" | "video"): Selection {
  if (!config.falKey) return { ok: false, code: "not_configured", message: "FAL_KEY is not set." };
  const modelId = kind === "image" ? config.falImageModel : config.falVideoModel;
  return walkModels(kind, "fal", "default", modelId ? [modelId] : [], unavailable(reports, "fal"), verified(reports, "fal"));
}

function selectStorage(config: AppConfig, reports: HealthReport[]): Selection {
  if (r2Ready(config)) return chosen("storage", "r2", "default", config.r2.bucket, false, true, verified(reports, "r2"));
  return chosen("storage", "local-disk", "default", null, false, true, verified(reports, "local-disk"));
}

function walkModels(kind: ProviderKind, providerId: string, role: string, candidates: string[], unavailableModels: Set<string>, isVerified: boolean): Selection {
  if (candidates.length === 0) return { ok: false, code: "no_model", message: `No ${kind} model id is configured.` };
  const index = candidates.findIndex((id) => !unavailableModels.has(id));
  if (index === -1) return { ok: false, code: "unavailable_model", message: `Configured models are unavailable: ${candidates.join(", ")}.` };
  return chosen(kind, providerId, role, candidates[index] ?? null, index > 0, true, isVerified);
}

function chosen(kind: ProviderKind, providerId: string, role: string, modelId: string | null, usedFallback: boolean, callable: boolean, isVerified: boolean): Selection {
  return { ok: true, kind, providerId, role, modelId, usedFallback, callable, availability: isVerified ? "verified" : "unverified" };
}

function unavailable(reports: HealthReport[], providerId: string): Set<string> {
  const ids = new Set<string>();
  for (const report of reports) {
    if (report.providerId !== providerId) continue;
    for (const id of report.unavailableModels) ids.add(id);
  }
  return ids;
}

function verified(reports: HealthReport[], providerId: string): boolean {
  return reports.some((report) => report.providerId === providerId && report.status === "connected and verified");
}
