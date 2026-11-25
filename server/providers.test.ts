import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { createPlatform } from "./platform";
import { classifyProbe } from "./providers/classify";
import { ANTHROPIC_DEFAULTS, estimateMicros, findPrice, OPENAI_TRANSCRIPTION_DEFAULT } from "./providers/documented";
import { probeFal } from "./providers/live";
import { mockProviders } from "./providers/mocks";
import { openDatabase } from "./persist.mjs";
import type { PersistDatabase } from "./persist.d.mts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function database(): PersistDatabase {
  const dir = mkdtempSync(join(tmpdir(), "vg-providers-"));
  dirs.push(dir);
  return openDatabase(join(dir, "jobs.sqlite"));
}

describe("health status vocabulary", () => {
  it("uses the six required statuses and no others", () => {
    expect(classifyProbe({ configured: false, verify: true, probe: null, requiredModelIds: [] }).status).toBe("not configured");
    expect(classifyProbe({ configured: true, verify: false, probe: null, requiredModelIds: [] }).status).toBe("configured but unverified");
    expect(classifyProbe({ configured: true, verify: true, probe: { ok: true, modelIds: ["claude-sonnet-5-5"] }, requiredModelIds: ["claude-sonnet-5-5"] }).status).toBe("connected and verified");
    expect(classifyProbe({ configured: true, verify: true, probe: { ok: false, httpStatus: 401, modelMissing: false }, requiredModelIds: [] }).status).toBe("connection failed");
    expect(classifyProbe({ configured: true, verify: true, probe: { ok: false, httpStatus: 403, modelMissing: false }, requiredModelIds: [] }).status).toBe("insufficient permissions");
    expect(classifyProbe({ configured: true, verify: true, probe: { ok: true, modelIds: [] }, requiredModelIds: ["missing-model"] }).status).toBe("unavailable model or capability");
  });
});

