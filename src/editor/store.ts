import {
  MAX_MS,
  type Clip,
  type MediaReference,
  type Project,
  type ProjectView,
  type TimelineView,
  type Track,
} from "./schema";

export type ToolErrorCode =
  | "VALIDATION"
  | "VERSION_CONFLICT"
  | "NOT_FOUND"
  | "UNSUPPORTED"
  | "INVALID_EDIT";

export type ToolError = {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ToolSuccess<T> = { ok: true; tool: string; output: T };
export type ToolFailure = { ok: false; tool: string; error: ToolError };
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

export type Checkpoint = {
  id: string;
  label: string;
  createdAtVersion: number;
  project: Project;
};

export type Session = {
  project: Project;
  undo: Project[];
  redo: Project[];
  checkpoints: Checkpoint[];
};

export type EditorStore = {
  sessions: Map<string, Session>;
};

export function createStore(): EditorStore {
  return { sessions: new Map() };
}

export function fail(
  tool: string,
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolFailure {
  const error: ToolError = details ? { code, message, details } : { code, message };
  return { ok: false, tool, error };
}

export function domainError(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolError {
  return details ? { code, message, details } : { code, message };
}

function newId(): string {
  return crypto.randomUUID();
}

export function clipDurationMs(clip: Pick<Clip, "sourceInMs" | "sourceOutMs">): number {
  return clip.sourceOutMs - clip.sourceInMs;
}

export function clipTimelineEndMs(clip: Clip): number {
  return clip.timelineStartMs + clipDurationMs(clip);
}

function historyOf(session: Session): ProjectView["history"] {
  return {
    canUndo: session.undo.length > 0,
    canRedo: session.redo.length > 0,
    undoDepth: session.undo.length,
    redoDepth: session.redo.length,
    checkpoints: session.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      label: checkpoint.label,
      createdAtVersion: checkpoint.createdAtVersion,
    })),
  };
}

export function projectView(session: Session): ProjectView {
  return {
    project: session.project,
    history: historyOf(session),
  };
}

export function timelineView(project: Project): TimelineView {
  const tracks = [...project.tracks].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
  let durationMs = 0;
  const viewTracks = tracks.map((track) => {
    const clips = project.clips
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.timelineStartMs - b.timelineStartMs || a.id.localeCompare(b.id));
    for (const clip of clips) {
      durationMs = Math.max(durationMs, clipTimelineEndMs(clip));
    }
    return { ...track, clips };
  });
  return {
    projectId: project.id,
    version: project.version,
    durationMs,
    tracks: viewTracks,
  };
}

function commit(session: Session, next: Project): void {
  session.undo.push(structuredClone(session.project));
  session.redo = [];
  session.project = next;
}

type ChangeResult<T> = { ok: true; extra: T } | { ok: false; error: ToolError };

function edit<T extends Record<string, unknown>>(
  store: EditorStore,
  tool: string,
  projectId: string,
  expectedVersion: number,
  change: (draft: Project) => ChangeResult<T>,
): ToolResult<{ projectId: string; version: number } & T> {
  const session = store.sessions.get(projectId);
  if (!session) {
    return fail(tool, "NOT_FOUND", `Project "${projectId}" was not found.`);
  }
  if (session.project.version !== expectedVersion) {
    return fail(
      tool,
      "VERSION_CONFLICT",
      `The project is at version ${session.project.version}. This edit was based on version ${expectedVersion}.`,
      { expectedVersion, actualVersion: session.project.version },
    );
  }
  const draft = structuredClone(session.project);
  const changed = change(draft);
  if (!changed.ok) {
    return { ok: false, tool, error: changed.error };
  }
  draft.version = session.project.version + 1;
  commit(session, draft);
  return {
    ok: true,
    tool,
    output: { projectId, version: draft.version, ...changed.extra },
  };
}

function findTrack(project: Project, trackId: string): Track | undefined {
  return project.tracks.find((track) => track.id === trackId);
}

function findClip(project: Project, clipId: string): Clip | undefined {
  return project.clips.find((clip) => clip.id === clipId);
}

function findMedia(project: Project, mediaId: string): MediaReference | undefined {
  return project.media.find((media) => media.id === mediaId);
}

function overlaps(project: Project, trackId: string, start: number, end: number, ignoreClipId?: string): boolean {
  return project.clips.some((clip) => {
    if (clip.trackId !== trackId || clip.id === ignoreClipId) return false;
    return start < clipTimelineEndMs(clip) && clip.timelineStartMs < end;
  });
}

function mediaFits(track: Track, media: MediaReference): boolean {
  if (track.kind === "audio") return media.kind === "audio";
  return media.kind === "video" || media.kind === "image";
}

