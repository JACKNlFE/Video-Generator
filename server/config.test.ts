import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig, missingR2Names, r2Endpoint } from "./config";
import { ANTHROPIC_DEFAULTS, ASSEMBLYAI_DEFAULTS, OPENAI_TRANSCRIPTION_DEFAULT } from "./providers/documented";

describe("server config", () => {
  it("loads when every optional key is absent", () => {
    const config = loadConfig({});
    expect(config.anthropicApiKey).toBeNull();
    expect(config.falKey).toBeNull();
    expect(config.assemblyAiApiKey).toBeNull();
    expect(config.openAiApiKey).toBeNull();
    expect(config.databaseUrl).toBeNull();
    expect(config.triggerSecretKey).toBeNull();
    expect(config.mediaWorkerUrl).toBeNull();
    expect(config.budgets.dailyMicros).toBeNull();
    expect(config.providerHealthVerify).toBe(false);
    expect(config.llm.creative).toEqual([ANTHROPIC_DEFAULTS.creative]);
    expect(config.llm.execution).toEqual([ANTHROPIC_DEFAULTS.execution]);
    expect(config.llm.review).toEqual([ANTHROPIC_DEFAULTS.review]);
    expect(config.assemblyAiModels).toEqual([ASSEMBLYAI_DEFAULTS.primary, ASSEMBLYAI_DEFAULTS.fallback]);
    expect(config.openAiTranscriptionModels).toEqual([OPENAI_TRANSCRIPTION_DEFAULT]);
    expect(config.falVideoModel).toBeNull();
    expect(config.falImageModel).toBeNull();
  });

  it("lets a blank model variable clear a documented default", () => {
    const config = loadConfig({ ANTHROPIC_CREATIVE_MODEL: "  ", ANTHROPIC_CREATIVE_FALLBACKS: "" });
    expect(config.llm.creative).toEqual([]);
  });

  it("rejects a malformed budget without starting from a guessed number", () => {
    expect(() => loadConfig({ MAX_DAILY_SPEND_USD: "1.2.3" })).toThrow(/MAX_DAILY_SPEND_USD/);
    expect(() => loadConfig({ TRANSCRIPTION_PROVIDER: "whisper" })).toThrow(/TRANSCRIPTION_PROVIDER/);
    expect(() => loadConfig({ R2_JURISDICTION: "ap" })).toThrow(/R2_JURISDICTION/);
  });

  it("builds the documented R2 endpoints", () => {
    const base = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET_NAME: "media" };
    expect(r2Endpoint(loadConfig(base))).toBe("https://acct.r2.cloudflarestorage.com");
    expect(r2Endpoint(loadConfig({ ...base, R2_JURISDICTION: "eu" }))).toBe("https://acct.eu.r2.cloudflarestorage.com");
    expect(r2Endpoint(loadConfig({ ...base, R2_JURISDICTION: "fedramp" }))).toBe("https://acct.fedramp.r2.cloudflarestorage.com");
    expect(missingR2Names(loadConfig({ R2_BUCKET_NAME: "media" }))).toEqual(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);
  });

  it("names every configured variable in .env.example", () => {
    const source = readFileSync(new URL("./config.ts", import.meta.url), "utf8");
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const names = new Set<string>();
    for (const match of source.matchAll(/(?:optional|usd|flag)\(env, "([A-Z0-9_]+)"\)/g)) names.add(match[1] ?? "");
    for (const match of source.matchAll(/chain\(env, "([A-Z0-9_]+)", "([A-Z0-9_]+)"/g)) {
      names.add(match[1] ?? "");
      names.add(match[2] ?? "");
    }
    expect(names.size).toBeGreaterThan(20);
    for (const name of names) expect(example).toContain(name);
    expect(example).not.toMatch(/sk-ant-|sk-proj-|tr_prod_sk_/);
  });
});
