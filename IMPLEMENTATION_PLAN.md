# Implementation plan

Audit of `JACKNlFE/Video-Generator` at commit `15a2dc3a21c9f6809ac65b1d2a3838989241eb58` (`main`, fetched from `origin` on 24 Nov 2026 and identical to `HEAD`). The long-term spec is the verbatim copy in `MASTER_BUILD_BRIEF.md` (source checksum `5d0a035c65ec7b27fd748fd0c6ae4f50178a6022df0d898488085a3520bd3eb9`, 1290 lines). This plan describes that checkout. It does not add requirements that are absent from the brief.

## Decision

Phase 0 is documentation of the checkout. Phase 1 is not implemented in this change.

The checkout is a one-file repository. It does not contain a video editor, editing commands, project state, timeline model, media pipeline, database, authentication, or deployment configuration. Brief section 2 and the Phase 1 assignment both require wrapping the operations the existing manual editor already uses. There is no such surface to wrap. Scaffolding a replacement editor would violate that constraint, so no application code, dependencies, schema, or editor UI is added here.

## Current architecture

Evidence is the full tree of the checkout:

| Path | Size | Role |
| --- | --- | --- |
| `README.md` | 18 bytes | The single line `# Video-Generator` |
| `.git` | git metadata | History is one commit, message `Initial commit`, author date Tue 24 Nov 2026 1:42 AM CT |

There is no `package.json`, lockfile, `tsconfig`, source directory, test directory, CI workflow, `Dockerfile`, `vercel.json`, environment example, database migration, or server entrypoint.

| Layer | What the checkout contains |
| --- | --- |
| Frontend | No UI, routes, components, or bundler config. |
| Backend | No HTTP server, API routes, or job worker. |
| Database | No schema, ORM, connection string usage, or migration files. |
| Rendering | No preview, compositor, FFmpeg invocation, or export code. |
| Timeline representation | No track, clip, caption, keyframe, or project document type. |
| Media storage | No object-storage client, upload handler, or local media directory. |
| Auth | No session, user, or project-ownership check. |
| Deployment | No platform config and no recorded production URL in the repository. |

GitHub repository metadata observed for this repo: public, default branch `main`, language unset, size 0, created 24 Nov 2026 1:41 AM CT, description "Full stack video generation app". That description is metadata only. The tree does not implement it.

## Existing editing functionality

The checkout has no editing operations and no project state.

- Edits cannot be applied, persisted, undone, or replayed, because there is no command, reducer, store, or document format.
- There is no manual UI workflow to preserve.
- There are no reusable editor components in this repository.

A filename inventory of other repositories visible on the same GitHub account is recorded only so a later session can see where an editor might live. Those repositories were not cloned, not read as source, and are not this checkout:

- `JACKNlFE/Lyric-Video-Creator` (private). Tree names include `src/components/Timeline.tsx`, `PreviewStage.tsx`, `SpliceEditor.tsx`, `Inspector.tsx`, `Library.tsx`, `src/state/store.tsx`, `src/lib/compositor.ts`, `src/lib/exportVideo.ts`, `src/lib/transcribe.ts`, `src/lib/db.ts`.
- `JACKNlFE/Clipper-7.16.26` (private). Tree names are `index.html`, `app.js`, `server.js`, `styles.css`, `package.json`.

Neither tree was treated as the architecture of Video-Generator.

## Missing functionality relative to the brief

Status is against this checkout only. "Satisfied" means the checkout already does the section. "Partial" means some documentary or structural piece exists and the behavior does not. "Missing" means the checkout has none of the behavior.

