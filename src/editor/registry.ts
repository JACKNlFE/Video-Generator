import type { ZodTypeAny } from "zod";
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
