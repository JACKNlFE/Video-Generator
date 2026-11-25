import type { Capability, HealthReport, Provider, ProviderKind } from "./types";

export function mockProvider(input: {
  id: string;
  kinds: ProviderKind[];
  displayName: string;
  modelId?: string | null;
}): Provider {
  const modelId = input.modelId ?? null;
  return {
    id: input.id,
    kinds: input.kinds,
    displayName: input.displayName,
    configured: true,
    capabilities(): Capability[] {
      return input.kinds.map((kind) => ({
        id: `${input.id}.${kind}`,
        kind,
        providerId: input.id,
        label: input.displayName,
        modelId,
        modes: [],
        wordTimestamps: null,
        pricingVerified: false,
        notes: ["Mock provider. It does not call a live API."],
      }));
    },
    async health(): Promise<HealthReport[]> {
      return input.kinds.map((kind) => ({
        kind,
        providerId: input.id,
        status: "connected and verified",
        detail: "Mock provider. No live call was made.",
        unavailableModels: [],
      }));
    },
  };
}

export function mockProviders(): Provider[] {
  return [
    mockProvider({ id: "mock-llm", kinds: ["llm"], displayName: "Mock language model", modelId: "mock-llm" }),
    mockProvider({ id: "mock-video", kinds: ["video"], displayName: "Mock video", modelId: null }),
    mockProvider({ id: "mock-image", kinds: ["image"], displayName: "Mock image", modelId: null }),
    mockProvider({ id: "mock-transcription", kinds: ["transcription"], displayName: "Mock transcription", modelId: "mock-stt" }),
    mockProvider({ id: "mock-separation", kinds: ["vocal-separation"], displayName: "Mock vocal separation" }),
    mockProvider({ id: "mock-alignment", kinds: ["forced-alignment"], displayName: "Mock alignment" }),
    mockProvider({ id: "mock-storage", kinds: ["storage"], displayName: "Mock storage" }),
    mockProvider({ id: "mock-jobs", kinds: ["jobs"], displayName: "Mock jobs" }),
    mockProvider({ id: "mock-rendering", kinds: ["rendering"], displayName: "Mock rendering" }),
  ];
}
