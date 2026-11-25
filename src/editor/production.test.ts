import { describe, expect, it } from "vitest";
import { captionTimelineRange, spokenWordsMatch } from "./captions";
import { createEditor, executeTool } from "./registry";
import type { ProjectView } from "./schema";
import type { ToolResult } from "./store";

function ok<T>(result: ToolResult): T {
  expect(result.ok, result.ok ? "" : result.error.message).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.output as T;
}

describe("production editor tools", () => {
  it("keeps caption source times fixed when a clip moves and retimes the timeline", () => {
    const editor = createEditor();
    const project = ok<ProjectView>(executeTool(editor, "createProject", { name: "Spot" })).project;
    const media = ok<{ mediaId: string; version: number }>(executeTool(editor, "registerMedia", {
      projectId: project.id, expectedVersion: project.version, name: "Voice", kind: "audio", durationMs: 8000,
    }));
    const track = project.tracks.find((item) => item.kind === "audio");
    if (!track) throw new Error("missing audio track");
    const clip = ok<{ clipId: string; version: number }>(executeTool(editor, "addClip", {
      projectId: project.id, expectedVersion: media.version, trackId: track.id, mediaId: media.mediaId, timelineStartMs: 0, sourceInMs: 0, sourceOutMs: 4000,
    }));
    const captionTrack = ok<{ trackId: string; version: number }>(executeTool(editor, "addCaptionTrack", {
      projectId: project.id, expectedVersion: clip.version, name: "Captions", preset: "subtitles",
    }));
    const segment = ok<{ segmentId: string; version: number }>(executeTool(editor, "addCaptionSegment", {
      projectId: project.id, expectedVersion: captionTrack.version, trackId: captionTrack.trackId, clipId: clip.clipId, text: "Hello there", sourceStartMs: 100, sourceEndMs: 900,
    }));
    const moved = ok<{ version: number }>(executeTool(editor, "moveClip", {
      projectId: project.id, expectedVersion: segment.version, clipId: clip.clipId, timelineStartMs: 1500,
    }));
    const viewed = ok<ProjectView>(executeTool(editor, "inspectProject", { projectId: project.id }));
    expect(viewed.project.version).toBe(moved.version);
    const stored = viewed.project.captions?.[0];
    const movedClip = viewed.project.clips[0];
    if (!stored || !movedClip) throw new Error("missing caption");
    expect(stored.sourceStartMs).toBe(100);
    expect(captionTimelineRange(movedClip, stored.sourceStartMs, stored.sourceEndMs).startMs).toBe(1600);
  });

  it("refuses caption rewrites that change spoken words and allows punctuation", () => {
    expect(spokenWordsMatch("Hello there", "Hello, there.")).toBe(true);
    expect(spokenWordsMatch("Hello there", "Hello world")).toBe(false);
    const editor = createEditor();
    const project = ok<ProjectView>(executeTool(editor, "createProject", { name: "Spot" })).project;
    const media = ok<{ mediaId: string; version: number }>(executeTool(editor, "importMedia", {
      projectId: project.id, expectedVersion: project.version, name: "Voice", kind: "audio", durationMs: 4000, fileName: "voice.wav",
    }));
    const clip = ok<{ clipId: string; version: number }>(executeTool(editor, "addClip", {
      projectId: project.id, expectedVersion: media.version, trackId: project.tracks[1]!.id, mediaId: media.mediaId, timelineStartMs: 0, sourceOutMs: 4000,
    }));
    const track = ok<{ trackId: string; version: number }>(executeTool(editor, "addCaptionTrack", {
      projectId: project.id, expectedVersion: clip.version, name: "Caps", preset: "karaoke",
    }));
    const transcriptId = crypto.randomUUID();
    const attached = ok<{ version: number }>(executeTool(editor, "attachTranscript", {
      projectId: project.id,
      expectedVersion: track.version,
      transcript: {
        id: transcriptId,
        mediaId: media.mediaId,
        provider: "mock",
        liveVerified: false,
        language: "en",
        text: "Hello there",
        speakers: [],
        words: [
          { text: "Hello", sourceStartMs: 0, sourceEndMs: 400, confidence: 0.9, uncertain: false },
          { text: "there", sourceStartMs: 400, sourceEndMs: 800, confidence: 0.8, uncertain: false },
        ],
      },
    }));
    const captions = ok<{ segmentIds: string[]; version: number }>(executeTool(editor, "generateCaptions", {
      projectId: project.id, expectedVersion: attached.version, transcriptId, clipId: clip.clipId, trackId: track.trackId,
    }));
    const rejected = executeTool(editor, "editCaptionText", {
      projectId: project.id, expectedVersion: captions.version, segmentId: captions.segmentIds[0], text: "Hello world",
    });
    expect(rejected.ok).toBe(false);
    const edited = ok<{ version: number }>(executeTool(editor, "editCaptionText", {
      projectId: project.id, expectedVersion: captions.version, segmentId: captions.segmentIds[0], text: "Hello, there.",
    }));
    const srt = ok<{ body: string }>(executeTool(editor, "exportSubtitles", {
      projectId: project.id, expectedVersion: edited.version, format: "srt",
    }));
    expect(srt.body).toContain("Hello, there.");
    const view = ok<ProjectView>(executeTool(editor, "inspectProject", { projectId: project.id }));
    expect(view.project.version).toBe(edited.version);
  });

  it("applies speed, color, and an effect, and marks lyric alignment uncertain", () => {
    const editor = createEditor();
    const project = ok<ProjectView>(executeTool(editor, "createProject", { name: "Cut" })).project;
    const video = ok<{ mediaId: string; version: number }>(executeTool(editor, "registerMedia", {
      projectId: project.id, expectedVersion: project.version, name: "City", kind: "video", durationMs: 6000,
    }));
    const audio = ok<{ mediaId: string; version: number }>(executeTool(editor, "registerMedia", {
      projectId: project.id, expectedVersion: video.version, name: "Song", kind: "audio", durationMs: 6000,
    }));
    const clip = ok<{ clipId: string; version: number }>(executeTool(editor, "addClip", {
      projectId: project.id, expectedVersion: audio.version, trackId: project.tracks[0]!.id, mediaId: video.mediaId, timelineStartMs: 0, sourceOutMs: 4000,
    }));
    const speed = ok<{ version: number }>(executeTool(editor, "setClipSpeed", {
      projectId: project.id, expectedVersion: clip.version, clipId: clip.clipId, speed: 2,
    }));
    const effect = ok<{ effectId: string; version: number }>(executeTool(editor, "applyEffect", {
      projectId: project.id, expectedVersion: speed.version, clipId: clip.clipId, type: "glow", amount: 0.4,
    }));
    ok(executeTool(editor, "setColor", {
      projectId: project.id, expectedVersion: effect.version, clipId: clip.clipId, brightness: 0.1, contrast: 1.1, saturation: 0.8, exposure: 0,
    }));
    const analysisVersion = ok<ProjectView>(executeTool(editor, "inspectProject", { projectId: project.id })).project.version;
    const stored = ok<{ version: number }>(executeTool(editor, "storeAudioAnalysis", {
      projectId: project.id,
      expectedVersion: analysisVersion,
      analysis: {
        mediaId: audio.mediaId,
        durationMs: 6000,
        bpm: 120,
        beatsMs: [0, 500, 1000],
        onsetsMs: [0, 500, 1000, 1500],
        loudnessLufs: -14,
        peakDb: -1.2,
        silence: [],
        clipping: false,
        dropsMs: [3000],
        sections: [{ startMs: 0, endMs: 6000, label: "high" }],
        method: "ffmpeg-energy-v1",
      },
    }));
    const track = ok<{ trackId: string; version: number }>(executeTool(editor, "addCaptionTrack", {
      projectId: project.id, expectedVersion: stored.version, name: "Lyrics", preset: "cinematic-lyrics",
    }));
    const audioClip = ok<{ clipId: string; version: number }>(executeTool(editor, "addClip", {
      projectId: project.id, expectedVersion: track.version, trackId: project.tracks[1]!.id, mediaId: audio.mediaId, timelineStartMs: 0, sourceOutMs: 4000,
    }));
    const aligned = ok<{ uncertain: true }>(executeTool(editor, "alignLyrics", {
      projectId: project.id, expectedVersion: audioClip.version, mediaId: audio.mediaId, clipId: audioClip.clipId, trackId: track.trackId, lyrics: "city lights",
    }));
    expect(aligned.uncertain).toBe(true);
    const vocals = executeTool(editor, "separateVocals", { projectId: project.id, expectedVersion: audioClip.version });
    expect(vocals.ok).toBe(false);
    if (!vocals.ok) expect(vocals.error.message).toContain("Demucs");
    const synced = ok<{ movedClipIds: string[] }>(executeTool(editor, "syncCutsToBeats", {
      projectId: project.id, expectedVersion: ok<ProjectView>(executeTool(editor, "inspectProject", { projectId: project.id })).project.version, analysisMediaId: audio.mediaId,
    }));
    expect(synced.movedClipIds.length).toBeGreaterThan(0);
  });
});
