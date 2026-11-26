export const HEALTH_STATUSES = [
  "not configured",
  "configured but unverified",
  "connected and verified",
  "connection failed",
  "insufficient permissions",
  "unavailable model or capability",
] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const PROVIDER_KINDS = [
  "llm",
  "video",
  "image",
  "transcription",
  "vocal-separation",
  "forced-alignment",
  "storage",
  "jobs",
  "rendering",
  "database",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type Capability = {
  id: string;
  kind: ProviderKind;
  providerId: string;
  label: string;
  modelId: string | null;
  modes: string[];
  wordTimestamps: boolean | null;
  pricingVerified: boolean;
  notes: string[];
};

export type HealthReport = {
  kind: ProviderKind;
  providerId: string;
  status: HealthStatus;
  detail: string;
  unavailableModels: string[];
};

export type ProbeOutcome =
  | { ok: true; modelIds: string[] | null }
  | { ok: false; httpStatus: number | null; modelMissing: boolean };

export type Provider = {
  id: string;
  kinds: readonly ProviderKind[];
  displayName: string;
  configured: boolean;
  capabilities(): Capability[];
  health(options: { verify: boolean }): Promise<HealthReport[]>;
};

export type Selection =
  | {
      ok: true;
      kind: ProviderKind;
      providerId: string;
      role: string;
      modelId: string | null;
      usedFallback: boolean;
      callable: boolean;
      availability: "unverified" | "verified";
    }
  | { ok: false; code: "not_configured" | "unavailable_model" | "no_model"; message: string };
