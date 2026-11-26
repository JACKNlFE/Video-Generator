# Implementation progress

Repository: `JACKNlFE/Video-Generator`  
Times below are America/Chicago (CT).

## Phase 0 — recorded at the end of the audit

Completed about 1:48 AM CT on Tuesday 24 Nov 2026.

### Completed functionality

- Read the full brief at `/cursor/stores/bc-42fc35e1-0af3-4756-bcf3-f497a33b3185/internal/master-build-brief.md` (sections 1–22, 1290 lines).
- Copied it verbatim to `MASTER_BUILD_BRIEF.md`. `cmp` found no difference. SHA-256 of both files: `5d0a035c65ec7b27fd748fd0c6ae4f50178a6022df0d898488085a3520bd3eb9`.
- Inspected the whole checkout. Tracked files: `README.md` only. History: one commit, `Initial commit`, at `15a2dc3a21c9f6809ac65b1d2a3838989241eb58`.
- Fetched `origin/main`. It matched that commit.
- The checkout was not a video editor. No application code was added during Phase 0.

### Verification during Phase 0

```text
npm test
# npm error code ENOENT
# npm error path /agent/repos/Video-Generator/package.json
# exit 254

npx --yes -p typescript@5.9.3 tsc --noEmit --pretty false
# tsc printed compiler-option help (no tsconfig.json)
# exit 1
```

## Phase 1 — greenfield editor

Mark chose to build the editor in this repository. The earlier "Phase 1 stopped, no editor" close is superseded by the work below. Completed about 2:01 AM CT on Tuesday 24 Nov 2026.

### Completed functionality

An in-memory editor and a Zod tool registry. The page and the tests call `executeTool`. No model and no generative API is called.

Supported tools, each backed by the function of the same name in `src/editor/store.ts`:

- `createProject`, `inspectProject`, `inspectTimeline`
- `setAspectRatio`, `setResolution`, `setFrameRate`
- `registerMedia` (name, kind, duration only; not a file upload)
- `addTrack`, `removeTrack` (removing a track also removes its clips)
- `addClip`, `removeClip`, `moveClip`, `trimClip`, `splitClip`
- `undo`, `redo`, `createCheckpoint`, `restoreCheckpoint`

Unknown names return `UNSUPPORTED`. Covered names that fail on purpose: `generateVideo`, `generateCaptions`, `applyEffect`, `exportVideo`, `transcribeAudio`, `importMedia`.

The manual page can perform those same edits and shows the timeline, version, errors, undo, redo, and checkpoints.

### Files added

- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`
- `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/vite-env.d.ts`
- `src/editor/schema.ts`, `src/editor/store.ts`, `src/editor/registry.ts`, `src/editor/browserEditor.ts`, `src/editor/registry.test.ts`
- `IMPLEMENTATION_PLAN.md` and `IMPLEMENTATION_PROGRESS.md` updated

`MASTER_BUILD_BRIEF.md` and `README.md` were not changed in this phase.

### Verification

Commands run in `/agent/repos/Video-Generator` after the editor code was in place. Vitest 3.2.7, TypeScript via `tsc`, Vite 6.4.6.

```text
npm test

> test
> vitest run

 RUN  v3.2.7 /agent/repos/Video-Generator

 ✓ src/editor/registry.test.ts (6 tests) 17ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  08:00:45
   Duration  276ms (transform 77ms, setup 0ms, collect 91ms, tests 17ms, environment 0ms, prepare 42ms)

npx tsc --noEmit --pretty false
# exit 0, no output
```

`npm test` exit was 0. The six tests drive the registry only. They cover the supported-tool list, unsupported names, invalid and unknown fields, settings changes, version conflicts, clip and track edits, undo, redo (including redo cleared by a new edit), checkpoint restore, and undo of that restore.

Headless Chrome against `npm run dev` at `http://127.0.0.1:5173/` (Vite reported ready, HTTP 200):

