# Setup checklist

Do these in order. You do not need every key on day one. The editor opens with none of them. Do not put keys in chat, in git, or in the web page build.

The app is not finished for the public. Use this list to turn pieces on after you have read `KNOWN_LIMITATIONS.md`.

## 1. On your computer

1. Install Node.js 22 or newer.
2. Install FFmpeg and make sure `ffmpeg` and `ffprobe` run in a terminal.
3. Open a terminal in this project folder.
4. Run `npm install`.
5. Run `npm test`. You want every test to pass before you continue.
6. Run `npm run dev`. Open `http://127.0.0.1:5173/`. You should see the editor.
7. In a second terminal, run `npm run server`. It should say it is listening on `http://127.0.0.1:8787`.
8. Reload the editor. The page can now share its project with the API.

## 2. Your private settings file

1. Copy `.env.example` to a file named `.env` in the project folder.
2. Leave values empty until the step that needs them.
3. Never commit `.env`.

## 3. Turn on spending limits before any paid key

Set these in `.env` if you will use Claude, Fal, AssemblyAI, or OpenAI. Amounts are dollars, such as `10.00`. Empty means that limit is off.

| What you are limiting | Name in `.env` |
| --- | --- |
| One project | `DEFAULT_PROJECT_BUDGET_USD` |
| One production run | `MAX_RUN_SPEND_USD` |
| One UTC day | `MAX_DAILY_SPEND_USD` |
| One UTC month | `MAX_MONTHLY_SPEND_USD` |

Restart `npm run server` after you change `.env`.

## 4. Lock the API before it leaves your machine

| What | Name in `.env` |
| --- | --- |
| Owner password for changes | `APP_AUTH_TOKEN` |
| Secret for timed media links | `MEDIA_SIGNING_SECRET` |
| Address the API binds | `HOST` |
| Port | `PORT` |

On your computer, leave `HOST` as `127.0.0.1`. `npm run dev` and `npm run server` stay on `127.0.0.1`. `GET` health stays open. Changes require `Authorization: Bearer` plus `APP_AUTH_TOKEN` when that value is set.

On Railway, leave `HOST` and `PORT` empty. Railway sets `PORT`. The process binds `0.0.0.0` so Railway can reach it, including when `HOST=127.0.0.1` was copied in by mistake. The editor page does not send `APP_AUTH_TOKEN`. With that token set, the page still opens and timeline saves stay in the browser tab.

## 5. Optional services

Add one key, restart the server, and open `GET http://127.0.0.1:8787/health?verify=1` only when you are ready for that provider to see a read-only check. That check was not billed as a video generation in our reading of the docs, but you should confirm the provider's current billing.

