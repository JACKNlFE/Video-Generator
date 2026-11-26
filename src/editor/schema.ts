import { z } from "zod";

/** Timeline values are integer milliseconds. One day is the Phase 1 ceiling. */
export const MAX_MS = 86_400_000;

export const aspectRatios = ["16:9", "9:16", "1:1", "4:5", "4:3"] as const;
export const mediaKinds = ["video", "audio", "image"] as const;
export const trackKinds = ["video", "audio"] as const;

const idSchema = z.string().uuid();

export const projectSettingsSchema = z
  .object({
    aspectRatio: z.enum(aspectRatios),
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(7680),
    frameRate: z.number().int().min(1).max(240),
  })
  .strict();

export const mediaReferenceSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(120),
    kind: z.enum(mediaKinds),
    durationMs: z.number().int().positive().max(MAX_MS),
    fileName: z.string().min(1).max(240).optional(),
  })
  .strict();

export const trackSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(120),
    kind: z.enum(trackKinds),
    index: z.number().int().nonnegative(),
  })
  .strict();

export const clipSchema = z
  .object({
    id: idSchema,
    trackId: idSchema,
    mediaId: idSchema,
    name: z.string().min(1).max(120),
    timelineStartMs: z.number().int().nonnegative().max(MAX_MS),
    sourceInMs: z.number().int().nonnegative().max(MAX_MS),
    sourceOutMs: z.number().int().positive().max(MAX_MS),
    speed: z.number().positive().max(16).optional(),
    opacity: z.number().min(0).max(1).optional(),
    volume: z.number().min(0).max(4).optional(),
    fadeInMs: z.number().int().nonnegative().max(MAX_MS).optional(),
    fadeOutMs: z.number().int().nonnegative().max(MAX_MS).optional(),
    transform: z
      .object({
        x: z.number().min(-1).max(2),
        y: z.number().min(-1).max(2),
        scale: z.number().positive().max(8),
        rotation: z.number().min(-360).max(360),
      })
      .strict()
      .optional(),
    color: z
      .object({
        brightness: z.number().min(-1).max(1),
        contrast: z.number().min(0).max(2),
        saturation: z.number().min(0).max(2),
        exposure: z.number().min(-2).max(2),
      })
      .strict()
      .optional(),
    effects: z
      .array(
        z
          .object({
            id: idSchema,
            type: z.enum(["blur", "sharpen", "vignette", "grain", "glow"]),
            amount: z.number().min(0).max(1),
          })
          .strict(),
      )
      .optional(),
    transitionIn: z
      .object({
        type: z.enum(["cut", "dissolve", "fade", "wipe"]),
        durationMs: z.number().int().nonnegative().max(10_000),
      })
      .strict()
      .optional(),
    keyframes: z
      .array(
        z
          .object({
            id: idSchema,
            timeMs: z.number().int().nonnegative().max(MAX_MS),
            property: z.enum(["opacity", "scale", "x", "y", "rotation", "volume"]),
            value: z.number(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const captionStylePresets = ["subtitles", "short-form", "word-highlight", "karaoke", "single-word", "cinematic-lyrics"] as const;

export const captionStyleSchema = z
  .object({
    preset: z.enum(captionStylePresets),
    fontFamily: z.string().min(1).max(80),
    fontSize: z.number().int().min(8).max(200),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundOpacity: z.number().min(0).max(1),
    outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    outlineWidth: z.number().min(0).max(20),
    position: z.enum(["bottom", "middle", "top"]),
    safeMarginPx: z.number().int().min(0).max(400),
    animation: z.enum(["none", "fade", "highlight", "karaoke", "single-word"]),
  })
  .strict();

export const captionTrackSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(120),
    style: captionStyleSchema,
  })
  .strict();

export const captionWordSchema = z
  .object({
    text: z.string().min(1).max(80),
    sourceStartMs: z.number().int().nonnegative().max(MAX_MS),
    sourceEndMs: z.number().int().nonnegative().max(MAX_MS),
    confidence: z.number().min(0).max(1).nullable(),
    uncertain: z.boolean(),
  })
  .strict();

export const captionSegmentSchema = z
  .object({
    id: idSchema,
    trackId: idSchema,
    clipId: idSchema,
    sourceStartMs: z.number().int().nonnegative().max(MAX_MS),
    sourceEndMs: z.number().int().positive().max(MAX_MS),
    text: z.string().min(1).max(500),
    rawText: z.string().min(1).max(500),
    language: z.string().min(2).max(16).nullable(),
    speaker: z.string().min(1).max(80).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    words: z.array(captionWordSchema),
    manual: z.boolean(),
  })
  .strict();

export const transcriptWordSchema = captionWordSchema;

export const transcriptSchema = z
  .object({
    id: idSchema,
    mediaId: idSchema,
    provider: z.enum(["assemblyai", "openai", "mock"]),
    liveVerified: z.boolean(),
    language: z.string().min(2).max(16).nullable(),
    text: z.string().max(100_000),
    words: z.array(transcriptWordSchema),
    speakers: z.array(z.string().min(1).max(80)),
  })
  .strict();

export const audioAnalysisSchema = z
  .object({
    mediaId: idSchema,
    durationMs: z.number().int().positive(),
    bpm: z.number().positive().nullable(),
    beatsMs: z.array(z.number().int().nonnegative()),
    onsetsMs: z.array(z.number().int().nonnegative()),
    loudnessLufs: z.number().nullable(),
    peakDb: z.number().nullable(),
    silence: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative() }).strict()),
    clipping: z.boolean(),
    dropsMs: z.array(z.number().int().nonnegative()),
    sections: z.array(
      z.object({
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
        label: z.enum(["low", "mid", "high"]),
      }).strict(),
    ),
    method: z.literal("ffmpeg-energy-v1"),
  })
  .strict();

export const renderRequestSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["preview", "export"]),
    status: z.enum(["queued", "completed", "failed"]),
    subtitleFormat: z.enum(["srt", "vtt", "burn-in", "none"]),
    fileName: z.string().min(1).max(240).nullable(),
    error: z.string().max(500).nullable(),
  })
  .strict();

