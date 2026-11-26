import { captionPreset, captionTimelineRange, segmentsToSrt, segmentsToVtt, spokenWordsMatch } from "./captions";
import type { AudioAnalysis, CaptionStyle, Project, Transcript } from "./schema";
import { captionStylePresets } from "./schema";
import { domainError, edit, fail, playbackMs, type EditorStore, type ToolResult } from "./store";

type Versioned = { projectId: string; expectedVersion: number };

function clipOf(project: Project, clipId: string) {
  return project.clips.find((clip) => clip.id === clipId);
}

export function setClipSpeed(store: EditorStore, input: Versioned & { clipId: string; speed: number }): ToolResult {
  return edit(store, "setClipSpeed", input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    clip.speed = input.speed;
    const end = clip.timelineStartMs + playbackMs(clip);
    const overlap = draft.clips.some((other) => other.id !== clip.id && other.trackId === clip.trackId && clip.timelineStartMs < other.timelineStartMs + playbackMs(other) && other.timelineStartMs < end);
    if (overlap) return { ok: false, error: domainError("INVALID_EDIT", "The new speed makes the clip overlap another clip.") };
    return { ok: true, extra: {} };
  });
}

export function setTransform(store: EditorStore, input: Versioned & { clipId: string; x: number; y: number; scale: number; rotation: number }): ToolResult {
  return edit(store, "setTransform", input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    clip.transform = { x: input.x, y: input.y, scale: input.scale, rotation: input.rotation };
    return { ok: true, extra: {} };
  });
}

export function setOpacity(store: EditorStore, input: Versioned & { clipId: string; opacity: number }): ToolResult {
  return mutateClip(store, "setOpacity", input, (clip) => {
    clip.opacity = input.opacity;
  });
}

export function setColor(store: EditorStore, input: Versioned & { clipId: string; brightness: number; contrast: number; saturation: number; exposure: number }): ToolResult {
  return mutateClip(store, "setColor", input, (clip) => {
    clip.color = { brightness: input.brightness, contrast: input.contrast, saturation: input.saturation, exposure: input.exposure };
  });
}

export function applyEffect(store: EditorStore, input: Versioned & { clipId: string; type: "blur" | "sharpen" | "vignette" | "grain" | "glow"; amount: number }): ToolResult<{ effectId: string }> {
  const effectId = crypto.randomUUID();
  return edit(store, "applyEffect", input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    clip.effects = [...(clip.effects ?? []), { id: effectId, type: input.type, amount: input.amount }];
    return { ok: true, extra: { effectId } };
  });
}

export function removeEffect(store: EditorStore, input: Versioned & { clipId: string; effectId: string }): ToolResult {
  return edit(store, "removeEffect", input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    const next = (clip.effects ?? []).filter((effect) => effect.id !== input.effectId);
    if (next.length === (clip.effects ?? []).length) return { ok: false, error: domainError("NOT_FOUND", `Effect "${input.effectId}" was not found.`) };
    clip.effects = next;
    return { ok: true, extra: {} };
  });
}

export function setTransition(store: EditorStore, input: Versioned & { clipId: string; type: "cut" | "dissolve" | "fade" | "wipe"; durationMs: number }): ToolResult {
  return mutateClip(store, "setTransition", input, (clip) => {
    clip.transitionIn = { type: input.type, durationMs: input.durationMs };
  });
}

export function setVolume(store: EditorStore, input: Versioned & { clipId: string; volume: number }): ToolResult {
  return mutateClip(store, "setVolume", input, (clip) => {
    clip.volume = input.volume;
  });
}

export function setFades(store: EditorStore, input: Versioned & { clipId: string; fadeInMs: number; fadeOutMs: number }): ToolResult {
  return mutateClip(store, "setFades", input, (clip) => {
    clip.fadeInMs = input.fadeInMs;
    clip.fadeOutMs = input.fadeOutMs;
  });
}