export function createProject(
  store: EditorStore,
  input: {
    name: string;
    aspectRatio: Project["settings"]["aspectRatio"];
    width: number;
    height: number;
    frameRate: number;
  },
): ToolResult<ProjectView> {
  const project: Project = {
    id: newId(),
    name: input.name,
    version: 1,
    settings: {
      aspectRatio: input.aspectRatio,
      width: input.width,
      height: input.height,
      frameRate: input.frameRate,
    },
    media: [],
    tracks: [
      { id: newId(), name: "Video 1", kind: "video", index: 0 },
      { id: newId(), name: "Audio 1", kind: "audio", index: 1 },
    ],
    clips: [],
  };
  const session: Session = { project, undo: [], redo: [], checkpoints: [] };
  store.sessions.set(project.id, session);
  return { ok: true, tool: "createProject", output: projectView(session) };
}

export function inspectProject(store: EditorStore, projectId: string): ToolResult<ProjectView> {
  const session = store.sessions.get(projectId);
  if (!session) return fail("inspectProject", "NOT_FOUND", `Project "${projectId}" was not found.`);
  return { ok: true, tool: "inspectProject", output: projectView(session) };
}

export function inspectTimeline(store: EditorStore, projectId: string): ToolResult<TimelineView> {
  const session = store.sessions.get(projectId);
  if (!session) return fail("inspectTimeline", "NOT_FOUND", `Project "${projectId}" was not found.`);
  return { ok: true, tool: "inspectTimeline", output: timelineView(session.project) };
}

export function setAspectRatio(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; aspectRatio: Project["settings"]["aspectRatio"] },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "setAspectRatio", input.projectId, input.expectedVersion, (draft) => {
    draft.settings.aspectRatio = input.aspectRatio;
    return { ok: true, extra: {} };
  });
}

export function setResolution(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; width: number; height: number },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "setResolution", input.projectId, input.expectedVersion, (draft) => {
    draft.settings.width = input.width;
    draft.settings.height = input.height;
    return { ok: true, extra: {} };
  });
}

export function setFrameRate(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; frameRate: number },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "setFrameRate", input.projectId, input.expectedVersion, (draft) => {
    draft.settings.frameRate = input.frameRate;
    return { ok: true, extra: {} };
  });
}

export function registerMedia(
  store: EditorStore,
  input: {
    projectId: string;
    expectedVersion: number;
    name: string;
    kind: MediaReference["kind"];
    durationMs: number;
  },
): ToolResult<{ projectId: string; version: number; mediaId: string }> {
  const mediaId = newId();
  return edit(store, "registerMedia", input.projectId, input.expectedVersion, (draft) => {
    draft.media.push({
      id: mediaId,
      name: input.name,
      kind: input.kind,
      durationMs: input.durationMs,
    });
    return { ok: true, extra: { mediaId } };
  });
}

export function addTrack(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; name: string; kind: Track["kind"] },
): ToolResult<{ projectId: string; version: number; trackId: string }> {
  const trackId = newId();
  return edit(store, "addTrack", input.projectId, input.expectedVersion, (draft) => {
    const index = draft.tracks.reduce((max, track) => Math.max(max, track.index), -1) + 1;
    draft.tracks.push({ id: trackId, name: input.name, kind: input.kind, index });
    return { ok: true, extra: { trackId } };
  });
}

export function removeTrack(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; trackId: string },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "removeTrack", input.projectId, input.expectedVersion, (draft) => {
    if (!findTrack(draft, input.trackId)) {
      return { ok: false, error: domainError("NOT_FOUND", `Track "${input.trackId}" was not found.`) };
    }
    draft.tracks = draft.tracks.filter((track) => track.id !== input.trackId);
    draft.clips = draft.clips.filter((clip) => clip.trackId !== input.trackId);
    return { ok: true, extra: {} };
  });
}