export const projectSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(120),
    version: z.number().int().positive(),
    settings: projectSettingsSchema,
    media: z.array(mediaReferenceSchema),
    tracks: z.array(trackSchema),
    clips: z.array(clipSchema),
    captionTracks: z.array(captionTrackSchema).optional(),
    captions: z.array(captionSegmentSchema).optional(),
    transcripts: z.array(transcriptSchema).optional(),
    analyses: z.array(audioAnalysisSchema).optional(),
    renders: z.array(renderRequestSchema).optional(),
  })
  .strict();

export const checkpointInfoSchema = z
  .object({
    id: idSchema,
    label: z.string().min(1).max(120),
    createdAtVersion: z.number().int().positive(),
  })
  .strict();

export const historySchema = z
  .object({
    canUndo: z.boolean(),
    canRedo: z.boolean(),
    undoDepth: z.number().int().nonnegative(),
    redoDepth: z.number().int().nonnegative(),
    checkpoints: z.array(checkpointInfoSchema),
  })
  .strict();

export const projectViewSchema = z
  .object({
    project: projectSchema,
    history: historySchema,
  })
  .strict();

export const timelineTrackSchema = trackSchema
  .extend({
    clips: z.array(clipSchema),
  })
  .strict();

export const timelineSchema = z
  .object({
    projectId: idSchema,
    version: z.number().int().positive(),
    durationMs: z.number().int().nonnegative(),
    tracks: z.array(timelineTrackSchema),
  })
  .strict();

