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
] as const;

export type SupportedTool = (typeof supportedTools)[number];
