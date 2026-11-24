# Implementation plan

The long-term spec is the verbatim copy in `MASTER_BUILD_BRIEF.md` (SHA-256 `5d0a035c65ec7b27fd748fd0c6ae4f50178a6022df0d898488085a3520bd3eb9`). This plan describes the repository after Phase 1. It does not add requirements that are absent from the brief.

## Decision

Phase 0 inspected `JACKNlFE/Video-Generator` at `15a2dc3a21c9f6809ac65b1d2a3838989241eb58` and found a README-only repository. There was no editor to wrap.

Mark then chose a greenfield build in this repository. Phase 1 adds a small real editor and a tool registry that calls the same commands as the manual UI. Phases 2–7 are not started. No Anthropic, Fal, AssemblyAI, or OpenAI client is included. Sibling repositories (`Lyric-Video-Creator`, `Clipper-7.16.26`) were not copied.

## Current architecture

The app is a Vite + React page. Authoritative project state lives in an in-memory `EditorStore` in the browser session. There is no HTTP API, database, file upload, renderer, or login.

| Layer | What exists now |
| --- | --- |
| Frontend | `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`. Vite 6 dev server. |
| Editing commands | `src/editor/store.ts`. Pure document edits plus undo, redo, and checkpoints. |
| Tool registry | `src/editor/registry.ts`. Zod 3.25 input and output schemas, then the store functions. |
| UI binding | `src/editor/browserEditor.ts`. The page calls `executeTool` only. |
| Project document | Settings, media references, tracks, clips. Integer version. Millisecond times. UUID ids. |
| History | Undo and redo stacks of document snapshots. Named checkpoints beside the document. |
| Database | None. Refreshing the page drops the store. |
| Media storage | References only: name, kind, duration. No bytes and no object storage. |
| Auth | None. No user or ownership check exists to enforce. |
| Rendering | None. The timeline draws clip blocks. It does not play or export pictures. |
| Deployment | None. `npm run dev` serves the page locally. |

A project document is:

- `settings.aspectRatio`: `16:9`, `9:16`, `1:1`, `4:5`, or `4:3`
- `settings.width` and `settings.height`: integers from 16 to 7680
- `settings.frameRate`: integer from 1 to 240
- `media[]`: `{ id, name, kind, durationMs }` with kind `video`, `audio`, or `image`
- `tracks[]`: `{ id, name, kind, index }` with kind `video` or `audio`
- `clips[]`: `{ id, trackId, mediaId, name, timelineStartMs, sourceInMs, sourceOutMs }`

Playback speed is 1, so a clip's timeline length is `sourceOutMs - sourceInMs`. New projects start at version 1 with tracks named Video 1 and Audio 1.

## How edits and project state work

`executeTool(store, name, input)` is the only mutation API.

1. Unknown tool names return `UNSUPPORTED` and do not touch the store.
2. Zod parses the input. Failure returns `VALIDATION` and does not touch the store. Objects are strict, so unknown fields fail instead of being ignored.
3. The store snapshots the session map, runs the command, and checks the output against that tool's Zod schema. A schema failure rolls the snapshot back and returns `INVALID_EDIT`.
4. Mutating commands require `projectId` and `expectedVersion`. A mismatch returns `VERSION_CONFLICT` with `expectedVersion` and `actualVersion`, and the document stays as it was.
5. A successful document edit copies the previous document onto the undo stack, clears redo, and increments `version`.
6. `undo` and `redo` also require the current version, move the opposite stack, and increment `version`. Restoring an old snapshot does not reuse the old version number.
7. `createCheckpoint` checks the version, stores a clone of the document, and does not increment `version`. `restoreCheckpoint` copies that document back, keeps the same project id, increments `version`, and can itself be undone. Checkpoints do not save the undo stack.

Domain failures use `NOT_FOUND` or `INVALID_EDIT`. They return before the document is replaced.

Clip rules:

- A video track accepts video or image references. An audio track accepts audio only.
- The source range must sit inside the media duration.
- Clips on the same track cannot overlap. Touching endpoints is allowed.
- Trimming the head shifts `timelineStartMs` by the same delta so the tail stays put.
- Split keeps the left clip id and appends a right clip. The split time must be strictly inside the clip.
- Removing a track also removes the clips on that track, as one undoable edit.

## Reusable surface

The UI and the tests both call `executeTool`. Store functions are not called from React. Supported names are `listSupportedTools()`:

`createProject`, `inspectProject`, `inspectTimeline`, `setAspectRatio`, `setResolution`, `setFrameRate`, `registerMedia`, `addTrack`, `removeTrack`, `addClip`, `removeClip`, `moveClip`, `trimClip`, `splitClip`, `undo`, `redo`, `createCheckpoint`, `restoreCheckpoint`.

`registerMedia` is the extra command that makes media references exist. It does not upload a file. `importMedia` is unsupported.

## Missing functionality relative to the brief

