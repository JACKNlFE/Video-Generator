# API setup

Stage 1 adds a server-side provider registry, a SQLite job store, and a budget ledger. Every integration below is optional. `npm run dev` and `npm run server` both start when the variables are unset.

The Vite app does not read these variables. `vite.config.ts` only exposes variables that start with `VITE_PUBLIC_`, and the editor does not use that prefix. Do not put a provider key in frontend code or in a `VITE_` variable.

Checked against provider docs on November 25, 2026. Prices and model ids that this page does not list as verified are unset in code.

## Health statuses

`GET /health` reports one of these strings for each provider:

- `not configured`
- `configured but unverified`
- `connected and verified`
- `connection failed`
- `insufficient permissions`
- `unavailable model or capability`

Without `?verify=1`, a present key stays `configured but unverified` and no provider is contacted. `GET /health?verify=1`, or `PROVIDER_HEALTH_VERIFY=true`, runs the live check. A failed check does not stop the process.

The live checks do not submit a Claude message, a Fal generation, or a transcription. They are read or metadata calls. Confirm the provider's current billing for that read before verifying a metered account. Tests do not make these calls.

| Provider | Live check | SDK |
| --- | --- | --- |
| Anthropic | `client.models.list()` | `@anthropic-ai/sdk` |
| OpenAI | `models.list()`, or `models.retrieve(id)` when a transcription model is configured | `openai` |
| AssemblyAI | `transcripts.list({ limit: 1 })` | `assemblyai` |
| Fal | `GET https://api.fal.ai/v1/models/pricing` with `Authorization: Key …` | `@fal-ai/client` configures the key. The pricing route is the documented platform API; the JS client does not wrap it. |
| Cloudflare R2 | `HeadBucket` | `@aws-sdk/client-s3`, region `auto` |
| Neon | `SELECT 1` | `@neondatabase/serverless` |
| Trigger.dev | `GET {TRIGGER_API_URL}/api/v1/runs?page[size]=10` with `Authorization: Bearer …` | No Trigger task SDK. This stage does not define or dispatch tasks. |
| Media worker | `GET {MEDIA_WORKER_URL}/health` | None. The worker contract is defined in this repo. |
| SQLite and local disk | A local read, and a write probe in the media directory | `node:sqlite` |

## Anthropic

Optional. The editor and the API start without it.

- Docs: https://platform.claude.com/docs
- API keys: https://platform.claude.com/settings/keys
- Models overview used for the ids and base rates below: https://platform.claude.com/docs/en/models/overview

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server key. The SDK sends it as a bearer token. |
| `ANTHROPIC_WORKSPACE_ID` | Optional `anthropic-workspace-id` header when the key is not bound to one workspace. |
| `ANTHROPIC_CREATIVE_MODEL` | Creative-director model. Default `claude-fable-5-2`. |
| `ANTHROPIC_CREATIVE_FALLBACKS` | Comma-separated fallbacks, used only if an earlier id was reported unavailable. |
| `ANTHROPIC_EXECUTION_MODEL` | Execution model. Default `claude-sonnet-5-5`. |
| `ANTHROPIC_EXECUTION_FALLBACKS` | Comma-separated fallbacks. |
| `ANTHROPIC_REVIEW_MODEL` | Review model. Default `claude-opus-5-5`. |
| `ANTHROPIC_REVIEW_FALLBACKS` | Comma-separated fallbacks. |

A blank model variable clears that default. This stage does not call the Messages API. Verification lists models and compares the configured ids. An id missing from that list is `unavailable model or capability`, and selection moves to the next configured fallback. The defaults are the documented API ids. They are not a claim that the key's account can use them.

Verified base rates from that overview, stored in `server/providers/documented.ts` as USD per million tokens:

| Model id | Input | Output |
| --- | --- | --- |
| `claude-fable-5-2` | $8 | $40 |
| `claude-opus-5-5` | $4 | $20 |
| `claude-sonnet-5-5` | $2 | $10 |

The same page says batch requests are 50% of those base rates. It says prompt-cache reads are 2.5% of base input for Fable 5.2 and 5% of base input for Opus 5.5 and Sonnet 5.5. Those derived rates are stored separately and labeled as derived. Cache-write, long-context, and other meters were not copied. Claude Haiku 5.5 is listed as "From $0.10 / From $0.50", so no Haiku price is stored.

## Fal

Optional.

