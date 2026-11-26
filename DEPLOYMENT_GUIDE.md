# Deployment guide

This app is not production-ready. Paid providers were not called in the implementation environment, and several paths stay mocked or refused until you add keys and infrastructure. Do not point a public marketing site at this API and call it finished.

## What you run on your computer

Two processes:

- The editor: `npm run dev` at `http://127.0.0.1:5173/`.
- The API: `npm run server` (`tsx server/main.ts`). With no `PORT` and no `HOST`, it listens on `http://127.0.0.1:8787`.

Vite's dev server proxies `/api` to that API. `npm run dev` stays on `127.0.0.1`. Do not change those scripts for Railway.

## One Railway service

Railway runs one process. That process serves the built editor in `dist/` and the API on the same URL. The browser calls `/api/...` on that URL. Webhooks stay at `/webhooks/...`. There is no second service and no separate static host.

The image is the root `Dockerfile`. It installs Node 22 and FFmpeg (`ffmpeg` and `ffprobe`). Demucs and Librosa are not installed.

Start command, in the Dockerfile and in `railway.toml`:

```text
npm run server
```

`railway.toml` also sets the health check to `/health`. Railway stops reading `railway.toml` for a new service on December 1, 2026. The Dockerfile command is the same `npm run server`, so the process still starts after that date. If a later deploy does not keep the health check, set the path to `/health` in the service settings.

The image does not contain the job database or uploads. Do not copy `data/` or a `.env` file into git or into the image.

## Where files persist

Add one Railway volume and mount it at `/data`. Then set these in Railway's Variables tab, not in git:

| What | Name | Value |
| --- | --- | --- |
| Job database | `JOBS_DB_PATH` | `/data/platform.sqlite` |
| Uploads | `MEDIA_ROOT` | `/data/media` |

If you leave both unset, and the volume is mounted, Railway sets `RAILWAY_VOLUME_MOUNT_PATH` and the process uses `/data/platform.sqlite` and `/data/media` on its own. If you paste the computer values `data/platform.sqlite` and `data/media`, those files sit in the container and disappear on the next deploy. The logs warn when that happens.

Keep one replica. SQLite is one file on that volume. Do not add Postgres, Redis, or a second web service. This stage does not use Neon as the job database.

## HOST and PORT

- On your computer, leave `HOST` at `127.0.0.1`. `npm run dev` and `npm run server` stay on `127.0.0.1`.
- On Railway, leave `HOST` empty and leave `PORT` empty. Railway sets `PORT`. The process binds `0.0.0.0`, not `127.0.0.1`, so Railway's proxy can reach it.
- If `HOST=127.0.0.1` is copied into Railway anyway, the process still binds `0.0.0.0` when Railway's own environment variables and `PORT` are present.
- A `PORT` with no `HOST` and no Railway variables also binds `0.0.0.0`. That is for a platform that only injects `PORT`. Your computer does not set `PORT` unless you do.

## Click path

Do this after the Dockerfile change is on the branch you deploy. After it is merged, that branch is `main`. Use one service.

1. Open https://railway.com and sign in.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**. If asked, allow the Railway GitHub app for the account that owns the repo.
4. Select `JACKNlFE/Video-Generator`. Do not add another service when the canvas appears.
5. Railway detects the root `Dockerfile` and builds one service. The start command is `npm run server`. Leave it that way. Do not add a second start command.
6. Wait until that deploy finishes. It can finish with no provider keys. The editor can open before any key is set.
7. Add a volume. On the project canvas, right-click or open the command palette (`Ctrl+K` or `Command+K`) and add a volume. Attach it to this service. Set the mount path to `/data`.
8. Open the service **Variables** tab. Add the names below. Type the secret values there. Do not put them in git, in chat, or in a `VITE_` variable.
9. Open **Settings**, then **Networking**, then **Public Networking**, and click **Generate Domain**. Do this after the service has deployed so Railway can see the port it listened on. You get an address like `https://your-service.up.railway.app`. That address is the editor and the API.
10. Set `WEBHOOK_BASE_URL` to that `https://` address with no path on the end. Save. Railway redeploys when variables change.
11. Open the public URL in a browser. You should see the editor. Open `https://your-domain/health`. The JSON should include `"ok": true`. `sqlite` and `local-disk` should say `connected and verified` when the volume is writable. Other provider rows stay `not configured` until you add that provider's key. A connected row is not proof the live provider was verified in this repository.