| Brief section | Status | What Phase 1 actually has |
| --- | --- | --- |
| 1. Manual editor plus autonomous AI production | Partial | Manual edits of the Phase 1 timeline exist. No autonomous production. |
| 2. Preserve an existing editor | Partial | The checkout had no editor. This phase added one instead of importing another repo. |
| 3. Modular production architecture | Partial | Typed editor commands exist. The other modules do not. |
| 4. Model routing and agents | Missing | No model client and no agent loop. |
| 5. Tool registry | Partial | The tools listed above are real. Generation, captions, effects, transitions, and export are unsupported and fail. |
| 6. Production plans | Missing | |
| 7. Generative video | Missing | No Fal client and no invented endpoints. |
| 8. Generative image | Missing | |
| 9. Captions and transcription | Missing | |
| 10. Audio analysis | Missing | |
| 11. Media intelligence | Missing | |
| 12. Timeline, versions, undo | Partial | Multiple video and audio tracks, clip edits, monotonic versions, undo, redo, checkpoints. No effects, transitions, keyframes, lock, mute, or server concurrency. |
| 13. AI assistant and caption panel | Missing | The page is the manual editor only. |
| 14. Database and object storage | Missing | In-memory store only. No migration. |
| 15. Background jobs | Missing | |
| 16. Budgets | Missing | |
| 17. Credentials and auth | Missing | No secrets are required. No user model. |
| 18. Preview and export | Missing | |
| 19. Tests | Partial | Registry unit tests cover edits, validation, conflicts, undo, and checkpoints. No provider or end-to-end harness is in the repo. |
| 20. Phases | Partial | Phase 0 and Phase 1 are done. Phases 2–7 are not started. |
| 21. Full acceptance workflow | Missing | |
| 22. Operational docs | Partial | This plan and `IMPLEMENTATION_PROGRESS.md`. No provider or deployment guide, because those integrations are not enabled. |

## Limits that matter for a later agent

- The store is the page session. A reload starts a new project.
- There is no authorization layer. Tools that know a project id can edit it.
- A tool cannot see pixels, audio samples, or a rendered frame.
- Aspect ratio and pixel size are separate fields. Changing one does not rewrite the other.
- Frame rate must be an integer. `23.976` fails validation.
- Times are capped at 24 hours (`86_400_000` ms).

## Material decisions

1. Greenfield in this repo, after the empty checkout. The brief still assumes an existing product; the plan records that conflict instead of rewriting `MASTER_BUILD_BRIEF.md`.
2. One in-memory document, not a second timeline beside a database that does not exist.
3. Zod 3 (`zod` 3.25.76) for every tool input and output. The package stays on 3.x.
4. `registerMedia` is part of the foundation because a clip has to point at a media id. File import, generation, captions, and export are refused.
5. Version numbers only increase, including on undo, redo, and checkpoint restore, so a stale caller cannot apply an edit to the wrong document.
6. No auth was invented. Adding a fake user would report a control that does not exist.
7. No provider SDK, endpoint, model id, or price was added.

## Phases

### Phase 0 — Repository audit

Acceptance: the three markdown files exist, the brief copy matches the source byte-for-byte, and the plan matches the tree that was inspected.

Status: met before the greenfield code. The brief file is still the verbatim copy.

### Phase 1 — Programmatic editing foundation

Acceptance:

- The registry exposes the editing operations the manual page can perform, and the page calls that registry.
- Each supported tool has a Zod input schema and a Zod output schema.
- Invalid input and unknown tool names return a structured error and leave the document unchanged.
- Unsupported operations are not reported as success.
- Mutations check `expectedVersion`.
- Undo, redo, create checkpoint, and restore checkpoint work, and tests cover them without a model.
- The page can create a project, change settings, register media, add and remove tracks, and add, move, trim, split, and remove clips.

Status: met. See `IMPLEMENTATION_PROGRESS.md` for the commands that were run.

### Phase 2 — Single-agent autonomous editing

Not started. Next work, when requested: call a configured Anthropic model through a server-side key, inspect a project with the existing tools, and run a tool loop that uses `executeTool`. Model ids have to be checked against current docs and the account before they are written down. No client is added in this phase.

### Phase 3 — Automatic captions and audio intelligence

Not started. Outline from brief section 20: AssemblyAI, word times, editable captions, styling, subtitle export, lyric mode, optional vocal isolation and alignment, beat detection, then tools for those operations. Provider model ids stay unverified until that phase.

### Phase 4 — Generative media

Not started. Outline: Fal video and image generation, a capability registry filled from provider docs, async jobs, and stored assets placed with the existing clip commands. No endpoints are chosen here.

### Phase 5 — Multi-agent orchestration

Not started. Outline: creative plan, execution, review, and Fast / Advanced / Maximum routing. Brief section 4.4 says to keep a single agent until the tools are in use.

### Phase 6 — Automated review and optimization

Not started. Outline: sampled frames, deterministic checks, bounded revisions, and measured routing. No claim is made that a model watched a video.

### Phase 7 — Production hardening

Not started. Outline: auth, jobs, budgets, deployment, and the section 21 workflow.

## Run locally

```text
npm install
npm test
npm run typecheck
npm run dev
```

`npm run dev` serves the editor at `http://127.0.0.1:5173/`.