| Service | What you buy | Names in `.env` | Signup |
| --- | --- | --- | --- |
| Claude | Language model | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_WORKSPACE_ID`, model names `ANTHROPIC_CREATIVE_MODEL`, `ANTHROPIC_EXECUTION_MODEL`, `ANTHROPIC_REVIEW_MODEL`, and the `*_FALLBACKS` lists | https://platform.claude.com/settings/keys |
| AssemblyAI | Captions | `ASSEMBLYAI_API_KEY`, optional `ASSEMBLYAI_BASE_URL`, `ASSEMBLYAI_SPEECH_MODEL`, `ASSEMBLYAI_SPEECH_MODEL_FALLBACK`, webhook `ASSEMBLYAI_WEBHOOK_HEADER_NAME`, `ASSEMBLYAI_WEBHOOK_HEADER_VALUE` | https://www.assemblyai.com/app |
| OpenAI | Backup captions | `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_TRANSCRIPTION_FALLBACKS`, `TRANSCRIPTION_PROVIDER` | https://platform.openai.com/api-keys |
| Fal | Pictures and video | `FAL_KEY`, optional `FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL` | https://fal.ai/dashboard/keys |
| Cloudflare R2 | Stored files | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, optional `R2_JURISDICTION`, `R2_ENDPOINT` | https://developers.cloudflare.com/r2/api/tokens/ |
| Neon | Hosted database later | `DATABASE_URL`, optional `DATABASE_URL_UNPOOLED` | https://console.neon.tech |
| Trigger.dev | Hosted jobs later | `TRIGGER_SECRET_KEY`, optional `TRIGGER_API_URL` | https://trigger.dev/docs/apikeys |
| Your own media machine | FFmpeg worker later | `MEDIA_WORKER_URL`, `MEDIA_WORKER_SECRET`, `WEBHOOK_BASE_URL` | You host this. It is not included. |

Local files, if you are not using R2 yet:

| What | Name in `.env` |
| --- | --- |
| Job database | `JOBS_DB_PATH` |
| Uploads | `MEDIA_ROOT` |
| Check providers at startup | `PROVIDER_HEALTH_VERIFY` |

## 6. Do not expect these yet

- A finished video from a sentence, with live Claude and live Fal, has not been verified.
- Sung lyrics are marked uncertain. They are not a tested music aligner.
- Vocal isolation will say it is unavailable.
- Trigger.dev will not run the jobs. SQLite does.
- Neon will not replace the job database.
- The page has no accounts for a team.

When a provider is connected for real, `GET /health?verify=1` should say `connected and verified` for that row. Until you see that, treat the feature as off. Live providers were not verified in this repository.

## 7. Railway, one service

Do this after the Dockerfile is on the branch you deploy. After it is merged, that branch is `main`. The app is not production-ready. This only puts the same unfinished app on one Railway service. Keys are typed into Railway's Variables tab, never into git.

1. Open https://railway.com and sign in.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**. Allow the Railway GitHub app if it asks.
4. Select `JACKNlFE/Video-Generator`. Stop there. Do not add a second service, Postgres, or Redis.
5. Railway finds the root `Dockerfile` (Node 22 and FFmpeg) and starts `npm run server`. One process serves the editor and the API. Leave that start command as it is.
6. Wait for the deploy. It can succeed with no provider keys.
7. Add a volume. Right-click the project canvas, or press `Ctrl+K` (`Command+K` on a Mac), add a volume, attach it to this one service, and set the mount path to `/data`.
8. Open the service **Variables** tab. Add the rows below. The secret values stay in Railway.
9. Open **Settings → Networking → Public Networking** and click **Generate Domain** after the deploy, so Railway can see the port. The `https://` address is the public URL for both the editor and the API.
10. Set `WEBHOOK_BASE_URL` to that address with no path on the end.
11. Open the public URL. You should see the editor. Open `https://your-domain/health`. Look for `"ok": true`. `sqlite` and `local-disk` should say `connected and verified`. Other rows stay `not configured` until you add that key. That page does not mean a live provider was verified.

`railway.toml` points Railway at the Dockerfile, the start command `npm run server`, and the health check `/health`. Railway stops reading that file for a new service on December 1, 2026. The Dockerfile still runs `npm run server`. If the health check disappears, set it to `/health` in the service settings.

Do not copy `HOST=127.0.0.1` or `PORT=8787` into Railway. Leave both empty. Railway sets `PORT`, and the process binds `0.0.0.0`.

Persistent paths, on the volume, not inside the image:

| What | Name | Value |
| --- | --- | --- |
| Job database | `JOBS_DB_PATH` | `/data/platform.sqlite` |
| Uploads | `MEDIA_ROOT` | `/data/media` |

If you leave the computer values `data/platform.sqlite` and `data/media`, those files are wiped on the next deploy. The container log says so. If you leave both names empty and the volume mount is `/data`, the process uses `/data/platform.sqlite` and `/data/media`.

Set these in Railway variables before other people can open the URL, and before any paid key. Empty budget means that limit is off. Example amounts are dollars, such as `10.00`.

| What | Name |
| --- | --- |
| Owner token for API changes | `APP_AUTH_TOKEN` |
| Secret for timed media links | `MEDIA_SIGNING_SECRET` |
| One project | `DEFAULT_PROJECT_BUDGET_USD` |
| One production run | `MAX_RUN_SPEND_USD` |
| One UTC day | `MAX_DAILY_SPEND_USD` |
| One UTC month | `MAX_MONTHLY_SPEND_USD` |

`APP_AUTH_TOKEN` is a long random string. The editor page does not send it. With it set, API changes from the page are refused and the timeline stays in the browser tab. `GET /health` stays open. Do not put the token in the page or in git.

Optional provider keys use the same names as `.env.example`. Add one, let Railway redeploy, and only then open `https://your-domain/health?verify=1` if you accept that provider's current billing. This repository did not run that check against a live provider.

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

Keep one replica. The volume holds one SQLite file. A second service is not part of this setup.
