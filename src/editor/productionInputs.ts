import { z } from "zod";
import { MAX_MS, audioAnalysisSchema, captionStylePresets, captionStyleSchema, mediaKinds, mutationSchema, transcriptSchema, versionedInput } from "./schema";

const clipId = z.string().uuid();

export const setClipSpeedInput = versionedInput.extend({ clipId, speed: z.number().positive().max(16) }).strict();
export const setTransformInput = versionedInput.extend({
  clipId,
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  scale: z.number().positive().max(8),
  rotation: z.number().min(-360).max(360),
}).strict();
export const setOpacityInput = versionedInput.extend({ clipId, opacity: z.number().min(0).max(1) }).strict();
export const setColorInput = versionedInput.extend({
  clipId,
  brightness: z.number().min(-1).max(1),
  contrast: z.number().min(0).max(2),
  saturation: z.number().min(0).max(2),
  exposure: z.number().min(-2).max(2),
}).strict();
export const applyEffectInput = versionedInput.extend({
  clipId,
  type: z.enum(["blur", "sharpen", "vignette", "grain", "glow"]),
  amount: z.number().min(0).max(1),
}).strict();
export const removeEffectInput = versionedInput.extend({ clipId, effectId: z.string().uuid() }).strict();
export const setTransitionInput = versionedInput.extend({
  clipId,
  type: z.enum(["cut", "dissolve", "fade", "wipe"]),
  durationMs: z.number().int().nonnegative().max(10_000),
}).strict();
export const setVolumeInput = versionedInput.extend({ clipId, volume: z.number().min(0).max(4) }).strict();
export const setFadesInput = versionedInput.extend({
  clipId,
  fadeInMs: z.number().int().nonnegative().max(MAX_MS),
  fadeOutMs: z.number().int().nonnegative().max(MAX_MS),
}).strict();
export const addKeyframeInput = versionedInput.extend({
  clipId,
  timeMs: z.number().int().nonnegative().max(MAX_MS),
  property: z.enum(["opacity", "scale", "x", "y", "rotation", "volume"]),
  value: z.number(),
}).strict();
export const addCaptionTrackInput = versionedInput.extend({ name: z.string().trim().min(1).max(120), preset: z.enum(captionStylePresets) }).strict();
export const setCaptionStyleInput = versionedInput.extend({ trackId: z.string().uuid(), style: captionStyleSchema }).strict();
export const textRangeInput = versionedInput.extend({
  trackId: z.string().uuid(),
  clipId,
  text: z.string().trim().min(1).max(500),
  sourceStartMs: z.number().int().nonnegative().max(MAX_MS),
  sourceEndMs: z.number().int().positive().max(MAX_MS),
}).strict();
export const attachTranscriptInput = versionedInput.extend({ transcript: transcriptSchema }).strict();
export const generateCaptionsInput = versionedInput.extend({
  transcriptId: z.string().uuid(),
  clipId,
  trackId: z.string().uuid(),
}).strict();
export const editCaptionTextInput = versionedInput.extend({ segmentId: z.string().uuid(), text: z.string().trim().min(1).max(500) }).strict();
export const exportSubtitlesInput = versionedInput.extend({ format: z.enum(["srt", "vtt"]) }).strict();
export const exportSubtitlesOutput = mutationSchema.extend({ format: z.enum(["srt", "vtt"]), body: z.string() }).strict();
export const syncCutsInput = versionedInput.extend({ analysisMediaId: z.string().uuid() }).strict();
export const syncCutsOutput = mutationSchema.extend({ movedClipIds: z.array(z.string().uuid()) }).strict();
export const storeAnalysisInput = versionedInput.extend({ analysis: audioAnalysisSchema }).strict();
export const alignLyricsInput = versionedInput.extend({
  mediaId: z.string().uuid(),
  clipId,
  trackId: z.string().uuid(),
  lyrics: z.string().trim().min(1).max(5000),
}).strict();
export const alignLyricsOutput = mutationSchema.extend({ segmentId: z.string().uuid(), uncertain: z.literal(true) }).strict();
export const importMediaInput = versionedInput.extend({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(mediaKinds),
  durationMs: z.number().int().positive().max(MAX_MS),
  fileName: z.string().min(1).max(240).optional(),
}).strict();
export const queueRenderInput = versionedInput.extend({ subtitleFormat: z.enum(["srt", "vtt", "burn-in", "none"]) }).strict();
export const idOutput = mutationSchema.extend({ mediaId: z.string().uuid().optional(), trackId: z.string().uuid().optional(), segmentId: z.string().uuid().optional(), effectId: z.string().uuid().optional(), keyframeId: z.string().uuid().optional(), renderId: z.string().uuid().optional(), transcriptId: z.string().uuid().optional(), segmentIds: z.array(z.string().uuid()).optional() }).strict();
export const effectOutput = mutationSchema.extend({ effectId: z.string().uuid() }).strict();
export const keyframeOutput = mutationSchema.extend({ keyframeId: z.string().uuid() }).strict();
export const trackOutput = mutationSchema.extend({ trackId: z.string().uuid() }).strict();
export const segmentOutput = mutationSchema.extend({ segmentId: z.string().uuid() }).strict();
export const segmentsOutput = mutationSchema.extend({ segmentIds: z.array(z.string().uuid()) }).strict();
export const mediaOutput = mutationSchema.extend({ mediaId: z.string().uuid() }).strict();
export const renderOutput = mutationSchema.extend({ renderId: z.string().uuid() }).strict();
export const transcriptOutput = mutationSchema.extend({ transcriptId: z.string().uuid() }).strict();
export const completeRenderInput = versionedInput.extend({
  renderId: z.string().uuid(),
  status: z.enum(["completed", "failed"]),
  fileName: z.string().min(1).max(240).nullable(),
  error: z.string().max(500).nullable(),
}).strict();