| Brief section | Status | Evidence in this checkout |
| --- | --- | --- |
| 1. Project objective (manual editor plus autonomous AI production, editable timeline) | Missing | No application. |
| 2. Preserve the existing editor | Partial | The audit was done. There is no editor behavior to preserve. |
| 3. Modular production architecture | Missing | No modules. |
| 4. Anthropic model routing, creative director, execution agent, QA reviewer, Fast / Advanced / Maximum modes | Missing | No SDK, model registry, or agent loop. |
| 5. Programmatic editing tool registry | Missing | No editing commands to register. Phase 1 stops here. |
| 6. Versioned production plans | Missing | No schema and no persistence. |
| 7. Fal.ai video generation and provider abstraction | Missing | No provider client. Endpoints, models, and prices are not invented here. |
| 8. Fal.ai image generation | Missing | Same as section 7. |
| 9. AssemblyAI / OpenAI captions, lyric mode, vocal isolation, caption model, styling, export | Missing | No media pipeline. |
| 10. Deterministic audio analysis | Missing | No FFmpeg, Librosa, or waveform code. |
| 11. Media intelligence and contact sheets | Missing | No asset analysis. |
| 12. Authoritative timeline, ids, version checks, undo, checkpoints | Missing | No timeline. |
| 13. AI assistant UI and captioning panel | Missing | No UI. |
| 14. PostgreSQL / Neon / Drizzle and object storage, or reuse of an existing store | Missing | No database and no storage. |
| 15. Durable background jobs and media workers | Missing | No queue and no worker. |
| 16. Budget reservation and usage reconciliation | Missing | No usage records. |
| 17. Server-side credentials, authz, signed URLs, validation, audit logs | Missing | No server. No `.env.example`, because no integration is enabled. |
| 18. Deterministic validation, preview, and export | Missing | No renderer. |
| 19. Unit, integration, and end-to-end tests; caption benchmarks; model benchmarks | Missing | No test runner. Commands recorded in `IMPLEMENTATION_PROGRESS.md`. |
| 20. Phases 0–7 | Partial | Phase 0 is this document. Phases 1–7 have no code. |
| 21. End-to-end acceptance workflow | Missing | No user-facing app. |
| 22. Operational documentation | Partial | The brief, this plan, and the progress log exist. Install, credentials, migrations, workers, and deployment docs have no application to describe. |

Illustrative tool names in brief section 5 (create project, trim clip, captions, export, and the rest of that list) are unsupported. None of them are reported as implemented.

## Architectural limitations for AI-controlled editing

An agent in this repository has no authoritative project to read or write.

- There is no command API shared with a manual UI, so a tool call cannot stay consistent with a human edit.
- There is no project version, transaction boundary, undo stack, or checkpoint to attach to a tool result.
- There is no user or project-ownership check to enforce.
- There is no media library, timeline, or renderer for a tool to inspect.
- Adding a parallel timeline or a fake tool that returns success would contradict brief sections 5 and 12.

## Required infrastructure, once an editor is the checkout

Nothing below is created in this change. It is the brief's own later-phase list, held until the repository actually contains the editor those pieces must extend.

