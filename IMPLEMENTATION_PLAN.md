# Implementation plan

The long-term spec is the verbatim copy in `MASTER_BUILD_BRIEF.md` (SHA-256 `5d0a035c65ec7b27fd748fd0c6ae4f50178a6022df0d898488085a3520bd3eb9`). This plan describes the repository after Stage 1. It does not add requirements that are absent from the brief.

Phase 2 has not been started.

## Decision

Phase 0 inspected `JACKNlFE/Video-Generator` at `15a2dc3a21c9f6809ac65b1d2a3838989241eb58` and found a README-only repository. There was no editor to wrap.

Mark then chose a greenfield build in this repository. Phase 1 added a small real editor and a tool registry that calls the same commands as the manual UI. Sibling repositories were not copied.

Stage 1, requested after Phase 1 had merged, adds the server-side provider, job, and budget foundation. It does not change `src/editor`. It does not call Anthropic, Fal, AssemblyAI, or OpenAI during tests, and it does not start the editing agent.

## Current architecture

The page is still the Vite + React editor. Authoritative editor state is still the in-memory `EditorStore` in the browser session. A separate Node process now holds provider configuration, jobs, and budgets.

| Layer | What exists now |
| --- | --- |
| Frontend | `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`. Vite 6. `envPrefix` is `VITE_PUBLIC_`. The page does not import `server/`. |
| Editing commands | `src/editor/store.ts`. Unchanged. |
| Tool registry | `src/editor/registry.ts`. Unchanged. Zod 3.25 input and output schemas. |
| UI binding | `src/editor/browserEditor.ts`. The page calls `executeTool` only. |
| Provider registry | `server/platform.ts` and `server/providers/`. Typed providers for language models, video, image, transcription, vocal separation, forced alignment, storage, jobs, rendering, and database. |
| Live clients | `server/providers/live.ts`. Official SDKs, loaded only when a live check runs. |
| Mocks | `server/providers/mocks.ts`. Not imported by the live registry. |
| Jobs | `server/persist.mjs`. SQLite via `node:sqlite`. Create, read, progress, cancel, retry, idempotency, webhook delivery, results, and structured errors. |
| Budgets | Same SQLite file. Reservations, a usage ledger, and limits. |
| HTTP | `server/http.ts`. `npm run server` listens on `127.0.0.1:8787` by default. |
| Editor database | None. Refreshing the page drops the editor store. |
| Media bytes | Local directory when R2 is incomplete. No bytes are stored by the editor. |
| Auth | None. |
| Rendering | The timeline still draws clip blocks. The render provider only queues a job. |

## Editor behavior that Stage 1 did not change

`executeTool(store, name, input)` is still the only editor mutation API. The supported names are still `listSupportedTools()`:

`createProject`, `inspectProject`, `inspectTimeline`, `setAspectRatio`, `setResolution`, `setFrameRate`, `registerMedia`, `addTrack`, `removeTrack`, `addClip`, `removeClip`, `moveClip`, `trimClip`, `splitClip`, `undo`, `redo`, `createCheckpoint`, `restoreCheckpoint`.

Unknown names return `UNSUPPORTED`. Zod failures return `VALIDATION` and do not touch the store. Mutations require `expectedVersion`. Undo, redo, and checkpoints behave as they did in Phase 1. `registerMedia` still does not upload a file. `importMedia` is unsupported.

Clip rules are unchanged: track kind must match the media kind, the source range must sit inside the media duration, clips on one track cannot overlap, a head trim keeps the tail put, split keeps the left id, and removing a track removes its clips.

## Provider platform

`createPlatform` builds one registry from `loadConfig(process.env)`. Missing keys do not throw. A blank model variable clears that role's documented default.

Selection is configuration-driven:

- Language roles are `creative`, `execution`, and `review`. The documented defaults are `claude-fable-5-2`, `claude-sonnet-5-5`, and `claude-opus-5-5`, from the Claude models overview checked on November 25, 2026. Fallbacks come only from the `*_FALLBACKS` variables. If a live model list marks an id unavailable, selection uses the next id that was not marked unavailable.
- Transcription `auto` uses AssemblyAI when its key is set, otherwise OpenAI. If every configured model for the first provider was reported unavailable, selection tries the other configured provider.
- Fal image and video models stay unset unless `FAL_IMAGE_MODEL` or `FAL_VIDEO_MODEL` is set. No endpoint id is invented.
- Storage selection is R2 when the four R2 credentials are all set, otherwise local disk.
- Job selection is SQLite. Trigger.dev can be verified and is not the queue.
- Database selection is SQLite. Neon can be verified with `SELECT 1` and is not the job store.
- Rendering selection is the local queue seam. It does not invoke FFmpeg.

Health reports use only: `not configured`, `configured but unverified`, `connected and verified`, `connection failed`, `insufficient permissions`, `unavailable model or capability`.