export function addKeyframe(store: EditorStore, input: Versioned & { clipId: string; timeMs: number; property: "opacity" | "scale" | "x" | "y" | "rotation" | "volume"; value: number }): ToolResult<{ keyframeId: string }> {
  const keyframeId = crypto.randomUUID();
  return edit(store, "addKeyframe", input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    clip.keyframes = [...(clip.keyframes ?? []), { id: keyframeId, timeMs: input.timeMs, property: input.property, value: input.value }];
    return { ok: true, extra: { keyframeId } };
  });
}

export function addCaptionTrack(store: EditorStore, input: Versioned & { name: string; preset: CaptionStyle["preset"] }): ToolResult<{ trackId: string }> {
  const trackId = crypto.randomUUID();
  return edit(store, "addCaptionTrack", input.projectId, input.expectedVersion, (draft) => {
    draft.captionTracks = [...(draft.captionTracks ?? []), { id: trackId, name: input.name, style: captionPreset(input.preset) }];
    return { ok: true, extra: { trackId } };
  });
}

export function setCaptionStyle(store: EditorStore, input: Versioned & { trackId: string; style: CaptionStyle }): ToolResult {
  return edit(store, "setCaptionStyle", input.projectId, input.expectedVersion, (draft) => {
    const track = (draft.captionTracks ?? []).find((item) => item.id === input.trackId);
    if (!track) return { ok: false, error: domainError("NOT_FOUND", `Caption track "${input.trackId}" was not found.`) };
    if (!captionStylePresets.includes(input.style.preset)) {
      return { ok: false, error: domainError("VALIDATION", "Unknown caption preset.") };
    }
    track.style = input.style;
    return { ok: true, extra: {} };
  });
}

export function addTextOverlay(store: EditorStore, input: Versioned & { trackId: string; clipId: string; text: string; sourceStartMs: number; sourceEndMs: number }): ToolResult<{ segmentId: string }> {
  return addSegment(store, "addTextOverlay", input, input.text, true);
}

export function attachTranscript(store: EditorStore, input: Versioned & { transcript: Transcript }): ToolResult<{ transcriptId: string }> {
  return edit(store, "attachTranscript", input.projectId, input.expectedVersion, (draft) => {
    if (!draft.media.some((media) => media.id === input.transcript.mediaId)) {
      return { ok: false, error: domainError("NOT_FOUND", `Media "${input.transcript.mediaId}" was not found.`) };
    }
    draft.transcripts = [...(draft.transcripts ?? []).filter((item) => item.id !== input.transcript.id), input.transcript];
    return { ok: true, extra: { transcriptId: input.transcript.id } };
  });
}

export function generateCaptions(store: EditorStore, input: Versioned & { transcriptId: string; clipId: string; trackId: string }): ToolResult<{ segmentIds: string[] }> {
  return edit(store, "generateCaptions", input.projectId, input.expectedVersion, (draft) => {
    const transcript = (draft.transcripts ?? []).find((item) => item.id === input.transcriptId);
    if (!transcript) return { ok: false, error: domainError("NOT_FOUND", "No stored transcript matches that id. Run transcription first.") };
    const clip = clipOf(draft, input.clipId);
    if (!clip || clip.mediaId !== transcript.mediaId) {
      return { ok: false, error: domainError("INVALID_EDIT", "The caption clip must use the transcript's media.") };
    }
    if (!(draft.captionTracks ?? []).some((track) => track.id === input.trackId)) {
      return { ok: false, error: domainError("NOT_FOUND", "Caption track was not found.") };
    }
    const words = transcript.words.filter((word) => word.sourceStartMs >= clip.sourceInMs && word.sourceEndMs <= clip.sourceOutMs);
    if (words.length === 0) return { ok: false, error: domainError("INVALID_EDIT", "The transcript has no words inside this clip.") };
    const segmentId = crypto.randomUUID();
    const text = words.map((word) => word.text).join(" ");
    draft.captions = [...(draft.captions ?? []), {
      id: segmentId,
      trackId: input.trackId,
      clipId: clip.id,
      sourceStartMs: words[0]?.sourceStartMs ?? clip.sourceInMs,
      sourceEndMs: words[words.length - 1]?.sourceEndMs ?? clip.sourceOutMs,
      text,
      rawText: text,
      language: transcript.language,
      speaker: transcript.speakers[0] ?? null,
      confidence: average(words.map((word) => word.confidence)),
      words,
      manual: false,
    }];
    return { ok: true, extra: { segmentIds: [segmentId] } };
  });
}