export function addClip(
  store: EditorStore,
  input: {
    projectId: string;
    expectedVersion: number;
    trackId: string;
    mediaId: string;
    timelineStartMs: number;
    sourceInMs: number;
    sourceOutMs?: number;
  },
): ToolResult<{ projectId: string; version: number; clipId: string }> {
  const clipId = newId();
  return edit(store, "addClip", input.projectId, input.expectedVersion, (draft) => {
    const track = findTrack(draft, input.trackId);
    if (!track) return { ok: false, error: domainError("NOT_FOUND", `Track "${input.trackId}" was not found.`) };
    const media = findMedia(draft, input.mediaId);
    if (!media) return { ok: false, error: domainError("NOT_FOUND", `Media "${input.mediaId}" was not found.`) };
    if (!mediaFits(track, media)) {
      return {
        ok: false,
        error: domainError(
          "INVALID_EDIT",
          `A ${media.kind} reference cannot be placed on ${track.kind} track "${track.name}".`,
        ),
      };
    }
    const sourceOutMs = input.sourceOutMs ?? media.durationMs;
    if (input.sourceInMs >= sourceOutMs || sourceOutMs > media.durationMs) {
      return {
        ok: false,
        error: domainError(
          "INVALID_EDIT",
          `Source range ${input.sourceInMs}–${sourceOutMs} ms is outside media duration ${media.durationMs} ms.`,
        ),
      };
    }
    const end = input.timelineStartMs + (sourceOutMs - input.sourceInMs);
    if (end > MAX_MS) {
      return { ok: false, error: domainError("INVALID_EDIT", "The clip would extend past 24 hours.") };
    }
    if (overlaps(draft, track.id, input.timelineStartMs, end)) {
      return {
        ok: false,
        error: domainError("INVALID_EDIT", `The clip overlaps another clip on track "${track.name}".`),
      };
    }
    draft.clips.push({
      id: clipId,
      trackId: track.id,
      mediaId: media.id,
      name: media.name,
      timelineStartMs: input.timelineStartMs,
      sourceInMs: input.sourceInMs,
      sourceOutMs,
    });
    return { ok: true, extra: { clipId } };
  });
}

export function removeClip(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; clipId: string },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "removeClip", input.projectId, input.expectedVersion, (draft) => {
    if (!findClip(draft, input.clipId)) {
      return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    }
    draft.clips = draft.clips.filter((clip) => clip.id !== input.clipId);
    return { ok: true, extra: {} };
  });
}

export function moveClip(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; clipId: string; timelineStartMs: number },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "moveClip", input.projectId, input.expectedVersion, (draft) => {
    const clip = findClip(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    const end = input.timelineStartMs + clipDurationMs(clip);
    if (end > MAX_MS) {
      return { ok: false, error: domainError("INVALID_EDIT", "The clip would extend past 24 hours.") };
    }
    if (overlaps(draft, clip.trackId, input.timelineStartMs, end, clip.id)) {
      return { ok: false, error: domainError("INVALID_EDIT", "The moved clip overlaps another clip on the same track.") };
    }
    clip.timelineStartMs = input.timelineStartMs;
    return { ok: true, extra: {} };
  });
}

export function trimClip(
  store: EditorStore,
  input: {
    projectId: string;
    expectedVersion: number;
    clipId: string;
    sourceInMs?: number;
    sourceOutMs?: number;
  },
): ToolResult<{ projectId: string; version: number }> {
  return edit(store, "trimClip", input.projectId, input.expectedVersion, (draft) => {
    const clip = findClip(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    const media = findMedia(draft, clip.mediaId);
    if (!media) return { ok: false, error: domainError("NOT_FOUND", `Media "${clip.mediaId}" was not found.`) };
    const sourceInMs = input.sourceInMs ?? clip.sourceInMs;
    const sourceOutMs = input.sourceOutMs ?? clip.sourceOutMs;
    if (sourceOutMs <= sourceInMs || sourceInMs < 0 || sourceOutMs > media.durationMs) {
      return {
        ok: false,
        error: domainError(
          "INVALID_EDIT",
          `Source range ${sourceInMs}–${sourceOutMs} ms is outside media duration ${media.durationMs} ms.`,
        ),
      };
    }
    const delta = sourceInMs - clip.sourceInMs;
    const timelineStartMs = clip.timelineStartMs + delta;
    if (timelineStartMs < 0) {
      return {
        ok: false,
        error: domainError("INVALID_EDIT", "Trimming the head would move the clip before the start of the timeline."),
      };
    }
    const end = timelineStartMs + (sourceOutMs - sourceInMs);
    if (end > MAX_MS) {
      return { ok: false, error: domainError("INVALID_EDIT", "The clip would extend past 24 hours.") };
    }
    if (overlaps(draft, clip.trackId, timelineStartMs, end, clip.id)) {
      return { ok: false, error: domainError("INVALID_EDIT", "The trimmed clip overlaps another clip on the same track.") };
    }
    clip.sourceInMs = sourceInMs;
    clip.sourceOutMs = sourceOutMs;
    clip.timelineStartMs = timelineStartMs;
    return { ok: true, extra: {} };
  });
}

export function splitClip(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; clipId: string; atMs: number },
): ToolResult<{ projectId: string; version: number; leftClipId: string; rightClipId: string }> {
  const rightClipId = newId();
  return edit(store, "splitClip", input.projectId, input.expectedVersion, (draft) => {
    const clip = findClip(draft, input.clipId);
    if (!clip) return { ok: false, error: domainError("NOT_FOUND", `Clip "${input.clipId}" was not found.`) };
    const start = clip.timelineStartMs;
    const end = clipTimelineEndMs(clip);
    if (input.atMs <= start || input.atMs >= end) {
      return {
        ok: false,
        error: domainError("INVALID_EDIT", `Split time ${input.atMs} ms is outside the clip interior ${start}–${end} ms.`),
      };
    }
    const leftDuration = input.atMs - start;
    const rightSourceIn = clip.sourceInMs + leftDuration;
    draft.clips.push({
      id: rightClipId,
      trackId: clip.trackId,
      mediaId: clip.mediaId,
      name: clip.name,
      timelineStartMs: input.atMs,
      sourceInMs: rightSourceIn,
      sourceOutMs: clip.sourceOutMs,
    });
    clip.sourceOutMs = clip.sourceInMs + leftDuration;
    return { ok: true, extra: { leftClipId: clip.id, rightClipId } };
  });
}