Verified prices are the Claude base rates, the documented 50% batch discount, and the documented cache-read percentages for Fable 5.2, Opus 5.5, and Sonnet 5.5. Cache writes are not stored. Haiku's "from" price is not stored. Fal, AssemblyAI, OpenAI, R2, Neon, and Trigger prices are not stored. A paid reservation without a verified price and without an explicit positive estimate is refused.

## Jobs and budgets

`POST /jobs` writes a `queued` row and returns 202 with `runsInsideRequest: false`. It does not call a provider and does not call `dispatchToMediaWorker`. Dispatch is a separate function that POSTs to `MEDIA_WORKER_URL` only when that URL and `MEDIA_WORKER_SECRET` are both set.

Statuses are `pending`, `queued`, `processing`, `awaiting_approval`, `completed`, `failed`, and `cancelled`. Cancel and retry are stored transitions. Webhook deliveries are unique on provider plus delivery id. A cancelled job does not become completed when a later webhook arrives.

Fal signatures follow the current Fal webhook doc (JWKS, Ed25519, ±300 seconds). AssemblyAI uses the documented shared header, not an HMAC. The media worker uses an HMAC defined in `API_SETUP.md`.

Budget checks run inside `BEGIN IMMEDIATE`. A second reservation that would pass a configured UTC daily, monthly, project, or run limit inserts nothing. Unset limits are not enforced.

## Missing functionality relative to the brief

| Brief section | Status | What the repo actually has |
| --- | --- | --- |
| 1. Manual editor plus autonomous AI production | Partial | Manual Phase 1 timeline. No autonomous production. |
| 3. Modular production architecture | Partial | Typed provider interfaces and a registry. No agent and no generation call. |
| 4. Model routing and agents | Partial | Configurable model ids, fallbacks, and a health check. No agent loop and no Messages call. |
| 5. Tool registry | Partial | Phase 1 editing tools only. Generation, captions, effects, and export still return `UNSUPPORTED`. |
| 7–11. Generation, captions, audio analysis, media intelligence | Missing | Interfaces and env only. No submission and no FFmpeg. |
| 12. Timeline, versions, undo | Partial | Unchanged Phase 1 editor. |
| 14. Database and object storage | Partial | SQLite for jobs and budgets. Optional Neon and R2 clients. Editor state is still memory. |
| 15. Background jobs | Partial | Persistent local jobs, webhooks, and a worker seam. Trigger.dev is not the queue. No media is processed. |
| 16. Budgets | Partial | Ledger, verified Claude rates, and enforced limits. Other provider prices are unset. No user approval flow. |
| 17. Credentials | Partial | Server env, `.env.example`, and a Vite boundary. No user login. |
| 18. Preview and export | Missing | |
| 19. Tests | Partial | Editor registry tests plus provider, job, budget, HTTP, and bundle tests. |
| 20. Phases | Partial | Phase 0, Phase 1, and Stage 1 are done. Phase 2 is not started. |
| 21. Full acceptance workflow | Missing | |

## Material decisions

1. Greenfield editor in this repo, recorded in Phase 1. `MASTER_BUILD_BRIEF.md` was not rewritten.
2. Stage 1 does not import or change `src/editor`.
3. Jobs and budgets use `node:sqlite` so the process runs without Neon. Node 22 prints an experimental warning for that module.
4. Official SDKs are used for Anthropic, OpenAI, AssemblyAI, the Fal client configuration, the AWS S3 client for R2, and the Neon serverless driver. Fal's pricing check and Trigger's key check use the documented HTTP routes. `@trigger.dev/sdk` is not installed because no task is defined.
5. Documented Claude, AssemblyAI, and OpenAI model ids are defaults and can be cleared or replaced with env. Fal endpoint ids have no default.
6. Unset budget limits do not block startup and do not invent a cap. A configured cap is enforced in SQLite.
7. The local API has no user authentication and binds to `127.0.0.1` unless `HOST` is changed.

## Phases

### Phase 0 — Repository audit

Met before the editor code. The brief file is still the verbatim copy.

### Phase 1 — Programmatic editing foundation

Met. See `IMPLEMENTATION_PROGRESS.md`. Stage 1 did not change those files' behavior.

### Stage 1 — Provider and infrastructure foundation

Met. Server config, provider registry, live clients, mocks, SQLite jobs, webhooks, budgets, `API_SETUP.md`, and the tests recorded in `IMPLEMENTATION_PROGRESS.md`.

This is not Phase 2. No editing agent was added.

### Phase 2 — Single-agent autonomous editing

Not started. Next work, when requested: call a configured Anthropic model through the server key, inspect a project with the existing tools, and run a tool loop that uses `executeTool`. Do not call the model from the Vite bundle. Account availability still has to be checked with `GET /health?verify=1` before treating a default id as usable.

### Phases 3–7

Not started. Captions, generative media, multi-agent routing, review, and production hardening remain future work. Stage 1 only prepared their interfaces.

## Run locally

```text
npm install
npm test
npm run typecheck
npm run dev
npm run server
```

`npm run dev` serves the editor at `http://127.0.0.1:5173/`. `npm run server` serves the API at `http://127.0.0.1:8787/`. Setup for each provider is `API_SETUP.md`.