export function editCaptionText(store: EditorStore, input: Versioned & { segmentId: string; text: string }): ToolResult {
  return edit(store, "editCaptionText", input.projectId, input.expectedVersion, (draft) => {
    const segment = (draft.captions ?? []).find((item) => item.id === input.segmentId);
    if (!segment) return { ok: false, error: domainError("NOT_FOUND", "Caption segment was not found.") };
    if (!segment.manual && !spokenWordsMatch(segment.rawText, input.text)) {
      return { ok: false, error: domainError("INVALID_EDIT", "Caption text cannot change the spoken words. Punctuation and casing can change.") };
    }
    segment.text = input.text;
    return { ok: true, extra: {} };
  });
}

export function addCaptionSegment(store: EditorStore, input: Versioned & { trackId: string; clipId: string; text: string; sourceStartMs: number; sourceEndMs: number }): ToolResult<{ segmentId: string }> {
  return addSegment(store, "addCaptionSegment", input, input.text, true);
}

export function exportSubtitles(store: EditorStore, input: Versioned & { format: "srt" | "vtt" }): ToolResult<{ projectId: string; version: number; format: "srt" | "vtt"; body: string }> {
  const session = store.sessions.get(input.projectId);
  if (!session) return fail("exportSubtitles", "NOT_FOUND", `Project "${input.projectId}" was not found.`);
  if (session.project.version !== input.expectedVersion) {
    return fail("exportSubtitles", "VERSION_CONFLICT", "The project version changed.", { expectedVersion: input.expectedVersion, actualVersion: session.project.version });
  }
  const body = input.format === "srt" ? segmentsToSrt(session.project) : segmentsToVtt(session.project);
  return { ok: true, tool: "exportSubtitles", output: { projectId: input.projectId, version: session.project.version, format: input.format, body } };
}

export function syncCutsToBeats(store: EditorStore, input: Versioned & { analysisMediaId: string }): ToolResult<{ movedClipIds: string[] }> {
  return edit(store, "syncCutsToBeats", input.projectId, input.expectedVersion, (draft) => {
    const analysis = (draft.analyses ?? []).find((item) => item.mediaId === input.analysisMediaId);
    if (!analysis) return { ok: false, error: domainError("NOT_FOUND", "No cached audio analysis for that media.") };
    const beats = analysis.beatsMs;
    if (beats.length === 0) return { ok: false, error: domainError("INVALID_EDIT", "The analysis has no beat timestamps.") };
    const videoTrackIds = new Set(draft.tracks.filter((track) => track.kind === "video").map((track) => track.id));
    const clips = draft.clips.filter((clip) => videoTrackIds.has(clip.trackId)).sort((a, b) => a.timelineStartMs - b.timelineStartMs);
    const moved: string[] = [];
    let beatIndex = 0;
    for (const clip of clips) {
      while (beatIndex < beats.length) {
        const start = beats[beatIndex] ?? 0;
        beatIndex += 1;
        const end = start + playbackMs(clip);
        const overlap = draft.clips.some((other) => other.id !== clip.id && other.trackId === clip.trackId && start < other.timelineStartMs + playbackMs(other) && other.timelineStartMs < end);
        if (!overlap && end <= 86_400_000) {
          clip.timelineStartMs = start;
          moved.push(clip.id);
          break;
        }
      }
    }
    if (moved.length === 0) return { ok: false, error: domainError("INVALID_EDIT", "No clip could be moved onto a beat without an overlap.") };
    return { ok: true, extra: { movedClipIds: moved } };
  });
}

