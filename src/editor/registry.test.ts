import { describe, expect, it } from "vitest";
import { createEditor, executeTool, listSupportedTools } from "./registry";
import type { ProjectView, TimelineView } from "./schema";
import type { ToolResult } from "./store";

function ok<T>(result: ToolResult): T {
  expect(result.ok, result.ok ? "" : `${result.error.code}: ${result.error.message}`).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.output as T;
}

function fail(result: ToolResult): Extract<ToolResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected failure");
  return result;
}

function projectOf(result: ToolResult): ProjectView["project"] {
  return (ok(result) as ProjectView).project;
}

describe("editing tool registry", () => {
  it("lists only the implemented tools", () => {
    expect([...listSupportedTools()].sort()).toEqual([
      "addClip",
      "addTrack",
      "createCheckpoint",
      "createProject",
      "inspectProject",
      "inspectTimeline",
      "moveClip",
      "redo",
      "registerMedia",
      "removeClip",
      "removeTrack",
      "restoreCheckpoint",
      "setAspectRatio",
      "setFrameRate",
      "setResolution",
      "splitClip",
      "trimClip",
      "undo",
    ]);
  });

  it("rejects unsupported operations without changing the project", () => {
    const editor = createEditor();
    const created = ok<ProjectView>(executeTool(editor, "createProject", { name: "Spot" }));
    for (const name of ["generateVideo", "generateCaptions", "applyEffect", "exportVideo", "transcribeAudio", "importMedia"]) {
      const result = fail(executeTool(editor, name, { projectId: created.project.id }));
      expect(result.error.code).toBe("UNSUPPORTED");
      expect(result.error.message).toContain(name);
    }
    const inspected = ok<ProjectView>(executeTool(editor, "inspectProject", { projectId: created.project.id }));
    expect(inspected.project.version).toBe(1);
    expect(inspected.project.clips).toEqual([]);
  });

  it("rejects invalid input and unknown fields", () => {
    const editor = createEditor();
    const empty = fail(executeTool(editor, "createProject", { name: "   " }));
    expect(empty.error.code).toBe("VALIDATION");
    expect(editor.sessions.size).toBe(0);

    const created = ok<ProjectView>(executeTool(editor, "createProject", { name: "Spot" }));
    const extra = fail(
      executeTool(editor, "setFrameRate", {
        projectId: created.project.id,
        expectedVersion: 1,
        frameRate: 24,
        effect: "blur",
      }),
    );
    expect(extra.error.code).toBe("VALIDATION");
    const fractional = fail(
      executeTool(editor, "setFrameRate", {
        projectId: created.project.id,
        expectedVersion: 1,
        frameRate: 23.976,
      }),
    );
    expect(fractional.error.code).toBe("VALIDATION");
    const aspect = fail(
      executeTool(editor, "setAspectRatio", {
        projectId: created.project.id,
        expectedVersion: 1,
        aspectRatio: "21:9",
      }),
    );
    expect(aspect.error.code).toBe("VALIDATION");
    expect(projectOf(executeTool(editor, "inspectProject", { projectId: created.project.id })).version).toBe(1);
  });

  it("creates a project, changes settings, and rejects a stale version", () => {
    const editor = createEditor();
    const created = ok<ProjectView>(
      executeTool(editor, "createProject", { name: "Spot", aspectRatio: "16:9", width: 1920, height: 1080, frameRate: 30 }),
    );
    expect(created.project.version).toBe(1);
    expect(created.project.tracks.map((track) => track.name)).toEqual(["Video 1", "Audio 1"]);
    expect(created.history).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, checkpoints: [] });

    const aspect = ok<{ version: number }>(
      executeTool(editor, "setAspectRatio", {
        projectId: created.project.id,
        expectedVersion: 1,
        aspectRatio: "9:16",
      }),
    );
    expect(aspect.version).toBe(2);
    const resolution = ok<{ version: number }>(
      executeTool(editor, "setResolution", {
        projectId: created.project.id,
        expectedVersion: 2,
        width: 1080,
        height: 1920,
      }),
    );
    const rate = ok<{ version: number }>(
      executeTool(editor, "setFrameRate", {
        projectId: created.project.id,
        expectedVersion: resolution.version,
        frameRate: 24,
      }),
    );
    const stale = fail(
      executeTool(editor, "setFrameRate", {
        projectId: created.project.id,
        expectedVersion: 1,
        frameRate: 60,
      }),
    );
    expect(stale.error.code).toBe("VERSION_CONFLICT");
    expect(stale.error.details).toMatchObject({ expectedVersion: 1, actualVersion: rate.version });

    const project = projectOf(executeTool(editor, "inspectProject", { projectId: created.project.id }));
    expect(project.settings).toEqual({ aspectRatio: "9:16", width: 1080, height: 1920, frameRate: 24 });
    expect(project.version).toBe(rate.version);
  });

  it("edits tracks and clips, then undoes, redoes, and restores a checkpoint", () => {
    const editor = createEditor();
    const created = ok<ProjectView>(executeTool(editor, "createProject", { name: "Cut" }));
    const projectId = created.project.id;
    const video = created.project.tracks.find((track) => track.kind === "video");
    const audio = created.project.tracks.find((track) => track.kind === "audio");
    if (!video || !audio) throw new Error("default tracks missing");

    const picture = ok<{ version: number; mediaId: string }>(
      executeTool(editor, "registerMedia", {
        projectId,
        expectedVersion: created.project.version,
        name: "City",
        kind: "video",
        durationMs: 8_000,
      }),
    );
    const song = ok<{ version: number; mediaId: string }>(
      executeTool(editor, "registerMedia", {
        projectId,
        expectedVersion: picture.version,
        name: "Song",
        kind: "audio",
        durationMs: 12_000,
      }),
    );
    const mismatch = fail(
      executeTool(editor, "addClip", {
        projectId,
        expectedVersion: song.version,
        trackId: audio.id,
        mediaId: picture.mediaId,
        timelineStartMs: 0,
      }),
    );
    expect(mismatch.error.code).toBe("INVALID_EDIT");

    const visual = ok<{ version: number; clipId: string }>(
      executeTool(editor, "addClip", {
        projectId,
        expectedVersion: song.version,
        trackId: video.id,
        mediaId: picture.mediaId,
        timelineStartMs: 0,
        sourceInMs: 0,
        sourceOutMs: 4_000,
      }),
    );
    const overlap = fail(
      executeTool(editor, "addClip", {
        projectId,
        expectedVersion: visual.version,
        trackId: video.id,
        mediaId: picture.mediaId,
        timelineStartMs: 3_000,
        sourceOutMs: 2_000,
      }),
    );
    expect(overlap.error.code).toBe("INVALID_EDIT");

    const moved = ok<{ version: number }>(
      executeTool(editor, "moveClip", {
        projectId,
        expectedVersion: visual.version,
        clipId: visual.clipId,
        timelineStartMs: 500,
      }),
    );
    const trimmed = ok<{ version: number }>(
      executeTool(editor, "trimClip", {
        projectId,
        expectedVersion: moved.version,
        clipId: visual.clipId,
        sourceInMs: 500,
      }),
    );
    let timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    const trimmedClip = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === visual.clipId);
    expect(trimmedClip).toMatchObject({ timelineStartMs: 1_000, sourceInMs: 500, sourceOutMs: 4_000 });

    const split = ok<{ version: number; leftClipId: string; rightClipId: string }>(
      executeTool(editor, "splitClip", {
        projectId,
        expectedVersion: trimmed.version,
        clipId: visual.clipId,
        atMs: 2_000,
      }),
    );
    const outside = fail(
      executeTool(editor, "splitClip", {
        projectId,
        expectedVersion: split.version,
        clipId: split.leftClipId,
        atMs: 2_000,
      }),
    );
    expect(outside.error.code).toBe("INVALID_EDIT");

    timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    const pieces = timeline.tracks.find((track) => track.id === video.id)?.clips ?? [];
    expect(pieces.map((clip) => [clip.timelineStartMs, clip.sourceInMs, clip.sourceOutMs])).toEqual([
      [1_000, 500, 1_500],
      [2_000, 1_500, 4_000],
    ]);
    expect(timeline.durationMs).toBe(4_500);

    const titles = ok<{ version: number; trackId: string }>(
      executeTool(editor, "addTrack", {
        projectId,
        expectedVersion: split.version,
        name: "Titles",
        kind: "video",
      }),
    );
    const removedTrack = ok<{ version: number }>(
      executeTool(editor, "removeTrack", {
        projectId,
        expectedVersion: titles.version,
        trackId: titles.trackId,
      }),
    );
    const removedClip = ok<{ version: number }>(
      executeTool(editor, "removeClip", {
        projectId,
        expectedVersion: removedTrack.version,
        clipId: split.rightClipId,
      }),
    );

    const undone = ok<{ version: number }>(
      executeTool(editor, "undo", { projectId, expectedVersion: removedClip.version }),
    );
    timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    expect(timeline.tracks.flatMap((track) => track.clips).map((clip) => clip.id)).toEqual([
      split.leftClipId,
      split.rightClipId,
    ]);
    const redone = ok<{ version: number }>(executeTool(editor, "redo", { projectId, expectedVersion: undone.version }));
    timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    expect(timeline.tracks.flatMap((track) => track.clips).map((clip) => clip.id)).toEqual([split.leftClipId]);

    const editedAfterUndo = ok<{ version: number }>(
      executeTool(editor, "undo", { projectId, expectedVersion: redone.version }),
    );
    const replacement = ok<{ version: number }>(
      executeTool(editor, "moveClip", {
        projectId,
        expectedVersion: editedAfterUndo.version,
        clipId: split.leftClipId,
        timelineStartMs: 100,
      }),
    );
    const blockedRedo = fail(executeTool(editor, "redo", { projectId, expectedVersion: replacement.version }));
    expect(blockedRedo.error.code).toBe("INVALID_EDIT");

    const checkpoint = ok<{ version: number; checkpointId: string }>(
      executeTool(editor, "createCheckpoint", {
        projectId,
        expectedVersion: replacement.version,
        label: "Before delete",
      }),
    );
    expect(checkpoint.version).toBe(replacement.version);
    const deleted = ok<{ version: number }>(
      executeTool(editor, "removeClip", {
        projectId,
        expectedVersion: checkpoint.version,
        clipId: split.leftClipId,
      }),
    );
    const restored = ok<{ version: number }>(
      executeTool(editor, "restoreCheckpoint", {
        projectId,
        expectedVersion: deleted.version,
        checkpointId: checkpoint.checkpointId,
      }),
    );
    timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    expect(timeline.tracks.flatMap((track) => track.clips).map((clip) => clip.timelineStartMs)).toEqual([100, 2_000]);
    const undoRestore = ok<{ version: number }>(
      executeTool(editor, "undo", { projectId, expectedVersion: restored.version }),
    );
    timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    expect(timeline.tracks.flatMap((track) => track.clips).map((clip) => clip.timelineStartMs)).toEqual([2_000]);
    expect(undoRestore.version).toBeGreaterThan(restored.version);

    const missing = fail(
      executeTool(editor, "restoreCheckpoint", {
        projectId,
        expectedVersion: undoRestore.version,
        checkpointId: crypto.randomUUID(),
      }),
    );
    expect(missing.error.code).toBe("NOT_FOUND");
    const fresh = createEditor();
    const bare = ok<ProjectView>(executeTool(fresh, "createProject", { name: "Bare" }));
    expect(fail(executeTool(fresh, "undo", { projectId: bare.project.id, expectedVersion: 1 })).error.code).toBe(
      "INVALID_EDIT",
    );
    expect(fail(executeTool(fresh, "redo", { projectId: bare.project.id, expectedVersion: 1 })).error.code).toBe(
      "INVALID_EDIT",
    );
    expect(
      fail(executeTool(fresh, "removeClip", { projectId: bare.project.id, expectedVersion: 1, clipId: crypto.randomUUID() }))
        .error.code,
    ).toBe("NOT_FOUND");
    expect(
      fail(executeTool(editor, "inspectProject", { projectId: crypto.randomUUID() })).error.code,
    ).toBe("NOT_FOUND");
  });

  it("removes a track together with the clips on it and undoes that edit", () => {
    const editor = createEditor();
    const created = ok<ProjectView>(executeTool(editor, "createProject", { name: "Tracks" }));
    const projectId = created.project.id;
    const video = created.project.tracks[0];
    if (!video) throw new Error("missing video track");
    const media = ok<{ version: number; mediaId: string }>(
      executeTool(editor, "registerMedia", {
        projectId,
        expectedVersion: 1,
        name: "Still",
        kind: "image",
        durationMs: 5_000,
      }),
    );
    const clip = ok<{ version: number; clipId: string }>(
      executeTool(editor, "addClip", {
        projectId,
        expectedVersion: media.version,
        trackId: video.id,
        mediaId: media.mediaId,
        timelineStartMs: 0,
        sourceOutMs: 2_000,
      }),
    );
    const removed = ok<{ version: number }>(
      executeTool(editor, "removeTrack", { projectId, expectedVersion: clip.version, trackId: video.id }),
    );
    let timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    expect(timeline.tracks.map((track) => track.kind)).toEqual(["audio"]);
    expect(timeline.durationMs).toBe(0);
    ok(executeTool(editor, "undo", { projectId, expectedVersion: removed.version }));
    timeline = ok<TimelineView>(executeTool(editor, "inspectTimeline", { projectId }));
    expect(timeline.tracks.map((track) => track.name)).toEqual(["Video 1", "Audio 1"]);
    expect(timeline.tracks[0]?.clips).toHaveLength(1);
  });
});
