export type FalModelRecord = {
  endpointId: string;
  family: string;
  kind: "image" | "video";
  modes: string[];
  source: string;
  priceUsd: null;
  priceVerified: false;
  note: string;
};

/** Endpoint ids copied from fal docs on November 25, 2026. Prices are intentionally unset. Runway had no endpoint id on the pages checked, so it is omitted. */
export const FAL_MODELS: FalModelRecord[] = [
  {
    endpointId: "fal-ai/veo3.1",
    family: "Google Veo",
    kind: "video",
    modes: ["text-to-video"],
    source: "https://fal.ai/docs/model-api-reference/video-generation-api/veo3.1",
    priceUsd: null,
    priceVerified: false,
    note: "Docs list a text prompt and aspect ratio. A silent-audio parameter was not copied because it was not on that page.",
  },
  {
    endpointId: "fal-ai/kling-video/v3/pro/text-to-video",
    family: "Kling",
    kind: "video",
    modes: ["text-to-video"],
    source: "https://fal.ai/docs/model-api-reference/video-generation-api/kling-video-v3-pro",
    priceUsd: null,
    priceVerified: false,
    note: "Text-to-video endpoint id from the Kling Video V3 Pro page.",
  },
  {
    endpointId: "fal-ai/kling-video/v3/pro/image-to-video",
    family: "Kling",
    kind: "video",
    modes: ["image-to-video"],
    source: "https://fal.ai/docs/model-api-reference/video-generation-api/kling-video-v3-pro",
    priceUsd: null,
    priceVerified: false,
    note: "Image-to-video endpoint id from the same page.",
  },
  {
    endpointId: "fal-ai/ltx-2.3/audio-to-video",
    family: "LTX",
    kind: "video",
    modes: ["audio-to-video"],
    source: "https://fal.ai/docs/documentation/model-apis/models",
    priceUsd: null,
    priceVerified: false,
    note: "Listed for video synchronized to an audio clip. Not registered as text-to-video.",
  },
  {
    endpointId: "alibaba/wan-3.0-prime/reference-to-video",
    family: "Wan",
    kind: "video",
    modes: ["reference-to-video"],
    source: "https://fal.ai/docs/documentation/model-apis/models",
    priceUsd: null,
    priceVerified: false,
    note: "Reference-to-video only. A plain text-to-video Wan id was not on that table.",
  },
  {
    endpointId: "bytedance/seedance-2.5/text-to-video",
    family: "Seedance",
    kind: "video",
    modes: ["text-to-video"],
    source: "https://fal.ai/docs/documentation/model-apis/models",
    priceUsd: null,
    priceVerified: false,
    note: "Text-to-video endpoint id from the available-models table.",
  },
  {
    endpointId: "fal-ai/flux/schnell",
    family: "FLUX",
    kind: "image",
    modes: ["text-to-image"],
    source: "https://fal.ai/docs/documentation/model-apis/models",
    priceUsd: null,
    priceVerified: false,
    note: "Described as the fast draft image model. The OpenAPI example price was not stored.",
  },
  {
    endpointId: "fal-ai/flux-pro/v1.1",
    family: "FLUX",
    kind: "image",
    modes: ["text-to-image"],
    source: "https://fal.ai/docs/model-api-reference/image-generation-api/flux-pro-v1.1",
    priceUsd: null,
    priceVerified: false,
    note: "FLUX1.1 pro text-to-image endpoint id. Price unset.",
  },
];

export type GenerationMode = "budget" | "balanced" | "premium";

export function selectFalModel(input: { mode: GenerationMode; kind: "image" | "video"; imageToVideo: boolean; hasMusic: boolean }): FalModelRecord | null {
  if (input.kind === "image") {
    return FAL_MODELS.find((model) => model.endpointId === (input.mode === "premium" ? "fal-ai/flux-pro/v1.1" : "fal-ai/flux/schnell")) ?? null;
  }
  if (input.hasMusic) return null;
  if (input.imageToVideo) return FAL_MODELS.find((model) => model.endpointId === "fal-ai/kling-video/v3/pro/image-to-video") ?? null;
  if (input.mode === "budget") return null;
  if (input.mode === "premium") return FAL_MODELS.find((model) => model.endpointId === "fal-ai/veo3.1") ?? null;
  return FAL_MODELS.find((model) => model.endpointId === "bytedance/seedance-2.5/text-to-video") ?? null;
}

export type ProductionRoute = "fast" | "advanced" | "maximum";

export function routeModels(route: ProductionRoute, config: { creative: string | null; execution: string | null; review: string | null }): { plan: string | null; execute: string | null; review: string | null } {
  if (route === "fast") return { plan: null, execute: config.execution, review: null };
  if (route === "advanced") return { plan: config.review, execute: config.execution, review: config.review };
  return { plan: config.creative, execute: config.execution, review: config.review };
}