export function undo(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number },
): ToolResult<{ projectId: string; version: number }> {
  const session = store.sessions.get(input.projectId);
  if (!session) return fail("undo", "NOT_FOUND", `Project "${input.projectId}" was not found.`);
  if (session.project.version !== input.expectedVersion) {
    return fail(
      "undo",
      "VERSION_CONFLICT",
      `The project is at version ${session.project.version}. This edit was based on version ${input.expectedVersion}.`,
      { expectedVersion: input.expectedVersion, actualVersion: session.project.version },
    );
  }
  const previous = session.undo.pop();
  if (!previous) return fail("undo", "INVALID_EDIT", "Nothing to undo.");
  session.redo.push(structuredClone(session.project));
  const restored = structuredClone(previous);
  restored.version = session.project.version + 1;
  session.project = restored;
  return { ok: true, tool: "undo", output: { projectId: input.projectId, version: restored.version } };
}

export function redo(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number },
): ToolResult<{ projectId: string; version: number }> {
  const session = store.sessions.get(input.projectId);
  if (!session) return fail("redo", "NOT_FOUND", `Project "${input.projectId}" was not found.`);
  if (session.project.version !== input.expectedVersion) {
    return fail(
      "redo",
      "VERSION_CONFLICT",
      `The project is at version ${session.project.version}. This edit was based on version ${input.expectedVersion}.`,
      { expectedVersion: input.expectedVersion, actualVersion: session.project.version },
    );
  }
  const next = session.redo.pop();
  if (!next) return fail("redo", "INVALID_EDIT", "Nothing to redo.");
  session.undo.push(structuredClone(session.project));
  const restored = structuredClone(next);
  restored.version = session.project.version + 1;
  session.project = restored;
  return { ok: true, tool: "redo", output: { projectId: input.projectId, version: restored.version } };
}

export function createCheckpoint(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; label: string },
): ToolResult<{ projectId: string; version: number; checkpointId: string; label: string }> {
  const session = store.sessions.get(input.projectId);
  if (!session) return fail("createCheckpoint", "NOT_FOUND", `Project "${input.projectId}" was not found.`);
  if (session.project.version !== input.expectedVersion) {
    return fail(
      "createCheckpoint",
      "VERSION_CONFLICT",
      `The project is at version ${session.project.version}. This edit was based on version ${input.expectedVersion}.`,
      { expectedVersion: input.expectedVersion, actualVersion: session.project.version },
    );
  }
  const checkpoint: Checkpoint = {
    id: newId(),
    label: input.label,
    createdAtVersion: session.project.version,
    project: structuredClone(session.project),
  };
  session.checkpoints.push(checkpoint);
  return {
    ok: true,
    tool: "createCheckpoint",
    output: {
      projectId: input.projectId,
      version: session.project.version,
      checkpointId: checkpoint.id,
      label: checkpoint.label,
    },
  };
}

export function restoreCheckpoint(
  store: EditorStore,
  input: { projectId: string; expectedVersion: number; checkpointId: string },
): ToolResult<{ projectId: string; version: number }> {
  const session = store.sessions.get(input.projectId);
  if (!session) return fail("restoreCheckpoint", "NOT_FOUND", `Project "${input.projectId}" was not found.`);
  if (session.project.version !== input.expectedVersion) {
    return fail(
      "restoreCheckpoint",
      "VERSION_CONFLICT",
      `The project is at version ${session.project.version}. This edit was based on version ${input.expectedVersion}.`,
      { expectedVersion: input.expectedVersion, actualVersion: session.project.version },
    );
  }
  const checkpoint = session.checkpoints.find((item) => item.id === input.checkpointId);
  if (!checkpoint) {
    return fail("restoreCheckpoint", "NOT_FOUND", `Checkpoint "${input.checkpointId}" was not found.`);
  }
  const restored = structuredClone(checkpoint.project);
  restored.id = session.project.id;
  restored.version = session.project.version + 1;
  session.undo.push(structuredClone(session.project));
  session.redo = [];
  session.project = restored;
  return {
    ok: true,
    tool: "restoreCheckpoint",
    output: { projectId: input.projectId, version: restored.version },
  };
}