export const mutationSchema = z
  .object({
    projectId: idSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const createdClipSchema = mutationSchema
  .extend({
    clipId: idSchema,
  })
  .strict();

export const createdTrackSchema = mutationSchema
  .extend({
    trackId: idSchema,
  })
  .strict();

export const createdMediaSchema = mutationSchema
  .extend({
    mediaId: idSchema,
  })
  .strict();

export const createdCheckpointSchema = z
  .object({
    projectId: idSchema,
    version: z.number().int().positive(),
    checkpointId: idSchema,
    label: z.string().min(1).max(120),
  })
  .strict();

const projectId = idSchema;
const expectedVersion = z.number().int().positive();
const nameSchema = z.string().trim().min(1).max(120);

export const createProjectInput = z
  .object({
    name: nameSchema,
    aspectRatio: z.enum(aspectRatios).default("16:9"),
    width: z.number().int().min(16).max(7680).default(1920),
    height: z.number().int().min(16).max(7680).default(1080),
    frameRate: z.number().int().min(1).max(240).default(30),
  })
  .strict();

export const inspectProjectInput = z.object({ projectId }).strict();
export const inspectTimelineInput = z.object({ projectId }).strict();

export const versionedInput = z.object({ projectId, expectedVersion }).strict();

export const setAspectRatioInput = versionedInput
  .extend({
    aspectRatio: z.enum(aspectRatios),
  })
  .strict();

export const setResolutionInput = versionedInput
  .extend({
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(7680),
  })
  .strict();

export const setFrameRateInput = versionedInput
  .extend({
    frameRate: z.number().int().min(1).max(240),
  })
  .strict();

export const registerMediaInput = versionedInput
  .extend({
    name: nameSchema,
    kind: z.enum(mediaKinds),
    durationMs: z.number().int().positive().max(MAX_MS),
  })
  .strict();

export const addTrackInput = versionedInput
  .extend({
    name: nameSchema,
    kind: z.enum(trackKinds),
  })
  .strict();

export const removeTrackInput = versionedInput
  .extend({
    trackId: idSchema,
  })
  .strict();

export const addClipInput = versionedInput
  .extend({
    trackId: idSchema,
    mediaId: idSchema,
    timelineStartMs: z.number().int().nonnegative().max(MAX_MS),
    sourceInMs: z.number().int().nonnegative().max(MAX_MS).default(0),
    sourceOutMs: z.number().int().positive().max(MAX_MS).optional(),
  })
  .strict();

export const removeClipInput = versionedInput
  .extend({
    clipId: idSchema,
  })
  .strict();

export const moveClipInput = versionedInput
  .extend({
    clipId: idSchema,
    timelineStartMs: z.number().int().nonnegative().max(MAX_MS),
  })
  .strict();

export const trimClipInput = versionedInput
  .extend({
    clipId: idSchema,
    sourceInMs: z.number().int().nonnegative().max(MAX_MS).optional(),
    sourceOutMs: z.number().int().positive().max(MAX_MS).optional(),
  })
  .strict()
  .refine((value) => value.sourceInMs !== undefined || value.sourceOutMs !== undefined, {
    message: "Provide sourceInMs, sourceOutMs, or both.",
    path: ["sourceInMs"],
  });

export const splitClipInput = versionedInput
  .extend({
    clipId: idSchema,
    atMs: z.number().int().nonnegative().max(MAX_MS),
  })
  .strict();

export const createCheckpointInput = versionedInput
  .extend({
    label: nameSchema,
  })
  .strict();

export const restoreCheckpointInput = versionedInput
  .extend({
    checkpointId: idSchema,
  })
  .strict();

export const splitClipOutput = mutationSchema
  .extend({
    leftClipId: idSchema,
    rightClipId: idSchema,
  })
  .strict();

export type Project = z.infer<typeof projectSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Track = z.infer<typeof trackSchema>;
export type MediaReference = z.infer<typeof mediaReferenceSchema>;
export type CaptionStyle = z.infer<typeof captionStyleSchema>;
export type CaptionSegment = z.infer<typeof captionSegmentSchema>;
export type CaptionTrack = z.infer<typeof captionTrackSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type AudioAnalysis = z.infer<typeof audioAnalysisSchema>;
export type ProjectView = z.infer<typeof projectViewSchema>;
export type TimelineView = z.infer<typeof timelineSchema>;

export const supportedTools = [
  "createProject",
  "inspectProject",
  "inspectTimeline",
  "setAspectRatio",
  "setResolution",
  "setFrameRate",
  "registerMedia",
  "addTrack",
  "removeTrack",
  "addClip",
  "removeClip",
  "moveClip",
  "trimClip",
  "splitClip",
  "undo",
  "redo",
  "createCheckpoint",
  "restoreCheckpoint",
  "setClipSpeed",
  "setTransform",
  "setOpacity",
  "setColor",
  "applyEffect",
  "removeEffect",
  "setTransition",
  "setVolume",
  "setFades",
  "addKeyframe",
  "addCaptionTrack",
  "setCaptionStyle",
  "addTextOverlay",
  "addCaptionSegment",
  "attachTranscript",
  "generateCaptions",
  "editCaptionText",
  "exportSubtitles",
  "syncCutsToBeats",
  "storeAudioAnalysis",
  "alignLyrics",
  "importMedia",
  "previewVideo",
  "exportVideo",
  "completeRender",
  "separateVocals",
] as const;

export type SupportedTool = (typeof supportedTools)[number];
