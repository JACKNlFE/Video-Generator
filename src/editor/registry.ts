import type { ZodTypeAny } from "zod";
import {
  addCaptionSegment,
  addCaptionTrack,
  addKeyframe,
  addTextOverlay,
  alignLyrics,
  applyEffect,
  attachTranscript,
  completeRender,
  editCaptionText,
  exportSubtitles,
  generateCaptions,
  importMedia,
  queueRender,
  removeEffect,
  separateVocals,
  setCaptionStyle,
  setClipSpeed,
  setColor,
  setFades,
  setOpacity,
  setTransform,
  setTransition,
  setVolume,
  storeAudioAnalysis,
  syncCutsToBeats,
} from "./production";
import {
  addCaptionTrackInput,
  addKeyframeInput,
  alignLyricsInput,
  alignLyricsOutput,
  applyEffectInput,
  attachTranscriptInput,
  completeRenderInput,
  editCaptionTextInput,
  effectOutput,
  exportSubtitlesInput,
  exportSubtitlesOutput,
  generateCaptionsInput,
  importMediaInput,
  keyframeOutput,
  mediaOutput,
  queueRenderInput,
  removeEffectInput,
  renderOutput,
  segmentOutput,
  segmentsOutput,
  setCaptionStyleInput,
  setClipSpeedInput,
  setColorInput,
  setFadesInput,
  setOpacityInput,
  setTransformInput,
  setTransitionInput,
  setVolumeInput,
  storeAnalysisInput,
  syncCutsInput,
  syncCutsOutput,
  textRangeInput,
  trackOutput,
  transcriptOutput,
} from "./productionInputs";
import {
  addClipInput,
  addTrackInput,
  createCheckpointInput,
  createProjectInput,
  createdCheckpointSchema,
  createdClipSchema,
  createdMediaSchema,
  createdTrackSchema,
  inspectProjectInput,
  inspectTimelineInput,
  moveClipInput,
  mutationSchema,
  projectViewSchema,
  registerMediaInput,
  removeClipInput,
  removeTrackInput,
  restoreCheckpointInput,
  setAspectRatioInput,
  setFrameRateInput,
  setResolutionInput,
  splitClipInput,
  splitClipOutput,
  supportedTools,
  timelineSchema,
  trimClipInput,
  versionedInput,
  type SupportedTool,
} from "./schema";
import {
  addClip,
  addTrack,
  createCheckpoint,
  createProject,
  createStore,
  fail,
  inspectProject,
  inspectTimeline,
  moveClip,
  redo,
  registerMedia,
  removeClip,
  removeTrack,
  restoreCheckpoint,
  setAspectRatio,
  setFrameRate,
  setResolution,
  splitClip,
  trimClip,
  undo,
  type EditorStore,
  type Session,
  type ToolResult,
} from "./store";

type ToolDefinition = {
  input: ZodTypeAny;
  output: ZodTypeAny;
  run: (store: EditorStore, input: unknown) => ToolResult;
};

function defineTool(
  input: ZodTypeAny,
  output: ZodTypeAny,
  // `input` is the schema output. Zod's default() fields make that type awkward to thread through.
  run: (store: EditorStore, input: any) => ToolResult,
): ToolDefinition {
  return { input, output, run };
}

