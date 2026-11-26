import { useEffect, useState, type FormEvent } from "react";
import { browserEditor, ensureProject, rememberProject } from "./editor/browserEditor";
import { executeTool } from "./editor/registry";
import type { ProjectView, TimelineView } from "./editor/schema";
import type { ToolError, ToolResult } from "./editor/store";

function formatError(error: ToolError): string {
  const issues = error.details?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { path?: string; message?: string };
    const where = first.path ? `${first.path}: ` : "";
    return `${error.code}: ${where}${first.message ?? error.message}`;
  }
  return `${error.code}: ${error.message}`;
}

function formatClock(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const remain = ms % 1_000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(remain).padStart(3, "0")}`;
}

function idFrom(output: unknown, fallback: string | null): string | null {
  if (!output || typeof output !== "object") return fallback;
  if ("projectId" in output && typeof output.projectId === "string") return output.projectId;
  if ("project" in output && output.project && typeof output.project === "object" && "id" in output.project) {
    const id = output.project.id;
    if (typeof id === "string") return id;
  }
  return fallback;
}

export function App() {
  const [view, setView] = useState<ProjectView | null>(null);
  const [timeline, setTimeline] = useState<TimelineView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled");
  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState("1080");
  const [frameRate, setFrameRate] = useState("30");
  const [mediaName, setMediaName] = useState("");
  const [mediaKind, setMediaKind] = useState<"video" | "audio" | "image">("video");
  const [mediaDuration, setMediaDuration] = useState("5000");
  const [trackName, setTrackName] = useState("");
  const [trackKind, setTrackKind] = useState<"video" | "audio">("video");
  const [clipMediaId, setClipMediaId] = useState("");
  const [clipTrackId, setClipTrackId] = useState("");
  const [clipStart, setClipStart] = useState("0");
  const [clipIn, setClipIn] = useState("0");
  const [clipOut, setClipOut] = useState("");
  const [moveStart, setMoveStart] = useState("0");
  const [trimIn, setTrimIn] = useState("0");
  const [trimOut, setTrimOut] = useState("0");
  const [splitAt, setSplitAt] = useState("0");
  const [checkpointLabel, setCheckpointLabel] = useState("Checkpoint");
  const [apiMode, setApiMode] = useState(false);
  const [assistantText, setAssistantText] = useState("");
  const [assistantNote, setAssistantNote] = useState<string | null>(null);

  async function postTool(name: string, input: unknown): Promise<ToolResult> {
    const response = await fetch("/api/editor/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, input }),
    });
    return response.json() as Promise<ToolResult>;
  }

  async function refresh(projectId: string, nextSelected?: string | null) {
    const inspected = apiMode ? await postTool("inspectProject", { projectId }) : executeTool(browserEditor, "inspectProject", { projectId });
    const timed = apiMode ? await postTool("inspectTimeline", { projectId }) : executeTool(browserEditor, "inspectTimeline", { projectId });
    if (!inspected.ok) {
      setError(formatError(inspected.error));
      return;
    }
    if (!timed.ok) {
      setError(formatError(timed.error));
      return;
    }
    const projectView = inspected.output as ProjectView;
    const timelineView = timed.output as TimelineView;
    setView(projectView);
    setTimeline(timelineView);
    setWidth(String(projectView.project.settings.width));
    setHeight(String(projectView.project.settings.height));
    setFrameRate(String(projectView.project.settings.frameRate));
    const clips = timelineView.tracks.flatMap((track) => track.clips);
    setSelectedClipId((current) => {
      const candidate = nextSelected === undefined ? current : nextSelected;
      return clips.some((clip) => clip.id === candidate) ? candidate : null;
    });
  }

  async function run(tool: string, input: unknown, success: string, nextSelected?: string | null): Promise<unknown> {
    const result = apiMode ? await postTool(tool, input) : executeTool(browserEditor, tool, input);
    if (!result.ok) {
      setStatus(null);
      setError(formatError(result.error));
      const projectId = view?.project.id ?? null;
      if (projectId) await refresh(projectId);
      return null;
    }
    setError(null);
    setStatus(success);
    const projectId = idFrom(result.output, view?.project.id ?? null);
    if (projectId) {
      rememberProject(projectId);
      await refresh(projectId, nextSelected);
    }
    return result.output;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await fetch("/api/health");
        if (!health.ok) throw new Error("offline");
        const created = await postTool("createProject", { name: projectName.trim() || "Untitled" });
        if (cancelled || !created.ok) throw new Error("create");
        const createdView = created.output as ProjectView;
        setApiMode(true);
        rememberProject(createdView.project.id);
        const timed = await postTool("inspectTimeline", { projectId: createdView.project.id });
        if (!cancelled && timed.ok) {
          setView(createdView);
          setTimeline(timed.output as TimelineView);
        }
      } catch {
        if (cancelled) return;
        const created = ensureProject(projectName.trim() || "Untitled");
        if (!created.ok) {
          setError(formatError(created.error));
          return;
        }
        rememberProject(created.output.project.id);
        const inspected = executeTool(browserEditor, "inspectProject", { projectId: created.output.project.id });
        const timed = executeTool(browserEditor, "inspectTimeline", { projectId: created.output.project.id });
        if (inspected.ok) setView(inspected.output as ProjectView);
        if (timed.ok) setTimeline(timed.output as TimelineView);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The page boots once. Later project switches go through New project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const project = view?.project ?? null;
  const selected = timeline?.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setMoveStart(String(selected.timelineStartMs));
    setTrimIn(String(selected.sourceInMs));
    setTrimOut(String(selected.sourceOutMs));
    const midpoint = selected.timelineStartMs + Math.floor((selected.sourceOutMs - selected.sourceInMs) / 2);
    setSplitAt(String(midpoint));
  }, [selected]);

  async function onNewProject(event: FormEvent) {
    event.preventDefault();
    const output = await run("createProject", { name: projectName.trim() || "Untitled" }, "Created a project.", null);
    if (output && typeof output === "object" && "project" in output) {
      const id = idFrom(output, null);
      if (id) rememberProject(id);
    }
  }

  function onAddMedia(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    run("registerMedia", {
      projectId: project.id,
      expectedVersion: project.version,
      name: mediaName,
      kind: mediaKind,
      durationMs: Number(mediaDuration),
    }, "Registered a media reference.");
    setMediaName("");
  }

  function onAddTrack(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    run("addTrack", {
      projectId: project.id,
      expectedVersion: project.version,
      name: trackName,
      kind: trackKind,
    }, "Added a track.");
    setTrackName("");
  }

  async function onAddClip(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    const payload: Record<string, unknown> = {
      projectId: project.id,
      expectedVersion: project.version,
      trackId: clipTrackId,
      mediaId: clipMediaId,
      timelineStartMs: Number(clipStart),
      sourceInMs: Number(clipIn),
    };
    if (clipOut.trim() !== "") payload.sourceOutMs = Number(clipOut);
    const output = await run("addClip", payload, "Added a clip.");
    if (output && typeof output === "object" && "clipId" in output && typeof output.clipId === "string") {
      refresh(project.id, output.clipId);
    }
  }

  const span = Math.max(timeline?.durationMs ?? 0, 10_000);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Video Generator</h1>
          <p>
            Manual timeline editor. When the API is running, this page and the assistant share that project. Without the API, edits stay in this browser tab.
          </p>
        </div>
        <form className="history" onSubmit={(event) => {
          event.preventDefault();
          if (!project) return;
          const text = `${assistantText} project:${project.id}${selectedClipId ? ` clip:${selectedClipId}` : ""}`;
          void fetch("/api/agent/turns", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectId: project.id, text }),
          }).then(async (response) => {
            if (!response.ok) {
              setAssistantNote("The API is not running. The manual editor on this page still works.");
              return;
            }
            const body = await response.json() as { configured?: boolean; liveVerified?: boolean; text?: string };
            if (body.configured === false) {
              setAssistantNote("The assistant is not configured.");
              return;
            }
            setAssistantNote(body.liveVerified ? (body.text || "Claude updated the project.") : "The assistant is SDK-backed and has not been live-verified.");
            if (apiMode) await refresh(project.id);
          }).catch(() => setAssistantNote("The API is not running. The manual editor on this page still works."));
        }}>
          <label>
            Assistant
            <input value={assistantText} onChange={(event) => setAssistantText(event.target.value)} placeholder="Select a clip, then ask for a glow" data-testid="assistant-text" />
          </label>
          <button type="submit">Ask</button>
          {assistantNote ? <p className="hint">{assistantNote}</p> : null}
        </form>
        <div className="history">
          <span className="version" data-testid="version">
            Version {project?.version ?? "—"}
          </span>
          <button type="button" data-testid="undo" disabled={!view?.history.canUndo} onClick={() => project && run("undo", { projectId: project.id, expectedVersion: project.version }, "Undid the last edit.")}>
            Undo
          </button>
          <button type="button" data-testid="redo" disabled={!view?.history.canRedo} onClick={() => project && run("redo", { projectId: project.id, expectedVersion: project.version }, "Redid the edit.")}>
            Redo
          </button>
        </div>
      </header>

      {error ? <p className="banner error" role="alert" data-testid="error">{error}</p> : null}
      {status ? <p className="banner status" role="status" data-testid="status">{status}</p> : null}

      <div className="settings">
        <form className="row" onSubmit={onNewProject}>
          <label>
            New project name
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} data-testid="project-name" />
          </label>
          <button type="submit">New project</button>
        </form>
        <label>
          Aspect ratio
          <select
            aria-label="Aspect ratio"
            value={project?.settings.aspectRatio ?? "16:9"}
            onChange={(event) => {
              if (!project) return;
              run("setAspectRatio", {
                projectId: project.id,
                expectedVersion: project.version,
                aspectRatio: event.target.value,
              }, "Changed the aspect ratio.");
            }}
          >
            {["16:9", "9:16", "1:1", "4:5", "4:3"].map((ratio) => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
        </label>
        <label>
          Width
          <input inputMode="numeric" value={width} onChange={(event) => setWidth(event.target.value)} data-testid="width" />
        </label>
        <label>
          Height
          <input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} data-testid="height" />
        </label>
        <button
          type="button"
          onClick={() => project && run("setResolution", {
            projectId: project.id,
            expectedVersion: project.version,
            width: Number(width),
            height: Number(height),
          }, "Changed the resolution.")}
        >
          Apply resolution
        </button>
        <label>
          Frame rate
          <input inputMode="numeric" value={frameRate} onChange={(event) => setFrameRate(event.target.value)} data-testid="frame-rate" />
        </label>
        <button
          type="button"
          onClick={() => project && run("setFrameRate", {
            projectId: project.id,
            expectedVersion: project.version,
            frameRate: Number(frameRate),
          },           "Changed the frame rate.")}
        >
          Apply frame rate
        </button>
      </div>

      <div className="layout">
        <div className="stack">
          <section className="panel">
            <h2>Media references</h2>
            <p className="hint">No file is uploaded. A clip can use a reference up to its duration.</p>
            <ul className="list">
              {project?.media.map((media) => (
                <li key={media.id}>{media.name} · {media.kind} · {media.durationMs} ms</li>
              ))}
            </ul>
            <form className="form" onSubmit={onAddMedia}>
              <label>
                Name
                <input value={mediaName} onChange={(event) => setMediaName(event.target.value)} data-testid="media-name" required />
              </label>
              <label>
                Kind
                <select value={mediaKind} onChange={(event) => setMediaKind(event.target.value as typeof mediaKind)} data-testid="media-kind">
                  <option value="video">video</option>
                  <option value="audio">audio</option>
                  <option value="image">image</option>
                </select>
              </label>
              <label>
                Duration (ms)
                <input inputMode="numeric" value={mediaDuration} onChange={(event) => setMediaDuration(event.target.value)} data-testid="media-duration" />
              </label>
              <button type="submit" data-testid="add-media">Add media reference</button>
            </form>
          </section>

          <section className="panel">
            <h2>Tracks</h2>
            <form className="form" onSubmit={onAddTrack}>
              <label>
                Name
                <input value={trackName} onChange={(event) => setTrackName(event.target.value)} required />
              </label>
              <label>
                Kind
                <select value={trackKind} onChange={(event) => setTrackKind(event.target.value as typeof trackKind)}>
                  <option value="video">video</option>
                  <option value="audio">audio</option>
                </select>
              </label>
              <button type="submit">Add track</button>
            </form>
          </section>

          <section className="panel">
            <h2>Checkpoints</h2>
            <ul className="list">
              {view?.history.checkpoints.map((checkpoint) => (
                <li key={checkpoint.id}>
                  {checkpoint.label} · v{checkpoint.createdAtVersion}{" "}
                  <button
                    type="button"
                    onClick={() => project && run("restoreCheckpoint", {
                      projectId: project.id,
                      expectedVersion: project.version,
                      checkpointId: checkpoint.id,
                    }, "Restored the checkpoint.")}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!project) return;
                run("createCheckpoint", {
                  projectId: project.id,
                  expectedVersion: project.version,
                  label: checkpointLabel,
                }, "Saved a checkpoint.");
              }}
            >
              <label>
                Label
                <input value={checkpointLabel} onChange={(event) => setCheckpointLabel(event.target.value)} data-testid="checkpoint-label" />
              </label>
              <button type="submit" data-testid="save-checkpoint">Save checkpoint</button>
            </form>
          </section>
        </div>

        <div className="stack">
          <section className="timeline" data-testid="timeline">
            <h2>{project?.name ?? "Timeline"} · {formatClock(timeline?.durationMs ?? 0)}</h2>
            <div className="ruler" aria-hidden="true">
              <span>0:00</span>
              <span>{formatClock(span)}</span>
            </div>
            {timeline?.tracks.map((track) => (
              <div className="track" key={track.id}>
                <div className="track-label">
                  <strong>{track.name}</strong>
                  <span>{track.kind}</span>
                  <button
                    type="button"
                    onClick={() => project && run("removeTrack", {
                      projectId: project.id,
                      expectedVersion: project.version,
                      trackId: track.id,
                    }, "Removed the track.")}
                  >
                    Remove
                  </button>
                </div>
                <div className="lane">
                  {track.clips.map((clip) => {
                    const duration = clip.sourceOutMs - clip.sourceInMs;
                    const left = (clip.timelineStartMs / span) * 100;
                    const width = Math.max((duration / span) * 100, 1.5);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        className={clip.id === selectedClipId ? "clip selected" : "clip"}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        data-testid={`clip-${clip.id}`}
                        onClick={() => setSelectedClipId(clip.id)}
                      >
                        {clip.name}
                        <small>{clip.timelineStartMs} ms</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <form className="form" onSubmit={onAddClip}>
              <label>
                Media
                <select value={clipMediaId} onChange={(event) => setClipMediaId(event.target.value)} data-testid="clip-media">
                  <option value="">Choose media</option>
                  {project?.media.map((media) => (
                    <option key={media.id} value={media.id}>{media.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Track
                <select value={clipTrackId} onChange={(event) => setClipTrackId(event.target.value)} data-testid="clip-track">
                  <option value="">Choose track</option>
                  {project?.tracks.map((track) => (
                    <option key={track.id} value={track.id}>{track.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Timeline start (ms)
                <input inputMode="numeric" value={clipStart} onChange={(event) => setClipStart(event.target.value)} data-testid="clip-start" />
              </label>
              <label>
                Source in (ms)
                <input inputMode="numeric" value={clipIn} onChange={(event) => setClipIn(event.target.value)} />
              </label>
              <label>
                Source out (ms, optional)
                <input inputMode="numeric" value={clipOut} onChange={(event) => setClipOut(event.target.value)} data-testid="clip-out" />
              </label>
              <button type="submit" data-testid="add-clip">Add clip</button>
            </form>
          </section>

          <section className="inspector">
            <h2>Clip</h2>
            {selected && project ? (
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <p className="hint">{selected.name} on timeline at {selected.timelineStartMs} ms, source {selected.sourceInMs}–{selected.sourceOutMs} ms.</p>
                <label>
                  Move to (ms)
                  <input inputMode="numeric" value={moveStart} onChange={(event) => setMoveStart(event.target.value)} data-testid="move-start" />
                </label>
                <button
                  type="button"
                  data-testid="move-clip"
                  onClick={() => run("moveClip", {
                    projectId: project.id,
                    expectedVersion: project.version,
                    clipId: selected.id,
                    timelineStartMs: Number(moveStart),
                  }, "Moved the clip.", selected.id)}
                >
                  Move clip
                </button>
                <label>
                  Trim in (ms)
                  <input inputMode="numeric" value={trimIn} onChange={(event) => setTrimIn(event.target.value)} data-testid="trim-in" />
                </label>
                <label>
                  Trim out (ms)
                  <input inputMode="numeric" value={trimOut} onChange={(event) => setTrimOut(event.target.value)} data-testid="trim-out" />
                </label>
                <button
                  type="button"
                  data-testid="trim-clip"
                  onClick={() => run("trimClip", {
                    projectId: project.id,
                    expectedVersion: project.version,
                    clipId: selected.id,
                    sourceInMs: Number(trimIn),
                    sourceOutMs: Number(trimOut),
                  }, "Trimmed the clip.", selected.id)}
                >
                  Trim clip
                </button>
                <label>
                  Split at timeline ms
                  <input inputMode="numeric" value={splitAt} onChange={(event) => setSplitAt(event.target.value)} data-testid="split-at" />
                </label>
                <button
                  type="button"
                  data-testid="split-clip"
                  onClick={() => run("splitClip", {
                    projectId: project.id,
                    expectedVersion: project.version,
                    clipId: selected.id,
                    atMs: Number(splitAt),
                  }, "Split the clip.", selected.id)}
                >
                  Split clip
                </button>
                <button
                  type="button"
                  data-testid="remove-clip"
                  onClick={() => run("removeClip", {
                    projectId: project.id,
                    expectedVersion: project.version,
                    clipId: selected.id,
                  }, "Removed the clip.", null)}
                >
                  Remove clip
                </button>
              </form>
            ) : (
              <p className="hint">Select a clip on the timeline to move, trim, split, or remove it.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
