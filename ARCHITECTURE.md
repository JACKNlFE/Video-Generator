# Architecture

The browser editor and the API share one project document shape, defined in `src/editor/schema.ts`. Phase 1 commands still go through `executeTool`. Newer caption, effect, transform, subtitle, analysis, and render commands use that same function and the same undo stack.

When `npm run server` is running, Vite proxies `/api` to `127.0.0.1:8787` and the page creates its project there. If the API is down, the page keeps a tab-local copy and says so. There is no second timeline format.

## Processes

- `npm run dev` serves the React editor. It has no provider keys.
- `npm run server` serves jobs, budgets, editor tools, uploads, and the assistant.
- FFmpeg runs inside media jobs, not inside the browser. Vocal separation is refused because Demucs is not installed.
- Paid providers are called only from server code, and only when that provider's key is set. This environment has no keys, so tests use mocks and label `liveVerified: false`.

## Data

- Editor sessions are JSON in the SQLite table `editor_sessions`.
- Jobs, webhook deliveries, reservations, and usage stay in the Stage 1 tables.
- Uploaded bytes go to `MEDIA_ROOT`. The project stores the file name, not the bytes.
- Captions store source-media times. Timeline times are derived from the clip's start, trim, and speed, so a move does not rewrite the words.
- Raw transcripts stay on `project.transcripts`. Caption `text` can change punctuation. `editCaptionText` rejects a change to the spoken words unless the segment is a manual overlay.
- Audio analysis is cached on `project.analyses` with method `ffmpeg-energy-v1`. Beat tools read those timestamps. They do not ask a language model where the beats are.

## Assistant

Without `ANTHROPIC_API_KEY`, `POST /agent/turns` uses `mockPlanner`. It can apply a glow or a speed change when the message includes `project:<id>` and `clip:<id>`. It does not write transcript text. With a key, the same loop calls the Anthropic Messages API through `@anthropic-ai/sdk` and the configured execution model. That path was not executed here.

`attachTranscript`, `storeAudioAnalysis`, and `completeRender` are server tools. They are hidden from the model so it cannot invent a transcript or mark a render finished.
