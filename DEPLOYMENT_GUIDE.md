# Deployment guide

This app is not production-ready. The checks below are for a private machine or a later host. Paid providers were not called in the implementation environment, and several paths stay mocked or refused until you add keys and infrastructure.

## What you run

Two processes:

- The editor: `npm run build`, then any static file host for `dist/`.
- The API: `npm run server` (`tsx server/main.ts`) on `HOST` and `PORT`. Default is `127.0.0.1:8787`.

Vite's dev server proxies `/api` to that API. A static build does not. Put a reverse proxy in front so the site and the API share an origin, or the browser will not see `/api`.

The API needs a disk that survives restarts for `JOBS_DB_PATH` (default `data/platform.sqlite`) and `MEDIA_ROOT` (default `data/media`). A short-lived serverless disk will forget jobs and uploads.

## Do this before anyone else can reach the API

1. Leave `HOST` at `127.0.0.1` until a proxy you control is in front.
2. Set `APP_AUTH_TOKEN` to a long random string. POST, PUT, and DELETE then require `Authorization: Bearer` that token. GET stays open so health can be read.
3. Set `MEDIA_SIGNING_SECRET` before you turn on file links. Unsigned file download is not enabled.
4. Set `DEFAULT_PROJECT_BUDGET_USD`, `MAX_RUN_SPEND_USD`, `MAX_DAILY_SPEND_USD`, and `MAX_MONTHLY_SPEND_USD` before you add a paid key.
5. Do not put provider keys in the Vite build or in any `VITE_` variable.

## Preview and production

Use the same build. Change only environment variables: keys, budgets, `TRIGGER_API_URL`, `DATABASE_URL`, and `WEBHOOK_BASE_URL`. There is no separate preview integration in the repo.

`WEBHOOK_BASE_URL` should be the public API origin, with no path. `GET /providers` prints the webhook URLs to paste into Fal and AssemblyAI.

FFmpeg must be on the API machine for probe, analysis, and preview files. Demucs and Librosa are not installed. Do not schedule those jobs on a host that only has a short request timeout. `POST /jobs` only stores the job.

## What not to deploy yet

Do not point a public marketing site at this API and call it finished. Transcription, Claude, and Fal return not configured or mock results until keys exist, and even then those live calls were not verified in this repository's test run. See `KNOWN_LIMITATIONS.md` and `FINAL_SETUP_CHECKLIST.md`.