- Boot showed Version 1, Video 1, and Audio 1.
- Aspect 9:16, resolution 1080×1920, and frame rate 24 advanced the version to 4.
- Registering a video reference named City, adding a 4000 ms clip, and moving it to 1500 ms worked.
- Undo returned the clip to 0 ms. Redo returned it to 1500 ms.
- Checkpoint "Before delete" stayed on Version 9. Removing the clip and restoring the checkpoint put the clip back. The page then read Version 11 and the status "Restored the checkpoint."
- Frame rate `23.976` showed a validation error and left the version at 11.
- The page console had no errors. A 390×844 viewport still showed the timeline.
- Desktop and mobile screenshots from that pass: `/tmp/editor-verify/desktop.png` and `/tmp/editor-verify/mobile.png`.

### Outstanding issues

This list is the snapshot at the end of Phase 1. Stage 1, below, adds a job database and leaves the editor document in memory.

- Project state dies on refresh. There is no database and no file save.
- No users, sessions, or project-ownership checks.
- Media has no bytes, so there is no picture, waveform, playback, or export.
- Media references cannot be deleted or replaced.
- Aspect ratio does not change width and height, and the reverse is also true.
- Checkpoints store the document only. They do not store the undo stack.
- Phases 2–7 are not implemented. Generation, captions, agents, and provider endpoints are absent on purpose.

### Recommendation at the end of Phase 1

The note at the time said Phase 2 should be next. The following work was Stage 1 instead. Phase 2 was not started.

## Stage 1 — Provider and infrastructure foundation

Completed about 5:46 PM CT on Wednesday, November 25, 2026.

The editor files under `src/editor` were not changed. The Vite page still calls `executeTool`. A Node API now loads optional provider credentials, records jobs in SQLite, and enforces budget reservations. No Claude message, Fal generation, or transcription was submitted.

### Completed functionality

- One registry for language models, video, image, transcription, vocal separation, forced alignment, storage, jobs, rendering, and the database seam.
- Health strings are exactly `not configured`, `configured but unverified`, `connected and verified`, `connection failed`, `insufficient permissions`, and `unavailable model or capability`.
- Missing optional keys do not throw. `GET /health` does not contact a provider unless `?verify=1` or `PROVIDER_HEALTH_VERIFY=true`.
- Documented defaults, checked November 25, 2026: creative `claude-fable-5-2`, execution `claude-sonnet-5-5`, review `claude-opus-5-5`, AssemblyAI `assemblyai-stt-3-7` with fallback `universal-2`, OpenAI file transcription `gpt-transcribe`. Fal image and video endpoint ids are unset. A blank env value clears a default. Fallbacks are used only after a live check marks an earlier id unavailable.
- Verified Claude base rates, the documented 50% batch discount, and the documented cache-read percentages are in `server/providers/documented.ts`. Cache writes, Haiku's "from" price, and Fal, AssemblyAI, OpenAI, R2, Neon, and Trigger prices are unset.
- Jobs persist in SQLite: create, read, progress, cancel, retry, idempotency, webhook delivery ids, results, and structured errors. `POST /jobs` returns 202 with `runsInsideRequest: false` and status `queued`.
- Fal webhook verification follows the current JWKS and Ed25519 doc. AssemblyAI uses the documented shared header. The media worker uses the HMAC in `API_SETUP.md`. `dispatchToMediaWorker` is not called by job creation and does not run FFmpeg.
- Budget reservations are one `BEGIN IMMEDIATE` transaction. A configured limit blocks a second reservation, including two concurrent connections. An unverified price with no explicit estimate is refused.

### Files

Added:

- `.env.example`, `API_SETUP.md`
- `server/main.ts`, `server/http.ts`, `server/platform.ts`, `server/config.ts`, `server/cost.ts`, `server/dispatch.ts`, `server/money.ts`, `server/webhooks.ts`, `server/persist.mjs`, `server/persist.d.mts`, `server/reserve-worker.mjs`
- `server/providers/types.ts`, `server/providers/classify.ts`, `server/providers/documented.ts`, `server/providers/live.ts`, `server/providers/mocks.ts`
- `server/config.test.ts`, `server/providers.test.ts`, `server/jobs.test.ts`, `server/cost.test.ts`, `server/http.test.ts`, `server/boundary.test.ts`