export function storeAudioAnalysis(store: EditorStore, input: Versioned & { analysis: AudioAnalysis }): ToolResult {
  return edit(store, "storeAudioAnalysis", input.projectId, input.expectedVersion, (draft) => {
    if (!draft.media.some((media) => media.id === input.analysis.mediaId)) {
      return { ok: false, error: domainError("NOT_FOUND", "Analysis media was not found.") };
    }
    draft.analyses = [...(draft.analyses ?? []).filter((item) => item.mediaId !== input.analysis.mediaId), input.analysis];
    return { ok: true, extra: {} };
  });
}

export function alignLyrics(store: EditorStore, input: Versioned & { mediaId: string; clipId: string; trackId: string; lyrics: string }): ToolResult<{ segmentId: string; uncertain: true }> {
  return edit(store, "alignLyrics", input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip || clip.mediaId !== input.mediaId) return { ok: false, error: domainError("INVALID_EDIT", "The clip does not use that media.") };
    const analysis = (draft.analyses ?? []).find((item) => item.mediaId === input.mediaId);
    if (!analysis) return { ok: false, error: domainError("NOT_FOUND", "Align lyrics after audio analysis is cached.") };
    if (!(draft.captionTracks ?? []).some((track) => track.id === input.trackId)) {
      return { ok: false, error: domainError("NOT_FOUND", "Caption track was not found.") };
    }
    const tokens = input.lyrics.split(/\s+/).map((token) => token.trim()).filter((token) => token.length > 0);
    if (tokens.length === 0) return { ok: false, error: domainError("INVALID_EDIT", "Lyrics are empty.") };
    const anchors = analysis.onsetsMs.filter((time) => time >= clip.sourceInMs && time < clip.sourceOutMs);
    const points = anchors.length >= tokens.length ? anchors : spread(clip.sourceInMs, clip.sourceOutMs, tokens.length);
    const words = tokens.map((text, index) => {
      const start = points[index] ?? clip.sourceInMs;
      const end = points[index + 1] ?? clip.sourceOutMs;
      return { text, sourceStartMs: start, sourceEndMs: Math.max(start + 1, end), confidence: null, uncertain: true as const };
    });
    const segmentId = crypto.randomUUID();
    draft.captions = [...(draft.captions ?? []), {
      id: segmentId,
      trackId: input.trackId,
      clipId: clip.id,
      sourceStartMs: words[0]?.sourceStartMs ?? clip.sourceInMs,
      sourceEndMs: words[words.length - 1]?.sourceEndMs ?? clip.sourceOutMs,
      text: tokens.join(" "),
      rawText: tokens.join(" "),
      language: null,
      speaker: null,
      confidence: null,
      words,
      manual: false,
    }];
    return { ok: true, extra: { segmentId, uncertain: true as const } };
  });
}

export function importMedia(store: EditorStore, input: Versioned & { name: string; kind: "video" | "audio" | "image"; durationMs: number; fileName?: string }): ToolResult<{ mediaId: string }> {
  const mediaId = crypto.randomUUID();
  return edit(store, "importMedia", input.projectId, input.expectedVersion, (draft) => {
    draft.media.push({ id: mediaId, name: input.name, kind: input.kind, durationMs: input.durationMs, ...(input.fileName ? { fileName: input.fileName } : {}) });
    return { ok: true, extra: { mediaId } };
  });
}

export function queueRender(store: EditorStore, input: Versioned & { kind: "preview" | "export"; subtitleFormat: "srt" | "vtt" | "burn-in" | "none" }): ToolResult<{ renderId: string }> {
  const renderId = crypto.randomUUID();
  return edit(store, input.kind === "preview" ? "previewVideo" : "exportVideo", input.projectId, input.expectedVersion, (draft) => {
    draft.renders = [...(draft.renders ?? []), { id: renderId, kind: input.kind, status: "queued", subtitleFormat: input.subtitleFormat, fileName: null, error: null }];
    return { ok: true, extra: { renderId } };
  });
}

