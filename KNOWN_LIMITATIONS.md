# Known limitations

The app is not production-ready. Status words mean:

- implemented-and-verified: a test or local command exercised the behavior, and it does not depend on a paid provider.
- implemented-not-live: the code path exists and tests use a mock or a local tool. No live provider response was recorded.
- partial: some of the behavior exists.
- blocked-credentials: needs a key that was not present.
- blocked-infrastructure: needs software or a machine that is not installed.
- not implemented: no working path.

## Brief sections

| Section | Status | What is true |
| --- | --- | --- |
| 1. Manual editor and autonomous production | partial | Manual edits work. The assistant is a mock unless Anthropic is configured, and that live call was not run. |
| 2. Preserve an existing editor | implemented-and-verified | Phase 1 registry tests still pass. The original checkout had no editor; this repo built one. |
| 3. Modular architecture | partial | Typed providers, jobs, and budgets exist. Many modules do not call providers. |
| 4. Model routing | implemented-not-live | Fast, advanced, and maximum pick configured Claude ids. The models were not called. |
| 5. Tool registry | partial | Phase 1 edits plus captions, effects, transforms, subtitles, and queued generation. `transcribeAudio` as a direct editor tool is still unsupported; transcription is a job. |
| 6. Production plans | implemented-and-verified | Version 1 plans validate in tests. They are not produced by a live creative model. |
| 7. Generative video | implemented-not-live | Documented endpoint ids are stored. Prices are unset. No Fal call. Music blocks video selection. |
| 8. Generative image | implemented-not-live | FLUX schnell and FLUX 1.1 pro ids are stored. No Fal call. |
| 9. Captions | partial | Word times, sync, styles, SRT, and WebVTT are real. Live AssemblyAI and OpenAI were not called. The model cannot change spoken words. |
| 10. Audio analysis | partial | ffmpeg energy, silence, and loudness are verified on a generated tone. Librosa is not installed. BPM is omitted when onsets are too few. |
| 11. Media intelligence | partial | ffprobe duration and cached analysis. No vision descriptions. |
| 12. Timeline | partial | Shared document, undo, version checks. Effects and captions are on that document. |
| 13. Assistant UI | partial | One assistant box and a provider check. Not the full panel set. |
| 14. Database and storage | partial | SQLite for jobs and the editor session. Neon and R2 are optional and were not connected. |
| 15. Background jobs | partial | Jobs, idempotency, cancel, retry, and webhook checks exist. ffmpeg preview is a separate call, not the HTTP create. Trigger.dev does not run tasks. |
| 16. Budgets | partial | Project, run, daily, and monthly reservations are enforced when set. Iteration stop is tested. Approval thresholds and footage caps are not a full product flow. |
| 17. Security | partial | Keys stay server-side. Optional owner token, rate limit, and signed-name helper are tested. There is no multi-user login. |
| 18. Preview and export | partial | ffmpeg can write a preview mp4 with burned subtitles in a test. A full timeline of user media is not a verified export. |
| 19. Tests | partial | Unit tests, typecheck, and Vite build. No browser click-through of every new panel. |
| 20. Phases | partial | Phase 0, Phase 1, Stage 1, and steps A–C are in stacked branches. Live acceptance is not done. |
| 21. End-to-end story | implemented-not-live | Module tests cover edits, mock assistant, captions from a fixture, lyric alignment, beats, and a preview file. They do not use live providers. |
| 22. Docs | implemented-and-verified | The guides in this repo match the code that was run. They do not claim a live provider success. |

## Hard gaps

- No Claude, AssemblyAI, OpenAI, or Fal response was captured.
- Runway has no stored endpoint id.
- Fal, AssemblyAI, and OpenAI prices are unset. Haiku's "from" price and Claude cache-write prices are unset.
- Demucs is not installed. Vocal separation fails closed.
- Lyric alignment is marked uncertain and was not benchmarked on sung vocals.
- `gpt-transcribe` word timestamps are not documented, so they are not claimed.
- The editor still has no accounts. One owner token is optional.
- Node prints an experimental warning for `node:sqlite`.
- `npm audit` reports issues in vitest's dependencies and in zod. `npm audit fix --force` was not run.