const tools: Record<SupportedTool, ToolDefinition> = {
  createProject: defineTool(createProjectInput, projectViewSchema, (store, input) => createProject(store, input)),
  inspectProject: defineTool(inspectProjectInput, projectViewSchema, (store, input) => inspectProject(store, input.projectId)),
  inspectTimeline: defineTool(inspectTimelineInput, timelineSchema, (store, input) => inspectTimeline(store, input.projectId)),
  setAspectRatio: defineTool(setAspectRatioInput, mutationSchema, (store, input) => setAspectRatio(store, input)),
  setResolution: defineTool(setResolutionInput, mutationSchema, (store, input) => setResolution(store, input)),
  setFrameRate: defineTool(setFrameRateInput, mutationSchema, (store, input) => setFrameRate(store, input)),
  registerMedia: defineTool(registerMediaInput, createdMediaSchema, (store, input) => registerMedia(store, input)),
  addTrack: defineTool(addTrackInput, createdTrackSchema, (store, input) => addTrack(store, input)),
  removeTrack: defineTool(removeTrackInput, mutationSchema, (store, input) => removeTrack(store, input)),
  addClip: defineTool(addClipInput, createdClipSchema, (store, input) => addClip(store, input)),
  removeClip: defineTool(removeClipInput, mutationSchema, (store, input) => removeClip(store, input)),
  moveClip: defineTool(moveClipInput, mutationSchema, (store, input) => moveClip(store, input)),
  trimClip: defineTool(trimClipInput, mutationSchema, (store, input) => trimClip(store, input)),
  splitClip: defineTool(splitClipInput, splitClipOutput, (store, input) => splitClip(store, input)),
  undo: defineTool(versionedInput, mutationSchema, (store, input) => undo(store, input)),
  redo: defineTool(versionedInput, mutationSchema, (store, input) => redo(store, input)),
  createCheckpoint: defineTool(createCheckpointInput, createdCheckpointSchema, (store, input) => createCheckpoint(store, input)),
  restoreCheckpoint: defineTool(restoreCheckpointInput, mutationSchema, (store, input) => restoreCheckpoint(store, input)),
  setClipSpeed: defineTool(setClipSpeedInput, mutationSchema, (store, input) => setClipSpeed(store, input)),
  setTransform: defineTool(setTransformInput, mutationSchema, (store, input) => setTransform(store, input)),
  setOpacity: defineTool(setOpacityInput, mutationSchema, (store, input) => setOpacity(store, input)),
  setColor: defineTool(setColorInput, mutationSchema, (store, input) => setColor(store, input)),
  applyEffect: defineTool(applyEffectInput, effectOutput, (store, input) => applyEffect(store, input)),
  removeEffect: defineTool(removeEffectInput, mutationSchema, (store, input) => removeEffect(store, input)),
  setTransition: defineTool(setTransitionInput, mutationSchema, (store, input) => setTransition(store, input)),
  setVolume: defineTool(setVolumeInput, mutationSchema, (store, input) => setVolume(store, input)),
  setFades: defineTool(setFadesInput, mutationSchema, (store, input) => setFades(store, input)),
  addKeyframe: defineTool(addKeyframeInput, keyframeOutput, (store, input) => addKeyframe(store, input)),
  addCaptionTrack: defineTool(addCaptionTrackInput, trackOutput, (store, input) => addCaptionTrack(store, input)),
  setCaptionStyle: defineTool(setCaptionStyleInput, mutationSchema, (store, input) => setCaptionStyle(store, input)),
  addTextOverlay: defineTool(textRangeInput, segmentOutput, (store, input) => addTextOverlay(store, input)),
  addCaptionSegment: defineTool(textRangeInput, segmentOutput, (store, input) => addCaptionSegment(store, input)),
  attachTranscript: defineTool(attachTranscriptInput, transcriptOutput, (store, input) => attachTranscript(store, input)),
  generateCaptions: defineTool(generateCaptionsInput, segmentsOutput, (store, input) => generateCaptions(store, input)),
  editCaptionText: defineTool(editCaptionTextInput, mutationSchema, (store, input) => editCaptionText(store, input)),
  exportSubtitles: defineTool(exportSubtitlesInput, exportSubtitlesOutput, (store, input) => exportSubtitles(store, input)),
  syncCutsToBeats: defineTool(syncCutsInput, syncCutsOutput, (store, input) => syncCutsToBeats(store, input)),
  storeAudioAnalysis: defineTool(storeAnalysisInput, mutationSchema, (store, input) => storeAudioAnalysis(store, input)),
  alignLyrics: defineTool(alignLyricsInput, alignLyricsOutput, (store, input) => alignLyrics(store, input)),
  importMedia: defineTool(importMediaInput, mediaOutput, (store, input) => importMedia(store, input)),
  previewVideo: defineTool(queueRenderInput, renderOutput, (store, input) => queueRender(store, { ...input, kind: "preview" })),
  exportVideo: defineTool(queueRenderInput, renderOutput, (store, input) => queueRender(store, { ...input, kind: "export" })),
  completeRender: defineTool(completeRenderInput, mutationSchema, (store, input) => completeRender(store, input)),
  separateVocals: defineTool(versionedInput, mutationSchema, () => separateVocals()),
};

export function createEditor(): EditorStore {
  return createStore();
}

export function listSupportedTools(): readonly SupportedTool[] {
  return supportedTools;
}

function snapshot(store: EditorStore): Array<[string, Session]> {
  return structuredClone([...store.sessions.entries()]);
}

function restore(store: EditorStore, entries: Array<[string, Session]>): void {
  store.sessions.clear();
  for (const [id, session] of entries) {
    store.sessions.set(id, session);
  }
}

export function executeTool(store: EditorStore, name: string, input: unknown): ToolResult {
  const tool = tools[name as SupportedTool];
  if (!tool) {
    return fail(name, "UNSUPPORTED", `Operation "${name}" is not supported.`);
  }
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return fail(name, "VALIDATION", "Invalid input.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const before = snapshot(store);
  const result = tool.run(store, parsed.data);
  if (!result.ok) return result;
  const output = tool.output.safeParse(result.output);
  if (!output.success) {
    restore(store, before);
    return fail(name, "INVALID_EDIT", "Tool result failed output validation. The project was left unchanged.", {
      issues: output.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return { ok: true, tool: name, output: output.data };
}