Changed:

- `package.json`, `package-lock.json` (official SDKs and `tsx`)
- `tsconfig.json`, `vitest.config.ts`, `vite.config.ts` (`envPrefix` is `VITE_PUBLIC_`)
- `.gitignore`
- `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PROGRESS.md`

`src/editor`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `MASTER_BUILD_BRIEF.md`, and `README.md` were not changed.

### Verification

Commands run in `/agent/repos/Video-Generator` after the Stage 1 code was in place. Final run about 5:46 PM CT. TypeScript `tsc` exited 0 with no output. Vitest 3.2.7 then exited 0.

```text
npx tsc --noEmit --pretty false
# exit 0, no output

npm test

> test
> vitest run

 RUN  v3.2.7 /agent/repos/Video-Generator

 ✓ server/cost.test.ts (5 tests) 79ms
 ✓ server/http.test.ts (5 tests) 111ms
 ✓ server/jobs.test.ts (5 tests) 56ms
 ✓ src/editor/registry.test.ts (6 tests) 16ms
 ✓ server/providers.test.ts (11 tests) 268ms
 ✓ server/config.test.ts (5 tests) 5ms
 ✓ server/boundary.test.ts (2 tests) 1534ms

 Test Files  7 passed (7)
      Tests  39 passed (39)
   Start at  23:46:28 UTC
   Duration  1.73s (transform 236ms, setup 0ms, collect 415ms, tests 2.07s, environment 1ms, prepare 342ms)
```

The 39 tests include the original 6 editor registry tests. New coverage includes the six health strings, fallback selection, a Fal pricing HTTP 400 versus HTTP 401 with a fake key, official package imports, job reopen and idempotency, Fal signature and duplicate delivery, media-worker HMAC, a second budget reservation, two concurrent reservations, an unverified price refusal, HTTP 202 with `runsInsideRequest: false`, and a Vite production build that does not contain a marker placed in `ANTHROPIC_API_KEY` or `VITE_ANTHROPIC_API_KEY`.

Smoke, same evening, with no provider keys in the environment:

```text
npm run server
# api listening on http://127.0.0.1:8787
# GET /health HTTP 200
# anthropic, fal, assemblyai, openai, vocal separation, alignment, r2, trigger, neon: not configured
# local disk, sqlite jobs, renderer seam, sqlite database: connected and verified

npm run dev
# Vite 6.4.6 ready at http://127.0.0.1:5173/
# GET / HTTP 200, page contains id="root", and the HTML does not contain ANTHROPIC_API_KEY or FAL_KEY
```

The timeline was not clicked again. The editor source did not change, and `src/editor/registry.test.ts` passed.

### Outstanding issues

- The editor document still dies on refresh. SQLite stores jobs and budgets, not the timeline.
- The API has no user login. It binds to `127.0.0.1` unless `HOST` is changed.
- Fal endpoint ids and Fal prices are unset. The docs' example payload price was not copied.
- AssemblyAI and OpenAI prices are unset. `gpt-transcribe` word timestamps are not documented, so they are not claimed. Deprecated `whisper-1` is not selected.
- Claude Haiku 5.5's "from" price and Claude cache-write prices are unset. Default Claude ids are documented ids, not proof the account has them, until `GET /health?verify=1`.
- Trigger.dev is not the job queue, and its task SDK is not installed. Neon is not the job database.
- FFmpeg and Python audio are not installed and are not invoked. Node 22 prints an experimental warning for `node:sqlite`.
- `npm audit` reports moderate `@vitest/mocker`, critical `tinypool`, critical `vitest`, and high `zod`. `npm audit fix --force` was not run. Zod was already the Phase 1 dependency.
- Phase 2 is not started. No agent, generation, or transcription submission was added.

### Recommendation at the end of Stage 1

Phase 2 was the suggested next step. The work below is Step A on a branch stacked on Stage 1. It is not live-verified against paid APIs.

