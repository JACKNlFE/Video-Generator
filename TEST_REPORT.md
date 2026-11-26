# Test report

Recorded about 6:02 PM CT on Wednesday, November 25, 2026. No Anthropic, Fal, AssemblyAI, or OpenAI key was set. Nothing in this report is a live provider success.

## Commands

Working directory: `/agent/repos/Video-Generator`.

```text
npx tsc --noEmit --pretty false
# exit 0

npm run lint
# lint is tsc --noEmit
# exit 0

npm test
# exit 0
# Test Files  12 passed (12)
# Tests  49 passed (49)
# Start at  00:02:52 UTC
# Duration  1.86s

npm run build
# vite v6.4.6
# exit 0
# dist/index.html, dist/assets/index-BQMTSL6D.css, dist/assets/index-PLlxwMEe.js
```

`npm run build` was run before the last signature-expiry fix. That fix is server-only, so the client bundle was not rebuilt. The 49 passing tests are after the fix.

## What the tests actually did

- 6 original editor registry tests.
- Caption sync, spoken-word guard, speed, effects, uncertain lyric alignment, and the Demucs refusal.
- Mock assistant glow edit, iteration limit, and a budget gate that blocks a second reservation.
- ffmpeg tone with a silenced middle, and a preview mp4.
- Fal catalog: no Runway id, null prices, music blocks video selection, missing key does not submit.
- Owner token, rate limit, and media signature.
- Vite bundle does not contain a fake key placed in `ANTHROPIC_API_KEY` or `VITE_ANTHROPIC_API_KEY`.

## What was not run

No live Claude message, Fal generation, AssemblyAI transcript, or OpenAI transcript. No browser click-through of the new assistant box. No sung-vocal benchmark. ESLint is not installed; `npm run lint` is the TypeScript check.