- Docs: https://fal.ai/docs
- API keys: https://fal.ai/dashboard/keys
- Client setup (`FAL_KEY`): https://fal.ai/docs/documentation/model-apis/inference/client-setup
- Pricing route: https://fal.ai/docs/platform-apis/v1/models/pricing
- Webhooks: https://fal.ai/docs/documentation/model-apis/inference/webhooks

| Variable | Purpose |
| --- | --- |
| `FAL_KEY` | Server key. Sent as `Authorization: Key …`. |
| `FAL_IMAGE_MODEL` | Optional endpoint id. Unset until you choose one. |
| `FAL_VIDEO_MODEL` | Optional endpoint id. Unset until you choose one. |

No image or video endpoint is selected in code. Docs use ids such as `fal-ai/flux/dev` as examples, including an OpenAPI example price of `0.025` USD per image. That example payload is not stored as a rate. Live account prices are not copied either. `findPrice("fal", …)` stays unverified.

Verification calls `GET https://api.fal.ai/v1/models/pricing`. `endpoint_id` is required by that route. With no model configured, HTTP 400 and `error.type = validation_error` is treated as an accepted key. HTTP 401 is `connection failed`. HTTP 403 is `insufficient permissions`. With a model configured, HTTP 200 must include that endpoint id or the status is `unavailable model or capability`.

Fal webhooks are `POST /webhooks/fal`. Verification follows the current Fal doc: JWKS at `https://rest.fal.ai/.well-known/jwks.json` (cached at most 24 hours), headers `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp`, and `X-Fal-Webhook-Signature`, a ±300 second timestamp window, and an Ed25519 signature over `requestId`, `userId`, `timestamp`, and the hex SHA-256 of the raw body, joined by newlines. The same `request_id` is applied once.

## AssemblyAI

Optional. Primary transcription provider when `TRANSCRIPTION_PROVIDER` is `auto` or `assemblyai`.

- Docs: https://www.assemblyai.com/docs
- Model selection: https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
- List transcripts: https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/list
- Webhooks: https://www.assemblyai.com/docs/pre-recorded-audio/webhooks
- Sign in at https://www.assemblyai.com/app and copy the API key from the account. This repo does not guess a deeper key URL.

| Variable | Purpose |
| --- | --- |
| `ASSEMBLYAI_API_KEY` | Raw `authorization` header value. The SDK sends it. There is no `Bearer` prefix. |
| `ASSEMBLYAI_BASE_URL` | Optional. EU traffic uses `https://api.eu.assemblyai.com`. |
| `ASSEMBLYAI_SPEECH_MODEL` | Default `assemblyai-stt-3-7`, the documented recommended pre-recorded model for new accounts. |
| `ASSEMBLYAI_SPEECH_MODEL_FALLBACK` | Default `universal-2`, the documented fallback. Comma-separated if you set more than one. |
| `ASSEMBLYAI_WEBHOOK_HEADER_NAME` | Header name you will send as `webhook_auth_header_name`. |
| `ASSEMBLYAI_WEBHOOK_HEADER_VALUE` | Shared secret you will send as `webhook_auth_header_value`. |

AssemblyAI does not sign webhook bodies. `POST /webhooks/assemblyai` rejects the request unless both webhook variables are set and the header matches. The transcript `id` is the delivery id. Pre-recorded transcript `words` include start and end in milliseconds. Listing transcripts does not check that the speech model is enabled, because that would submit audio. No AssemblyAI price is stored.

## OpenAI

Optional. Used when `TRANSCRIPTION_PROVIDER` is `openai`, or as the automatic fallback when AssemblyAI is not configured or its configured models were all reported unavailable.

- Docs: https://developers.openai.com/api/docs
- Transcription guide: https://developers.openai.com/api/docs/guides/transcription
- API keys: https://platform.openai.com/api-keys

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server key. |
| `OPENAI_TRANSCRIPTION_MODEL` | Default `gpt-transcribe`, the documented model for new file transcription. |
| `OPENAI_TRANSCRIPTION_FALLBACKS` | Comma-separated. Empty by default. |
| `TRANSCRIPTION_PROVIDER` | `auto`, `assemblyai`, or `openai`. |

`whisper-1`, `gpt-4o-transcribe`, and `POST /v1/audio/translations` are documented as deprecated, with shutdown on February 26, 2027. This repo does not select them. The transcription guide still points word timestamps and `srt` / `vtt` at deprecated `whisper-1`. Word timestamps for `gpt-transcribe` are therefore unset, not assumed. No OpenAI price is stored.

## Cloudflare R2