describe("provider registry", () => {
  it("starts with optional providers unconfigured and does not call them", async () => {
    const db = database();
    let called = false;
    const platform = createPlatform(loadConfig({ MEDIA_ROOT: join(dirs[0] ?? tmpdir(), "media") }), db, {
      anthropic: async () => {
        called = true;
        return { ok: true, modelIds: [] };
      },
    });
    const reports = await platform.health(false);
    expect(called).toBe(false);
    expect(reports.find((report) => report.providerId === "anthropic")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "fal")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "assemblyai")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "openai")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "r2")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "trigger")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "neon")?.status).toBe("not configured");
    expect(reports.find((report) => report.providerId === "sqlite")?.status).toBe("connected and verified");
    expect(platform.select("llm", "execution")).toMatchObject({ ok: false, code: "not_configured" });
    expect(platform.select("video")).toMatchObject({ ok: false, code: "not_configured" });
    db.close();
  });

  it("keeps a present key unverified until a live check is requested", async () => {
    const db = database();
    const platform = createPlatform(loadConfig({ ANTHROPIC_API_KEY: "test-key", MEDIA_ROOT: join(dirs[0] ?? tmpdir(), "media") }), db, {
      anthropic: async () => {
        throw new Error("live check should not run");
      },
    });
    const reports = await platform.health(false);
    expect(reports.find((report) => report.providerId === "anthropic")?.status).toBe("configured but unverified");
    expect(platform.select("llm", "execution")).toMatchObject({ ok: true, modelId: ANTHROPIC_DEFAULTS.execution, availability: "unverified", usedFallback: false });
    db.close();
  });

  it("falls back when the primary model is unavailable", async () => {
    const db = database();
    const platform = createPlatform(loadConfig({
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_EXECUTION_FALLBACKS: "claude-haiku-5-5",
      MEDIA_ROOT: join(dirs[0] ?? tmpdir(), "media"),
    }), db, {
      anthropic: async () => ({ ok: true, modelIds: ["claude-haiku-5-5"] }),
    });
    const [report] = (await platform.health(true)).filter((item) => item.providerId === "anthropic");
    expect(report?.status).toBe("connected and verified");
    expect(report?.unavailableModels).toContain(ANTHROPIC_DEFAULTS.execution);
    expect(platform.select("llm", "execution")).toMatchObject({ ok: true, modelId: "claude-haiku-5-5", usedFallback: true, availability: "verified" });
    expect(platform.select("llm", "creative")).toMatchObject({ ok: false, code: "unavailable_model" });
    db.close();
  });

  it("maps Fal auth failures and does not invent an endpoint id", async () => {
    const db = database();
    const platform = createPlatform(loadConfig({ FAL_KEY: "test-key", MEDIA_ROOT: join(dirs[0] ?? tmpdir(), "media") }), db, {
      fal: async () => ({ ok: false, httpStatus: 401, modelMissing: false }),
    });
    expect(platform.select("image")).toMatchObject({ ok: false, code: "no_model" });
    const reports = await platform.health(true);
    expect(reports.find((report) => report.kind === "image")?.status).toBe("connection failed");
    expect(reports.find((report) => report.kind === "video")?.status).toBe("connection failed");
    db.close();
  });

  it("treats a Fal validation response as an authenticated key when no model is selected", async () => {
    const db = database();
    const platform = createPlatform(loadConfig({ FAL_KEY: "test-key", MEDIA_ROOT: join(dirs[0] ?? tmpdir(), "media") }), db, {
      fal: async () => ({ ok: true, modelIds: null }),
    });
    const reports = await platform.health(true);
    expect(reports.find((report) => report.kind === "video")?.status).toBe("connected and verified");
    db.close();
  });

  it("moves transcription to the next configured provider when every model is unavailable", async () => {
    const db = database();
    const platform = createPlatform(loadConfig({
      ASSEMBLYAI_API_KEY: "assembly",
      OPENAI_API_KEY: "openai",
      MEDIA_ROOT: join(dirs[0] ?? tmpdir(), "media"),
    }), db, {
      assemblyai: async () => ({ ok: true, modelIds: [] }),
      openai: async () => ({ ok: true, modelIds: [OPENAI_TRANSCRIPTION_DEFAULT] }),
    });
    await platform.health(true);
    expect(platform.select("transcription")).toMatchObject({ ok: true, providerId: "openai", modelId: OPENAI_TRANSCRIPTION_DEFAULT, usedFallback: false });
    db.close();
  });

  it("uses the Fal pricing response to tell an accepted key from a rejected one", async () => {
    const config = loadConfig({ FAL_KEY: "test-key" });
    const accepted = await probeFal(config, async () => Response.json({ error: { type: "validation_error", message: "Invalid request parameters" } }, { status: 400 }));
    const rejected = await probeFal(config, async () => new Response("no", { status: 401 }));
    expect(accepted).toEqual({ ok: true, modelIds: null });
    expect(rejected).toEqual({ ok: false, httpStatus: 401, modelMissing: false });
  });

  it("loads the official client packages without calling them", async () => {
    await import("@anthropic-ai/sdk");
    await import("openai");
    await import("assemblyai");
    await import("@fal-ai/client");
    await import("@aws-sdk/client-s3");
    await import("@neondatabase/serverless");
  });

  it("keeps mock providers separate from the live registry", async () => {
    const platformSource = readFileSync(new URL("./platform.ts", import.meta.url), "utf8");
    const liveSource = readFileSync(new URL("./providers/live.ts", import.meta.url), "utf8");
    const mockSource = readFileSync(new URL("./providers/mocks.ts", import.meta.url), "utf8");
    expect(platformSource).not.toContain("mocks");
    expect(liveSource).not.toContain("mocks");
    expect(mockSource).not.toContain("./live");
    const reports = (await Promise.all(mockProviders().map((provider) => provider.health({ verify: true })))).flat();
    expect(reports.every((report) => report.status === "connected and verified")).toBe(true);
    expect(reports.every((report) => report.detail.includes("Mock"))).toBe(true);
  });
});

describe("pricing registry", () => {
  it("stores verified Claude base rates and leaves other providers unset", () => {
    expect(estimateMicros("anthropic", "claude-fable-5-2", "input_tokens", 1_000_000)).toBe(8_000_000);
    expect(estimateMicros("anthropic", "claude-opus-5-5", "output_tokens", 1_000_000)).toBe(20_000_000);
    expect(estimateMicros("anthropic", "claude-sonnet-5-5", "input_tokens", 1_000_000)).toBe(2_000_000);
    expect(findPrice("fal", null, "video").verified).toBe(false);
    expect(findPrice("fal", null, "video").amountMicros).toBeNull();
    expect(findPrice("assemblyai", "assemblyai-stt-3-7", "transcription").verified).toBe(false);
    expect(findPrice("openai", "gpt-transcribe", "transcription").verified).toBe(false);
    expect(findPrice("anthropic", "claude-haiku-5-5", "input_tokens").verified).toBe(false);
  });
});