- File and folder changes now: `MASTER_BUILD_BRIEF.md`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PROGRESS.md` only.
- Database migrations: none. There is no schema to migrate.
- Providers: none enabled. Anthropic, Fal.ai, AssemblyAI, and OpenAI stay unwired. Model ids, endpoints, parameters, and prices are not recorded, because they were not verified against live accounts or docs in this phase.
- Dependencies: none added. The checkout has no package manifest to extend.
- Background workers, object storage, and budget tables: required by brief sections 14–16 for later phases, and blocked on the same missing editor.

## Material decisions

1. The brief was copied byte-for-byte into `MASTER_BUILD_BRIEF.md` and left unchanged. It still assumes an existing editor. That assumption is false for this checkout, and the plan records the conflict instead of rewriting the spec.
2. Phase 1's tool registry, Zod (or equivalent) schemas, project-state access, and undo/checkpoints were not built. A registry needs existing editing functions. This checkout has none, and the brief says to reuse them rather than replace the editor.
3. Sibling repositories that look editor-shaped were not imported. Merging `Lyric-Video-Creator` or `Clipper-7.16.26` into this repo would be a new product decision, and their source was not audited.
4. No destructive migration is proposed, because there is no database.

## Phases

Only Phase 0 is done. Phase 1 was in scope and is blocked. Phases 2–7 are outlines from brief section 20. They are not scheduled work and are not implemented.

### Phase 0 — Repository audit

Acceptance:

- `MASTER_BUILD_BRIEF.md`, `IMPLEMENTATION_PLAN.md`, and `IMPLEMENTATION_PROGRESS.md` exist in the repository.
- `MASTER_BUILD_BRIEF.md` matches the store brief byte-for-byte.
- This plan describes the real tree: one README, one commit, no editor.
- No application behavior is changed.

Status: met by this change.

### Phase 1 — Programmatic editing foundation

From brief section 20, the required work is:

- Create the editing tool registry.
- Connect tools to existing editing commands.
- Implement schema validation.
- Implement authoritative project state access.
- Implement undo and checkpoints, reusing an existing history system when one exists.
- Verify AI-independent programmatic editing with tests.

Acceptance, carried from the assignment and brief sections 5 and 12:

- Every exposed tool calls an editing operation that already exists in the manual editor.
- Each tool has a typed input schema and a typed output schema.
- Invalid input returns a structured error and does not mutate state.
- Unsupported operations return a structured error and are never reported as success.
- Reads and writes go through the editor's authoritative project state.
- Writes check project version where the editor has a version.
- Writes are undoable where the editor already supports undo, and checkpoints reuse that history system.
- Authorization and project ownership use the editor's existing checks.
- Tests exercise the tools without any language-model or generative-media call.
- Existing UI and workflows still run.

Status: not met. The checkout has no editing commands, project state, undo stack, authorization, test runner, or UI. Implementing the registry here would invent those systems. No tool is registered.

### Phase 2 — Single-agent autonomous editing

Outline only. Integrate the Anthropic SDK after the Phase 1 tools exist. Connect one execution model to those tools, add conversational editing and project inspection, and run a controlled tool loop. Acceptance from the brief: a natural-language edit runs end to end through the registry, and model identifiers come from server-side configuration after capability checks. Live Anthropic calls are out of scope until then.

### Phase 3 — Automatic captions and audio intelligence

Outline only. AssemblyAI as the primary transcription provider, an optional current OpenAI transcription fallback, word-level timestamps, editable caption tracks, styling, subtitle export, music and lyric modes, optional vocal isolation and forced alignment, and beat detection, then connect those tools to the editing agent. Acceptance from the brief: captions can be generated and edited without Claude. Provider model ids must be verified against current docs before they are coded. No caption provider is integrated now.

### Phase 4 — Generative media

Outline only. Fal.ai video and image generation behind a provider abstraction, a capability registry filled from provider documentation, async jobs, and persistent storage of generated assets on the timeline. Acceptance from the brief: generated assets are registered in the project media library and do not depend on temporary provider URLs. No Fal client is added now.

### Phase 5 — Multi-agent orchestration

Outline only. Fable for creative planning, Sonnet for execution, Opus for review, versioned production plans, and Fast / Advanced / Maximum routing. Acceptance from the brief: a mode does not call every model on every request, and plans validate against a schema. Not started. Brief section 4.4 says to begin with a single-agent workflow after the tools work.

### Phase 6 — Automated review and optimization

Outline only. Preview frames and contact sheets, deterministic project checks, optional model review using sampled evidence, bounded revision cycles, and measured routing. Acceptance from the brief: the system does not claim a model watched or heard a full video unless that model actually supports it. Not started.

### Phase 7 — Production hardening

Outline only. Security review, job reliability, backend budget enforcement, error handling, tests, deployment, and docs. Acceptance from the brief: credentials stay on the server, budgets are enforced in the backend, and the section 21 workflow can be repeated. Not started.

## What a later session needs before Phase 1

Point this repository at the existing editor, or check that editor out as the workspace. Then inventory its real commands and wrap those. Until that happens, Phase 1 has no implementation target in this repo.