## Step A — Editing, captions, and audio

Recorded about 6:00 PM CT on Wednesday, November 25, 2026. No `ANTHROPIC_API_KEY`, `FAL_KEY`, `ASSEMBLYAI_API_KEY`, or `OPENAI_API_KEY` was set.

### What is implemented

- The same `executeTool` document now stores optional speed, transform, opacity, color, effects, transitions, fades, volume, and keyframes. Phase 1 clips omit those fields and the old tests still pass.
- Caption tracks, segments, and word times. Moving a clip keeps source times and shifts the derived timeline time. Trimming and splitting retarget words. `editCaptionText` rejects changes to spoken words.
- Subtitle presets and SRT/WebVTT export. Manual text overlays are separate from transcript captions.
- `alignLyrics` uses the user's tokens only and marks every word `uncertain`. `separateVocals` fails and does not replace audio.
- ffmpeg analysis (`ffmpeg-energy-v1`), preview mp4 render, and upload extension checks.
- The assistant is SDK-backed and unverified live. `POST /agent/turns` uses `@anthropic-ai/sdk` `messages.create` and then `executeTool` on the same project. Without `ANTHROPIC_API_KEY` the UI says the assistant is not configured. Tests inject a fake SDK client and do not call Anthropic.
- `/api` proxy so the page and the API can share one server project when the API is up.

### What is not live-verified

Claude, AssemblyAI, OpenAI, and Fal were not called. Librosa and Demucs are not installed. No sung-vocal benchmark was run.

### Verification

Re-checked about 6:06 PM CT after replacing the mock assistant. `npx tsc --noEmit --pretty false` exited 0. `npm test` exited 0: 10 files, 45 tests. The agent test uses a fake Anthropic SDK client, applies `applyEffect`, and does not call the live API. The ffmpeg test still finds silence in a generated tone and writes a preview mp4. The original 6 editor registry tests passed.

### Recommendation at the end of Step A

Step B follows on the next branch.

## Step B — Generative catalog and routing

Recorded about 6:01 PM CT on Wednesday, November 25, 2026. `npm test` exited 0 with 11 files and 47 tests. `npx tsc --noEmit --pretty false` exited 0 before that run. No Fal key was set, and Fal was not called.

Verified endpoint ids, with prices left null: `fal-ai/veo3.1`, Kling v3 Pro text-to-video and image-to-video, `fal-ai/ltx-2.3/audio-to-video`, `alibaba/wan-3.0-prime/reference-to-video`, `bytedance/seedance-2.5/text-to-video`, `fal-ai/flux/schnell`, and `fal-ai/flux-pro/v1.1`. Runway is omitted. Music requests do not select a video model. Budget mode does not select text-to-video. `generateImage` / `generateVideo` only queue `liveVerified: false`. Fast, advanced, and maximum routes pick the configured Claude ids and do not call them. Quality checks look at the timeline only.

### Recommendation at the end of Step B

Step C adds owner docs and local guards. It does not make the app production-ready.

## Step C — Owner setup and honest limits

Recorded about 6:02 PM CT on Wednesday, November 25, 2026.

`npx tsc --noEmit --pretty false` exited 0. `npm run lint` is that same check and exited 0. `npm test` exited 0: 12 files, 49 tests. `npm run build` exited 0 with Vite 6.4.6 before a server-only signature fix; tests were re-run after the fix.

Added optional `APP_AUTH_TOKEN` for changes, a per-address rate limit, and `MEDIA_SIGNING_SECRET` for timed file names. The provider check on the page reads `/api/health`. Guides: `DEPLOYMENT_GUIDE.md`, `TEST_REPORT.md`, `KNOWN_LIMITATIONS.md`, and `FINAL_SETUP_CHECKLIST.md`.

No paid provider was called. The requirement trace is in `KNOWN_LIMITATIONS.md`. The app is not production-ready. The assistant remains SDK-backed and unverified live.

### Recommended next step

Add real keys on a private machine and run `GET /health?verify=1` before trusting a provider row. Do not treat a queued Fal row as finished media.