Do not turn on multiple replicas. Do not add a database plugin for this stage.

## Variables to enter in Railway

Keys are entered in Railway variables, never in git. Copy names from `.env.example`. Leave a value empty to keep that integration off.

Set these before the URL is something other people can use, and before any paid key:

| What | Name |
| --- | --- |
| Owner token for API changes | `APP_AUTH_TOKEN` |
| Secret for timed media links | `MEDIA_SIGNING_SECRET` |
| One project, dollars | `DEFAULT_PROJECT_BUDGET_USD` |
| One production run, dollars | `MAX_RUN_SPEND_USD` |
| One UTC day, dollars | `MAX_DAILY_SPEND_USD` |
| One UTC month, dollars | `MAX_MONTHLY_SPEND_USD` |
| Job database on the volume | `JOBS_DB_PATH` |
| Uploads on the volume | `MEDIA_ROOT` |

Use a long random string for `APP_AUTH_TOKEN` and for `MEDIA_SIGNING_SECRET`. Amounts look like `10.00`. Empty means that limit is off. Set the budgets before you add a paid key.

`APP_AUTH_TOKEN` locks `POST`, `PUT`, and `DELETE`. `GET /health` stays open. The editor page does not send the token. With the token set, the page can still open, and timeline saves stay in that browser tab instead of on the server. Do not paste the token into the page. Leave `APP_AUTH_TOKEN` empty only if you accept that anyone who can open the URL can change the API.

Optional keys, one at a time, from `.env.example`:

| Service | Names |
| --- | --- |
| Claude | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_CREATIVE_MODEL`, `ANTHROPIC_EXECUTION_MODEL`, `ANTHROPIC_REVIEW_MODEL`, and the `*_FALLBACKS` lists |
| AssemblyAI | `ASSEMBLYAI_API_KEY`, optional `ASSEMBLYAI_BASE_URL`, `ASSEMBLYAI_SPEECH_MODEL`, `ASSEMBLYAI_SPEECH_MODEL_FALLBACK`, `ASSEMBLYAI_WEBHOOK_HEADER_NAME`, `ASSEMBLYAI_WEBHOOK_HEADER_VALUE` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_TRANSCRIPTION_FALLBACKS`, `TRANSCRIPTION_PROVIDER` |
| Fal | `FAL_KEY`, optional `FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL` |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, optional `R2_JURISDICTION`, `R2_ENDPOINT` |
| Neon | `DATABASE_URL`, optional `DATABASE_URL_UNPOOLED` |
| Trigger.dev | `TRIGGER_SECRET_KEY`, optional `TRIGGER_API_URL` |
| Your own media machine | `MEDIA_WORKER_URL`, `MEDIA_WORKER_SECRET`, `WEBHOOK_BASE_URL` |

`GET /health?verify=1` contacts a provider when its key is set. That check was not run against live paid APIs in this repository. Confirm the provider's current billing before you open it. `GET /providers` prints webhook URLs to paste into Fal and AssemblyAI when `WEBHOOK_BASE_URL` is the public origin.

FFmpeg on this service can probe, analyze, and write preview files when those functions run. `POST /jobs` only stores the job. Do not schedule Demucs or Librosa here.

## What not to claim

Transcription, Claude, and Fal return not configured or mock results until keys exist, and even then those live calls were not verified in this repository's test run. See `KNOWN_LIMITATIONS.md` and `FINAL_SETUP_CHECKLIST.md`.