export function completeRender(store: EditorStore, input: Versioned & { renderId: string; status: "completed" | "failed"; fileName: string | null; error: string | null }): ToolResult {
  return edit(store, "completeRender", input.projectId, input.expectedVersion, (draft) => {
    const render = (draft.renders ?? []).find((item) => item.id === input.renderId);
    if (!render) return { ok: false, error: domainError("NOT_FOUND", "Render request was not found.") };
    if (input.status === "completed" && !input.fileName) {
      return { ok: false, error: domainError("INVALID_EDIT", "A completed render needs a file name.") };
    }
    render.status = input.status;
    render.fileName = input.fileName;
    render.error = input.error;
    return { ok: true, extra: {} };
  });
}

export function queueGeneration(store: EditorStore, input: Versioned & { kind: "image" | "video"; endpointId: string; prompt: string }): ToolResult<{ generationId: string; status: "queued"; liveVerified: false }> {
  const generationId = crypto.randomUUID();
  return edit(store, input.kind === "video" ? "generateVideo" : "generateImage", input.projectId, input.expectedVersion, (draft) => {
    draft.generations = [...(draft.generations ?? []), {
      id: generationId,
      kind: input.kind,
      endpointId: input.endpointId,
      prompt: input.prompt,
      status: "queued",
      liveVerified: false,
      fileName: null,
    }];
    return { ok: true, extra: { generationId, status: "queued" as const, liveVerified: false as const } };
  });
}

export function separateVocals(): ToolResult {
  return fail("separateVocals", "INVALID_EDIT", "Vocal separation is not available. Demucs is not installed, and no hosted separator is configured. The original audio was not changed.");
}

export function captionTiming(project: Project, segmentId: string): { startMs: number; endMs: number } | null {
  const segment = (project.captions ?? []).find((item) => item.id === segmentId);
  const clip = segment ? project.clips.find((item) => item.id === segment.clipId) : undefined;
  if (!segment || !clip) return null;
  return captionTimelineRange(clip, segment.sourceStartMs, segment.sourceEndMs);
}

function addSegment(store: EditorStore, tool: string, input: Versioned & { trackId: string; clipId: string; sourceStartMs: number; sourceEndMs: number }, text: string, manual: boolean): ToolResult<{ segmentId: string }> {
  const segmentId = crypto.randomUUID();
  return edit(store, tool, input.projectId, input.expectedVersion, (draft) => {
    if (!(draft.captionTracks ?? []).some((track) => track.id === input.trackId)) {
      return { ok: false, error: domainError("NOT_FOUND", "Caption track was not found.") };
    }
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", "Clip was not found.") };
    if (input.sourceStartMs < clip.sourceInMs || input.sourceEndMs > clip.sourceOutMs || input.sourceEndMs <= input.sourceStartMs) {
      return { ok: false, error: domainError("INVALID_EDIT", "The text range must sit inside the clip source range.") };
    }
    draft.captions = [...(draft.captions ?? []), {
      id: segmentId,
      trackId: input.trackId,
      clipId: clip.id,
      sourceStartMs: input.sourceStartMs,
      sourceEndMs: input.sourceEndMs,
      text,
      rawText: text,
      language: null,
      speaker: null,
      confidence: null,
      words: [{ text, sourceStartMs: input.sourceStartMs, sourceEndMs: input.sourceEndMs, confidence: null, uncertain: false }],
      manual,
    }];
    return { ok: true, extra: { segmentId } };
  });
}

function mutateClip(store: EditorStore, tool: string, input: Versioned & { clipId: string }, change: (clip: Project["clips"][number]) => void): ToolResult {
  return edit(store, tool, input.projectId, input.expectedVersion, (draft) => {
    const clip = clipOf(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    change(clip);
    return { ok: true, extra: {} };
  });
}

function average(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function spread(start: number, end: number, count: number): number[] {
  if (count <= 1) return [start];
  const step = (end - start) / count;
  return Array.from({ length: count + 1 }, (_, index) => Math.round(start + step * index));
}
