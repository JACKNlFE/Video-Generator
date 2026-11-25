export const DOCS_CHECKED_ON = "2026-11-25";

export const ANTHROPIC_MODELS_SOURCE = "https://platform.claude.com/docs/en/models/overview";

export const ANTHROPIC_DEFAULTS = {
  creative: "claude-fable-5-2",
  execution: "claude-sonnet-5-5",
  review: "claude-opus-5-5",
} as const;

export const ASSEMBLYAI_MODELS_SOURCE = "https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model";

export const ASSEMBLYAI_DEFAULTS = {
  primary: "assemblyai-stt-3-7",
  fallback: "universal-2",
} as const;

export const OPENAI_TRANSCRIPTION_SOURCE = "https://developers.openai.com/api/docs/guides/transcription";

export const OPENAI_TRANSCRIPTION_DEFAULT = "gpt-transcribe";

export type PriceEntry = {
  id: string;
  providerId: string;
  modelId: string | null;
  operation: string;
  unit: string;
  per: number;
  amountMicros: number | null;
  verified: boolean;
  source: string | null;
  checkedOn: string | null;
  note: string;
};

const MILLION = 1_000_000;

function anthropic(modelId: string, operation: string, usd: number, note: string): PriceEntry {
  return {
    id: `anthropic.${modelId}.${operation}`,
    providerId: "anthropic",
    modelId,
    operation,
    unit: "tokens",
    per: MILLION,
    amountMicros: Math.round(usd * MILLION),
    verified: true,
    source: ANTHROPIC_MODELS_SOURCE,
    checkedOn: DOCS_CHECKED_ON,
    note,
  };
}

const baseNote = "Base token price from the Claude models overview table. This is not a cache or batch rate.";
const batchNote = "Derived as 50% of the base token price. The models overview says Batch API requests are 50% off.";
const cacheNote = "Derived from the models overview footnote for prompt-cache reads. Cache writes are not listed because that page points elsewhere for them.";

export const VERIFIED_PRICES: PriceEntry[] = [
  anthropic("claude-fable-5-2", "input_tokens", 8, baseNote),
  anthropic("claude-fable-5-2", "output_tokens", 40, baseNote),
  anthropic("claude-fable-5-2", "batch_input_tokens", 4, batchNote),
  anthropic("claude-fable-5-2", "batch_output_tokens", 20, batchNote),
  anthropic("claude-fable-5-2", "cache_read_tokens", 0.2, `${cacheNote} Fable 5.2 cache reads are 2.5% of the $8 base input price.`),
  anthropic("claude-opus-5-5", "input_tokens", 4, baseNote),
  anthropic("claude-opus-5-5", "output_tokens", 20, baseNote),
  anthropic("claude-opus-5-5", "batch_input_tokens", 2, batchNote),
  anthropic("claude-opus-5-5", "batch_output_tokens", 10, batchNote),
  anthropic("claude-opus-5-5", "cache_read_tokens", 0.2, `${cacheNote} Opus 5.5 cache reads are 5% of the $4 base input price.`),
  anthropic("claude-sonnet-5-5", "input_tokens", 2, baseNote),
  anthropic("claude-sonnet-5-5", "output_tokens", 10, baseNote),
  anthropic("claude-sonnet-5-5", "batch_input_tokens", 1, batchNote),
  anthropic("claude-sonnet-5-5", "batch_output_tokens", 5, batchNote),
  anthropic("claude-sonnet-5-5", "cache_read_tokens", 0.1, `${cacheNote} Sonnet 5.5 cache reads are 5% of the $2 base input price.`),
];

export function findPrice(providerId: string, modelId: string | null, operation: string): PriceEntry {
  const found = VERIFIED_PRICES.find((entry) => entry.providerId === providerId && entry.modelId === modelId && entry.operation === operation);
  if (found) return found;
  return {
    id: `${providerId}.${modelId ?? "unset"}.${operation}`,
    providerId,
    modelId,
    operation,
    unit: "",
    per: 1,
    amountMicros: null,
    verified: false,
    source: null,
    checkedOn: null,
    note: "No verified price is stored for this operation.",
  };
}

export function estimateMicros(providerId: string, modelId: string | null, operation: string, quantity: number): number | null {
  const price = findPrice(providerId, modelId, operation);
  if (!price.verified || price.amountMicros == null || !Number.isFinite(quantity) || quantity < 0) return null;
  return Math.ceil((quantity * price.amountMicros) / price.per);
}
