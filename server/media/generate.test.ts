import { describe, expect, it } from "vitest";
import { createEditor, executeTool } from "../../src/editor/registry";
import type { ProjectView } from "../../src/editor/schema";
import { loadConfig } from "../config";
import { parsePlan } from "../plans";
import { FAL_MODELS, routeModels, selectFalModel } from "../providers/fal-catalog";
import { inspectProjectQuality, revisionAllowed } from "../quality";
import { submitFalGeneration } from "./generate";

describe("generation catalog", () => {
  it("omits Runway and prices, and refuses video while a music track is in use", () => {
    expect(FAL_MODELS.every((model) => model.priceUsd === null && model.priceVerified === false)).toBe(true);
    expect(FAL_MODELS.some((model) => /runway/i.test(model.endpointId))).toBe(false);
    expect(selectFalModel({ mode: "premium", kind: "video", imageToVideo: false, hasMusic: true })).toBeNull();
    expect(selectFalModel({ mode: "budget", kind: "image", imageToVideo: false, hasMusic: false })?.endpointId).toBe("fal-ai/flux/schnell");
    expect(selectFalModel({ mode: "balanced", kind: "video", imageToVideo: false, hasMusic: false })?.endpointId).toBe("bytedance/seedance-2.5/text-to-video");
    expect(routeModels("fast", { creative: "claude-fable-5-2", execution: "claude-sonnet-5-5", review: "claude-opus-5-5" })).toEqual({
      plan: null,
      execute: "claude-sonnet-5-5",
      review: null,
    });
  });

  it("does not submit to Fal without a key, and queues a local request as not live", async () => {
    const result = await submitFalGeneration(loadConfig({}), {
      endpointId: "fal-ai/flux/schnell",
      prompt: "a city",
      projectId: crypto.randomUUID(),
      estimateMicros: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
    const editor = createEditor();
    const created = executeTool(editor, "createProject", { name: "Gen" });
    if (!created.ok) throw new Error("project");
    const project = (created.output as ProjectView).project;
    const queued = executeTool(editor, "generateImage", {
      projectId: project.id,
      expectedVersion: 1,
      endpointId: "fal-ai/flux/schnell",
      prompt: "a city",
    });
    expect(queued.ok).toBe(true);
    if (queued.ok) expect(queued.output).toMatchObject({ status: "queued", liveVerified: false });
    const broken = structuredClone(project);
    broken.clips.push({ id: crypto.randomUUID(), trackId: project.tracks[0]!.id, mediaId: crypto.randomUUID(), name: "Missing", timelineStartMs: 0, sourceInMs: 0, sourceOutMs: 1000 });
    expect(inspectProjectQuality(broken).some((finding) => finding.code === "missing-media")).toBe(true);
    expect(revisionAllowed(2, 2)).toBe(false);
    const plan = parsePlan({
      version: 1,
      projectId: project.id,
      request: "A short city shot",
      route: "fast",
      durationMs: 4000,
      aspectRatio: "16:9",
      scenes: [{ startMs: 0, endMs: 4000, purpose: "open", visual: "city", generate: false }],
      success: ["The clip exists"],
    });
    expect(plan.ok).toBe(true);
  });
});