Optional. Until every R2 variable below is set, media storage stays on local disk (`MEDIA_ROOT`, default `data/media`). Bytes are not stored in Postgres.

- S3 setup: https://developers.cloudflare.com/r2/get-started/s3/
- Tokens: https://developers.cloudflare.com/r2/api/tokens/

| Variable | Purpose |
| --- | --- |
| `R2_ACCOUNT_ID` | Account id in the endpoint host. |
| `R2_ACCESS_KEY_ID` | S3 access key id. |
| `R2_SECRET_ACCESS_KEY` | S3 secret. |
| `R2_BUCKET_NAME` | Bucket passed to `HeadBucket`. |
| `R2_JURISDICTION` | Empty, `eu`, `us`, or `fedramp`. |
| `R2_ENDPOINT` | Optional full override. |

The endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Jurisdiction hosts are `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`, `https://<ACCOUNT_ID>.us.r2.cloudflarestorage.com`, and `https://<ACCOUNT_ID>.fedramp.r2.cloudflarestorage.com`. The client region is `auto`. A missing bucket is `unavailable model or capability`. `AccessDenied` is `insufficient permissions`. These names are separate from `AWS_ACCESS_KEY_ID` so an unrelated AWS credential is not picked up.

No R2 storage price is stored.

## Neon

Optional. Job rows in this stage stay in SQLite even when `DATABASE_URL` is set.

- Docs: https://neon.com/docs
- Console: https://console.neon.tech
- Serverless driver: https://neon.com/docs/serverless/serverless-driver

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres URL. Verification runs `SELECT 1`. |
| `DATABASE_URL_UNPOOLED` | Stored for a later migration tool. This stage does not open it. |

The URL contains the database password. Do not commit it. A password or network failure is `connection failed`. A permission error is `insufficient permissions`.

## Trigger.dev

Optional. The running queue is SQLite. A valid key can be verified without sending a task.

- API keys: https://trigger.dev/docs/apikeys
- List runs: https://trigger.dev/docs/management/runs/list

| Variable | Purpose |
| --- | --- |
| `TRIGGER_SECRET_KEY` | Named environment key (`tr_dev_sk_…`, `tr_prod_sk_…`, and the other documented prefixes). |
| `TRIGGER_API_URL` | Default `https://api.trigger.dev`. Set this for a self-hosted API. |

`@trigger.dev/sdk` is not installed. This stage does not define tasks, and a successful verify does not move jobs onto Trigger.dev.

## Media worker

Optional. FFmpeg and Python audio are not installed and are not invoked. The seam is for a later process that has those tools.

- FFmpeg docs, for that later process: https://ffmpeg.org/documentation.html

| Variable | Purpose |
| --- | --- |
| `MEDIA_WORKER_URL` | Base URL of the worker you run. |
| `MEDIA_WORKER_SECRET` | HMAC secret shared with that worker. |
| `WEBHOOK_BASE_URL` | Public origin of this API, used to print webhook URLs. No trailing-path tricks: the route is appended. |

Vocal separation and forced alignment stay `not configured` until `MEDIA_WORKER_URL` is set. No hosted Demucs or aligner endpoint is selected, and no price is stored.

This repo's worker contract:

- Verify with `GET {MEDIA_WORKER_URL}/health` returning HTTP 200.
- Dispatch, only if you call `dispatchToMediaWorker`, is `POST {MEDIA_WORKER_URL}/jobs`. Creating a job does not call it.
- Signature: hex HMAC-SHA256 of the UTF-8 timestamp, a `.`, and the raw body, using `MEDIA_WORKER_SECRET`.
- Headers: `X-Media-Worker-Timestamp`, `X-Media-Worker-Signature`, `X-Media-Worker-Delivery-Id`.
- Timestamp window: ±300 seconds.
- `POST /webhooks/media-worker` and `POST /jobs/:id/progress` both require that signature.

`POST /jobs` returns 202 with `runsInsideRequest: false` and status `queued`. The handler does not transcode.

## Budgets

Optional. An empty limit is not enforced. Set the limits before any later stage makes a paid call. Windows are UTC.

| Variable | Scope |
| --- | --- |
| `DEFAULT_PROJECT_BUDGET_USD` | All reservations with that `projectId`. A reservation is rejected if this is set and `projectId` is missing. |
| `MAX_RUN_SPEND_USD` | Reservations that include a `runId`. |
| `MAX_DAILY_SPEND_USD` | UTC day. |
| `MAX_MONTHLY_SPEND_USD` | UTC month. |

