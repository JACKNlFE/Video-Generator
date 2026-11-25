import { describe, expect, it } from "vitest";
import { createEditor, executeTool } from "../../src/editor/registry";
import type { ProjectView } from "../../src/editor/schema";
import { openDatabase, reserve } from "../persist.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockPlanner, runAgentTurn, type AgentModel } from "./loop";

describe("agent loop", () => {
  it("uses the mock planner to edit the real timeline and stops at an iteration limit", async () => {
    const editor = createEditor();
    const created = executeTool(editor, "createProject", { name: "Agent" });
    if (!created.ok) throw new Error("project");
    const project = (created.output as ProjectView).project;
    const media = executeTool(editor, "registerMedia", { projectId: project.id, expectedVersion: 1, name: "City", kind: "video", durationMs: 4000 });
    if (!media.ok) throw new Error("media");
    const clip = executeTool(editor, "addClip", {
      projectId: project.id, expectedVersion: 2, trackId: project.tracks[0]!.id, mediaId: (media.output as { mediaId: string }).mediaId, timelineStartMs: 0, sourceOutMs: 4000,
    });
    if (!clip.ok) throw new Error("clip");
    const clipId = (clip.output as { clipId: string }).clipId;
    const turn = await runAgentTurn({
      model: mockPlanner(),
      store: editor,
      projectId: project.id,
      userText: `project:${project.id} clip:${clipId} add a glow`,
      maxIterations: 3,
    });
    expect(turn.liveVerified).toBe(false);
    expect(turn.provider).toBe("mock");
    expect(turn.results.some((result) => result.ok && result.tool === "applyEffect")).toBe(true);
    const inspected = executeTool(editor, "inspectProject", { projectId: project.id });
    if (!inspected.ok) throw new Error("inspect");
    expect((inspected.output as ProjectView).project.clips[0]?.effects?.[0]?.type).toBe("glow");

    let calls = 0;
    const looping: AgentModel = {
      liveVerified: false,
      provider: "mock",
      async complete() {
        calls += 1;
        return { text: "again", toolCalls: [], stop: false };
      },
    };
    const limited = await runAgentTurn({ model: looping, store: editor, projectId: project.id, userText: "keep going", maxIterations: 2 });
    expect(limited.stopped).toBe("iteration-limit");
    expect(calls).toBe(2);
  });

  it("stops before a second model call when the budget reservation is refused", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vg-agent-"));
    const db = openDatabase(join(dir, "jobs.sqlite"));
    const editor = createEditor();
    const created = executeTool(editor, "createProject", { name: "Budget" });
    if (!created.ok) throw new Error("project");
    const projectId = (created.output as ProjectView).project.id;
    let calls = 0;
    const model: AgentModel = {
      liveVerified: false,
      provider: "mock",
      async complete() {
        calls += 1;
        return { text: "spend", toolCalls: [], stop: false };
      },
    };
    const turn = await runAgentTurn({
      model,
      store: editor,
      projectId,
      userText: "spend",
      maxIterations: 4,
      beforeIteration: () => {
        const result = reserve(db, {
          estimatedMicros: 600_000,
          limits: { dailyMicros: 1_000_000 },
          now: "2026-11-25T20:00:00.000Z",
          providerId: "anthropic",
          operation: "input_tokens",
          projectId,
        });
        return result.ok ? { ok: true } : { ok: false, reason: "budget" };
      },
    });
    expect(turn.stopped).toBe("budget");
    expect(calls).toBe(1);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