Amounts are integer millionths of a USD. A reservation is one SQLite transaction (`BEGIN IMMEDIATE`) that sums reserved estimates and reconciled actuals, then inserts. A second reservation that would pass a configured limit is rejected and inserts nothing. Releasing a reservation, or reconciling a lower actual, frees the unused hold. A higher actual is still recorded. If it passes the limit, the row is marked `overBudget` so later reservations see the real spend.

If the pricing registry has no verified rate and the caller does not pass an explicit positive estimate, the reservation is refused. Fal, AssemblyAI, and OpenAI currently have no verified rate. A zero estimate is refused.

`POST /budgets/reservations` is an operator route on this process. This stage has no user login. Do not expose it on a public interface. Later paid calls should reserve inside the server, from the registry or another server-side estimate, before the provider call.

## Local development

```text
npm install
npm test
npm run typecheck
npm run dev
npm run server
```

The editor is http://127.0.0.1:5173/. The API is http://127.0.0.1:8787/. Copy `.env.example` to `.env` only on the machine that runs the API. `.env` is gitignored.

Job state is `data/platform.sqlite` unless `JOBS_DB_PATH` is set. `JOBS_DB_PATH=:memory:` is process-local and is not shared across workers.

Useful routes:

- `GET /health` and `GET /health?verify=1`
- `GET /providers`
- `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`, `POST /jobs/:id/retry`
- `POST /webhooks/fal`, `POST /webhooks/assemblyai`, `POST /webhooks/media-worker`

Job kinds accepted by the API are `video.generate`, `image.generate`, `audio.transcribe`, `audio.separate`, `audio.align`, `media.render`, and `media.probe`. Creating one only stores the row.

## Preview and production

This repository does not yet have a hosting project, a Dockerfile, or a deploy workflow. Use the same Node API and the Vite build in each environment, with different env values.

- Build the editor with `npm run build`. Publish the `dist/` directory as static files. Do not put provider keys in that build.
- Run `npm run server` (`tsx server/main.ts`) as its own process. Give it a persistent disk for the SQLite file. Ephemeral serverless disks will forget jobs.
- Do not put long media work inside a short HTTP function. The job route only records the job. A worker with FFmpeg or Python should consume `POST /jobs` on the media-worker URL later.
- Set `WEBHOOK_BASE_URL` to the public API origin so `GET /providers` prints the webhook URLs to register at Fal and AssemblyAI.
- Set the budget variables in production before any paid provider is called.
- Keep `HOST` at `127.0.0.1` unless the process sits behind an edge you control. There is no user authentication in this stage.
- Preview and production differ by which keys, budgets, `TRIGGER_API_URL`, and database URL you inject. Neon and Trigger stay optional. R2, when configured, replaces local disk as the selected storage provider.
- Rotate a leaked key at the provider. The SQLite file and logs must not contain it. Health details redact connection URLs.

## Editor, captions, and audio

The page uses `/api` when the API process is up (Vite proxies `/api` to port 8787). The assistant calls Claude through `@anthropic-ai/sdk` and then the editor tools. Without `ANTHROPIC_API_KEY` the page says the assistant is not configured. That SDK path has not been live-verified.

Transcription jobs do not invent a transcript when AssemblyAI and OpenAI keys are absent. They fail with the provider not configured. Tests pass a fixture transcript into `attachTranscript`. `generateCaptions` only copies words already stored. `editCaptionText` rejects wording changes on those captions.

`alignLyrics` places the user's exact tokens on cached onset times, or spreads them evenly if there are too few onsets. Every aligned word is `uncertain: true`. This is not a benchmarked sung-vocal aligner.

Audio analysis uses ffmpeg (`ffmpeg-energy-v1`): PCM energy for onsets, `silencedetect`, and `volumedetect`. Librosa is not installed. BPM is omitted when there are fewer than four usable gaps. `syncCutsToBeats` reads the cached beat list.

Preview and export rendering use ffmpeg (`libx264`, optional `subtitles` burn-in, AAC). `POST /jobs` still only records the job. A separate call runs the ffmpeg work. Demucs is not installed. `separateVocals` returns an error and does not replace the original audio.

Uploads accepted by extension are mp3, wav, m4a, aac, flac, mp4, mov, and webm, up to 100 MB. Duration comes from ffprobe.

## Not in this stage

No Fal generation and no Trigger.dev task runs. Claude, AssemblyAI, and OpenAI were not called in this environment because their keys are unset.
