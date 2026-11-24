# MASTER BUILD BRIEF — AUTONOMOUS AI VIDEO CREATION AND EDITING PLATFORM

## 1. Project objective

Extend my existing video editing application into a fully autonomous, natural-language-driven AI video creation and editing platform.

The application should allow a user to describe a desired video in ordinary language, upload any relevant media assets, and have an AI agent autonomously create, edit, review, revise and prepare a complete video for export.

The application must support both:

1. Traditional manual video editing.
2. Fully autonomous AI-powered video creation and editing.

The AI must have comprehensive programmatic access to the video editing capabilities available within the application. It should be capable of performing virtually any editing operation that a human user can perform through the application's interface, subject to explicit permissions and budget constraints.

The AI must be able to generate original media assets using external generative AI APIs when requested or when necessary for an authorized production plan.

The resulting video must remain fully editable within the existing video editor. Do not simply generate a flattened MP4 without preserving the editable project timeline.

## 2. Existing codebase preservation

This is an extension of an existing application, not a greenfield project.

Before implementing anything:

- Inspect the entire existing repository.
- Identify the current frontend, backend, database, rendering architecture, timeline representation, media storage, authentication and deployment configuration.
- Identify all existing editing functionality.
- Identify how editing operations are currently executed and how project state is stored.
- Determine which existing components can be reused.
- Identify architectural limitations that could prevent AI-controlled editing.
- Produce an implementation plan based on the actual repository.
- Preserve existing working functionality, UI components and user workflows.
- Do not rebuild or replace functioning systems unnecessarily.
- Do not delete existing features to simplify AI integration.
- Avoid incompatible or unnecessarily destructive database migrations.
- Follow the repository's established coding conventions.

Where this build brief conflicts with the existing architecture, prefer adapting the proposed implementation to the existing codebase unless a significant architectural deficiency requires a change.

Document material architectural decisions and their rationale.

## 3. Core application architecture

Implement a modular AI video production architecture consisting of the following components:

- AI orchestration and model routing.
- Creative planning and strategy.
- Autonomous editing execution.
- Programmatic editing tool registry.
- Video generation provider integration.
- Image generation provider integration.
- Audio transcription and caption generation.
- Vocal isolation and lyric alignment.
- Audio analysis and beat detection.
- Media asset management.
- Timeline and project state management.
- Preview rendering.
- Automated quality assurance.
- Final rendering and export.
- Background job processing.
- Cost tracking and budget enforcement.

These components should communicate through clearly defined, typed interfaces.

Use deterministic software for operations that do not require AI reasoning.

Do not use expensive language model calls for basic mathematical calculations, file operations, straightforward rendering operations or deterministic media processing.

## 4. AI model architecture

Integrate the Anthropic API using the official Anthropic SDK.

Implement a provider-agnostic orchestration layer that allows models to be updated, replaced or reassigned without restructuring the application.

Use the following initial model configuration, subject to verification against current Anthropic API documentation and account availability:

- Creative director: Claude Fable 5.2.
- Advanced reasoning and quality assurance: Claude Opus 5.5.
- Editing execution: Claude Sonnet 5.5.

Store model identifiers in server-side environment variables or a configurable model registry.

Do not assume that every model is available to the configured API account. Implement capability validation and configurable fallback models.

### 4.1 Creative director

The creative director is responsible for:

- Interpreting the user's natural-language instructions.
- Understanding the intended audience and purpose.
- Determining aesthetic direction.
- Developing a storyboard and scene structure.
- Determining pacing, transitions, visual hierarchy and emotional progression.
- Evaluating available media assets.
- Determining whether original video or image assets need to be generated.
- Creating prompts for external generative AI models.
- Planning audio synchronization.
- Planning captions and typography.
- Developing a structured production plan.
- Establishing estimated production costs.
- Communicating success criteria to the editing agent.

The creative director must produce a machine-readable production plan rather than only an unstructured textual description.

Validate all structured outputs against a defined schema.

### 4.2 Editing execution agent

The execution agent is responsible for:

- Interpreting the production plan.
- Inspecting the current project and timeline.
- Selecting appropriate editing tools.
- Executing editing operations through the programmatic tool registry.
- Generating required media assets through approved APIs.
- Importing assets into the project.
- Constructing and modifying the timeline.
- Synchronizing visuals with audio.
- Creating caption tracks.
- Applying animations, transitions and effects.
- Rendering previews.
- Reporting errors and requesting assistance when necessary.
- Implementing revisions requested by the user or quality reviewer.

The execution agent should operate in a controlled agentic loop.

Each iteration should inspect the relevant project state, perform validated operations and receive structured results.

The agent must not depend on simulated mouse clicks or browser interactions when equivalent programmatic editing functions exist.

### 4.3 Advanced reasoning and quality assurance

Use Opus for difficult editing decisions, failed execution recovery and optional high-quality review.

The quality reviewer should evaluate:

- Alignment with the original user request.
- Visual consistency.
- Scene composition.
- Temporal continuity.
- Audio synchronization.
- Caption synchronization.
- Caption readability.
- Transition quality.
- Missing or broken media.
- Incorrect aspect ratios.
- Unintended gaps or black frames.
- Clipped or distorted audio.
- Overall creative coherence.

The reviewer should return structured findings, severity levels and actionable revision instructions.

Limit automatic revision cycles through configurable iteration and cost constraints.

Do not claim that an AI reviewer watched or listened to an entire video unless the configured model actually supports those modalities. Use sampled frames, contact sheets, timestamped transcripts, audio metrics and timeline metadata to provide the necessary context.

### 4.4 Intelligent model routing

Implement three production modes:

**Fast mode**

- Use Sonnet for simple instructions and routine editing.
- Skip unnecessary creative planning and expensive review.
- Prioritize speed and low cost.

**Advanced mode**

- Use Opus for planning and difficult creative decisions.
- Use Sonnet for execution.
- Perform appropriate validation and quality review.

**Maximum quality mode**

- Use Fable for creative direction.
- Use Sonnet for execution.
- Use Opus or Fable for complex exceptions and final review when justified.
- Prioritize creative quality within the configured budget.

Do not invoke every model for every request.

Allow the user to select a production mode or enable automatic routing.

Begin implementation with a reliable single-agent editing workflow. Add multi-agent orchestration after the core editing tools are verified.

## 5. Programmatic editing tool registry

Create a comprehensive editing tool registry that exposes the existing application's capabilities to AI agents.

Reuse existing editing commands, state reducers, services and rendering functions wherever possible.

The AI should invoke the same underlying editing operations used by the manual interface so that changes remain consistent across manual and automated workflows.

Create typed input and output schemas for every tool.

Use Zod or an equivalent schema validation library.

Tools should support operations including, where applicable:

### Project management

- Create project.
- Inspect project.
- Inspect timeline.
- Retrieve project configuration.
- Change aspect ratio.
- Change resolution.
- Change frame rate.
- Create project checkpoint.
- Restore checkpoint.
- Undo operation.
- Redo operation.

### Media management

- List available media assets.
- Import media.
- Inspect media metadata.
- Search the asset library.
- Generate video assets.
- Generate image assets.
- Extract audio.
- Extract video frames.
- Detect scene boundaries.
- Generate media proxies.
- Replace media assets.

### Timeline editing

- Create track.
- Remove track.
- Add clip.
- Remove clip.
- Duplicate clip.
- Move clip.
- Trim clip.
- Split clip.
- Crop clip.
- Resize clip.
- Reverse clip.
- Change playback speed.
- Freeze frame.
- Reorder clips.
- Align clips.
- Group clips.
- Set clip duration.

### Visual editing

- Apply visual effects.
- Remove effects.
- Modify effect parameters.
- Add transitions.
- Adjust transition duration.
- Apply color grading.
- Adjust opacity.
- Modify brightness, contrast, saturation and exposure.
- Add overlays.
- Add masks.
- Set position, scale and rotation.
- Create and modify keyframes.
- Apply supported animation presets.

### Audio editing

- Import audio.
- Trim audio.
- Move audio.
- Adjust volume.
- Normalize loudness.
- Apply fade-in and fade-out.
- Duck background audio.
- Mute tracks.
- Mix multiple audio tracks.
- Extract vocals.
- Detect tempo.
- Detect beats and onsets.
- Synchronize clips to audio events.
- Transcribe audio.
- Align known lyrics to audio.

### Caption and text editing

- Generate captions.
- Create caption track.
- Add caption segment.
- Edit caption text.
- Edit caption timing.
- Split caption segments.
- Merge caption segments.
- Set caption style.
- Apply word-level highlighting.
- Animate captions.
- Set caption positioning.
- Add text overlay.
- Import subtitle files.
- Export subtitle files.

### Rendering and inspection

- Generate preview.
- Retrieve sampled preview frames.
- Generate contact sheets.
- Inspect timeline statistics.
- Validate project.
- Inspect caption synchronization.
- Inspect audio metrics.
- Export final video.
- Export project data.

This list is illustrative, not exhaustive.

Inventory the existing editor and expose all supported editing features through appropriate tools.

If a requested capability is not currently supported, implement it only when consistent with the existing architecture and project requirements. Never report unsupported operations as successfully completed.

Support batched editing operations to minimize excessive model calls.

Implement structured error handling, project-version validation, transaction boundaries and undoable operations.

All tools must enforce user authorization, project ownership and applicable budget restrictions.

## 6. Structured production plans

Define a versioned production plan schema containing fields such as:

- Project identifier.
- Original user request.
- Creative objective.
- Target audience.
- Target platform.
- Video duration.
- Aspect ratio.
- Frame rate.
- Creative style.
- Color palette.
- Available assets.
- Required generated assets.
- Scene definitions.
- Timeline instructions.
- Audio instructions.
- Caption instructions.
- Transition instructions.
- Effect instructions.
- Rendering instructions.
- Cost estimate.
- Success criteria.
- Required approvals.

Each scene should support:

- Start time and end time.
- Creative purpose.
- Visual description.
- Source media requirements.
- Generation prompts.
- Camera or motion instructions.
- Transition requirements.
- Audio synchronization points.
- Caption or text requirements.
- Visual effects.
- Dependencies.

Persist production plans so that users can review, revise, reproduce or resume production jobs.

## 7. Generative video integration

Integrate Fal.ai as the initial video generation gateway.

Use the official Fal.ai client SDK.

Implement a provider abstraction that allows additional direct integrations with Google Veo, Runway, Kling, LTX and other supported video generation providers in the future.

Support both:

- Text-to-video generation.
- Image-to-video generation.

Where available, support:

- Starting and ending reference frames.
- Image references.
- Aspect ratio configuration.
- Resolution configuration.
- Duration configuration.
- Motion controls.
- Camera motion controls.
- Seed configuration.
- Negative prompts.
- Audio generation toggles.

Create a model capability registry containing:

- Provider.
- Model identifier.
- Supported generation modes.
- Supported resolutions.
- Supported aspect ratios.
- Supported durations.
- Audio capabilities.
- Reference image capabilities.
- Pricing information.
- Pricing unit.
- Availability.
- Applicable usage restrictions.

Initially evaluate models from these families:

- Google Veo.
- Kling.
- LTX.
- Wan.
- Runway.
- Seedance.

Verify actual model endpoints, account availability, accepted parameters and current pricing against provider documentation.

Do not invent API endpoint identifiers or assume that all models support the same parameters.

Enable model selection based on:

- Quality requirements.
- Budget.
- Visual style.
- Motion complexity.
- Requested duration.
- Reference asset requirements.
- Generation speed.
- Audio requirements.

Default to silent generation for music videos when generated audio is unnecessary.

Use queued background jobs rather than blocking HTTP requests.

Implement job persistence, webhook processing, polling fallback, idempotency, retry handling and cancellation where supported.

Download successfully generated assets into persistent application-controlled storage.

Do not depend permanently on temporary provider URLs.

Generated assets must be registered in the project's media library and made available for subsequent editing operations.

## 8. Generative image integration

Integrate image generation through Fal.ai.

Initially evaluate the FLUX model family and other cost-effective supported models.

Support:

- Text-to-image generation.
- Reference-image-based generation.
- Image editing where supported.
- Aspect ratio configuration.
- Consistent visual style across scenes.
- Seed configuration where available.
- Generation of reference frames for image-to-video workflows.
- Background images.
- Graphic assets.
- Thumbnails and cover imagery.

Allow the creative director to determine when an animated still image is more cost-effective than generating full-motion video.

The editing agent should be able to apply pans, zooms, keyframe motion, overlays and transitions to still images using the existing video editor.

## 9. Audio transcription and automatic captioning

Implement a first-class automatic captioning subsystem that can be used independently of the conversational AI agent.

Users must be able to upload an audio or video file and automatically generate accurate, synchronized captions.

### 9.1 Primary transcription provider

Integrate AssemblyAI as the initial primary transcription provider.

Use a current prerecorded speech-to-text model that supports word-level timestamps.

Verify model identifiers and supported features against official documentation.

Implement a transcription provider interface so that additional transcription services can be integrated without changing the captioning architecture.

### 9.2 Secondary transcription provider

Integrate the current supported OpenAI transcription API as an optional fallback or accuracy-verification provider.

Use a currently supported production model.

Do not introduce a permanent dependency on the deprecated Whisper API endpoint.

Where the secondary transcription model does not provide word timestamps, align its transcript using the primary provider's timing data or a dedicated forced-alignment engine.

The secondary provider should be optional and invoked selectively when confidence is low or additional accuracy is requested.

### 9.3 Supported audio inputs

Support common audio and video formats, including:

- MP3.
- WAV.
- M4A.
- AAC.
- FLAC.
- OGG.
- MP4.
- MOV.
- WebM.

Validate actual file types, duration and file size.

Use FFmpeg to extract or convert audio into a provider-supported format when necessary.

Preserve the original uploaded audio file.

Create separate analysis copies rather than destructively altering source media.

### 9.4 Speech transcription mode

Optimize for:

- Spoken dialogue.
- Narration.
- Podcasts.
- Voiceovers.
- Interviews.
- Social media clips.
- Multiple speakers.
- Multilingual speech.

Where supported, enable:

- Automatic language detection.
- Word-level timestamps.
- Segment-level timestamps.
- Punctuation.
- Capitalization.
- Confidence scores.
- Speaker identification.
- Custom vocabulary.
- Proper-noun spelling hints.

### 9.5 Music and lyric transcription mode

Implement a dedicated mode for music and singing.

This mode should support:

- Singing.
- Rap.
- Melodic vocals.
- Auto-Tuned vocals.
- Music with substantial background instrumentation.
- Music with vocal effects, echo and reverb.

Allow users to choose from:

1. Automatic lyric transcription from uploaded music.
2. Alignment of user-supplied lyrics with the uploaded music.
3. Transcription of an isolated vocal track.
4. Manual lyric entry with assisted synchronization.

Integrate optional vocal separation using Demucs, a hosted source-separation model or an equivalent supported solution.

Vocal isolation should be used only for analysis unless the user explicitly requests an isolated vocal track in the final video.

Preserve the original audio in the final project.

Implement a forced-alignment abstraction capable of aligning known lyrics or transcript text against the corresponding audio.

Evaluate appropriate alignment technologies, including compatible WhisperX workflows or other maintained alignment engines.

Benchmark candidate aligners on sung vocals before choosing a production default.

Do not assume that a speech alignment model performs equally well on music.

When a user supplies exact lyrics, prioritize those lyrics over AI-generated guesses.

Handle repeated choruses, elongated syllables, overlapping vocals, instrumental sections and ad-libs.

Flag uncertain alignments for user review instead of inventing lyrics or timestamps.

### 9.6 Caption accuracy pipeline

Implement the following workflow:

1. Upload and validate media.
2. Extract the relevant audio track.
3. Detect language and audio duration.
4. Determine speech or music transcription mode.
5. Optionally preprocess or isolate vocals.
6. Run primary transcription.
7. Retrieve transcript, word timings and confidence information where supported.
8. Identify low-confidence regions.
9. Optionally perform targeted secondary transcription.
10. Reconcile transcription differences.
11. Align corrected text with the audio.
12. Generate readable caption segments.
13. Add editable caption tracks to the project.
14. Allow user corrections.
15. Persist the final corrected transcript and timing data.

Do not allow an LLM to freely rewrite spoken content or lyrics.

Use language models selectively for formatting, punctuation, segmentation and context-assisted correction.

Preserve the original transcript separately from any corrected or formatted version.

### 9.7 Caption data model

Store each caption segment with:

- Unique identifier.
- Track identifier.
- Source asset identifier.
- Caption text.
- Start timestamp.
- End timestamp.
- Language.
- Speaker identifier, if available.
- Confidence, if available.
- Word-level timing data.
- Styling information.
- Animation configuration.
- Manual correction status.
- Source transcription job identifier.

Each word should support:

- Text.
- Start timestamp.
- End timestamp.
- Confidence, if available.
- Highlighting configuration.

Use a consistent integer-based time representation, such as milliseconds, with frame-accurate conversion at rendering time.

Store source-media timestamps separately from timeline timestamps.

Ensure captions remain correctly synchronized when audio clips are moved, trimmed, split, stretched or otherwise modified.

### 9.8 Caption styling system

Implement configurable caption presets, including:

- Standard subtitles.
- Short-form social media captions.
- Word-by-word highlighting.
- Karaoke-style highlighting.
- Animated single-word captions.
- Cinematic lyric captions.
- Multi-line captions.
- Minimal typography.
- Speaker-specific caption styles.

Allow adjustment of:

- Font family.
- Font size.
- Font weight.
- Text color.
- Highlight color.
- Background color.
- Background opacity.
- Stroke and outline.
- Shadow.
- Letter spacing.
- Line spacing.
- Alignment.
- Position.
- Maximum words per caption.
- Maximum characters per line.
- Animation type.
- Animation duration.
- Safe-area margins.

Support caption placement appropriate for TikTok, Instagram Reels and YouTube Shorts, including configurable interface-safe zones.

Captions must be editable directly in the existing timeline and preview interface.

Implement an explicit Auto Captions control that works without requiring Claude.

### 9.9 Caption export

Support:

- Burned-in captions.
- SRT subtitle export.
- WebVTT subtitle export.
- Structured JSON export.
- Optional separate subtitle tracks where supported.

Ensure styled and animated captions render consistently between editor preview and final export.

## 10. Audio analysis and music synchronization

Implement deterministic audio-analysis capabilities using FFmpeg, Librosa or equivalent maintained libraries.

Support:

- Audio duration detection.
- Waveform generation.
- Tempo estimation.
- Beat detection.
- Onset detection.
- Loudness analysis.
- Silence detection.
- Peak detection.
- Audio clipping detection.
- Potential beat-drop detection.
- Section and energy-change analysis.

Treat inferred beat drops and musical section boundaries as estimates rather than guaranteed musical facts.

Expose timestamped audio analysis to the AI agents through structured tools.

The creative director and editing agent should be able to synchronize:

- Video cuts with beats.
- Transitions with musical changes.
- Text animations with vocal timing.
- Visual effects with audio events.
- Scene changes with changes in musical intensity.

Audio analysis should work independently of transcription.

## 11. Media intelligence and preview analysis

Implement a media-analysis layer that makes uploaded and generated assets understandable to the AI.

For video assets, extract:

- Duration.
- Resolution.
- Frame rate.
- Aspect ratio.
- Sampled frames.
- Scene boundaries.
- Motion information where practical.
- Audio presence.
- Audio transcript where relevant.

For images, extract:

- Resolution.
- Aspect ratio.
- File format.
- Optional AI-generated visual descriptions.

For audio, expose:

- Duration.
- Transcription.
- Word-level timing.
- Beat information.
- Tempo.
- Waveform information.
- Relevant loudness metrics.

Cache analysis results to avoid unnecessary repeated processing.

Generate contact sheets and selected preview frames for model inspection.

Allow agents to request specific timeline ranges for targeted preview inspection.

Do not send unnecessary full-resolution images or oversized media context to language models.

## 12. Editing state and timeline architecture

The existing timeline representation should remain the authoritative project state wherever practical.

Avoid creating a second incompatible timeline system solely for AI editing.

The AI should operate through validated editing commands that update authoritative project state.

Ensure support for:

- Multiple video tracks.
- Multiple audio tracks.
- Image tracks.
- Caption tracks.
- Text overlays.
- Effects.
- Transitions.
- Keyframes.
- Track visibility.
- Track locking.
- Track muting.
- Project versioning.
- Undo and redo.

Use stable asset, track and clip identifiers.

Implement optimistic concurrency or equivalent version checks to prevent conflicting updates.

AI editing operations must be observable in the manual editor.

Allow users to interrupt AI editing and manually refine the result.

Create checkpoints before major autonomous changes.

## 13. User interface

Extend the existing editor with an AI assistant interface.

The AI assistant should support:

- Natural-language chat.
- Asset attachments.
- Initial video creation requests.
- Follow-up editing instructions.
- Contextual awareness of the current project.
- Awareness of selected clips or timeline regions.
- AI production mode selection.
- Cost estimates.
- Budget settings.
- Progress updates.
- Generation job status.
- Error reporting.
- Cancellation.
- Undoing AI-generated changes.

Example user requests:

- Create a 15-second cinematic music video using the audio I uploaded.
- Generate futuristic city footage and synchronize the cuts to the beat.
- Add accurate captions to this audio.
- Use these exact lyrics and synchronize them word by word.
- Make the captions glow purple during the chorus.
- Remove the existing captions and replace them with animated typography.
- Generate a new five-second opening scene.
- Make the first three seconds more visually engaging.
- Replace the second scene without changing the music.
- Convert this video into a 9:16 TikTok edit.
- Make the final frame transition seamlessly into the beginning.

Add an explicit audio and captioning panel containing:

- Audio upload or track selection.
- Speech or music mode selection.
- Automatic caption generation.
- Optional lyric input.
- Vocal isolation option.
- Accuracy enhancement option.
- Language selection.
- Caption style selection.
- Transcript editing.
- Timing adjustment.
- Low-confidence word indicators.
- Subtitle export.

The captioning panel must remain usable even when the Anthropic API is unavailable.

## 14. Storage and database

Reuse existing storage and database services when sufficient.

If no suitable system exists, use PostgreSQL with Neon and Drizzle ORM.

Use Cloudflare R2 or equivalent S3-compatible object storage for persistent media assets.

Do not store large media binaries directly in PostgreSQL.

Evaluate existing database schemas before introducing new tables.

Suggested entities include:

- Users.
- Projects.
- Project versions.
- Media assets.
- Asset analysis.
- Tracks.
- Clips.
- Caption tracks.
- Caption segments.
- Caption words.
- AI conversations.
- AI production plans.
- Production jobs.
- Generation jobs.
- Transcription jobs.
- Rendering jobs.
- Tool execution logs.
- Model configurations.
- Provider configurations.
- Usage records.
- Budget records.

Store source asset references, job identifiers, model identifiers, timestamps, status information, cost estimates and actual usage where available.

Use database migrations and appropriate indexing.

Ensure project-level authorization for all records.

## 15. Background processing and deployment

Do not execute long-running video generation, transcription, vocal isolation or heavy rendering synchronously inside short-lived HTTP requests.

Implement durable background jobs using Trigger.dev or an equivalent system compatible with the existing stack.

Use dedicated container-based media workers for workloads that require FFmpeg, Python, Librosa, Demucs or substantial CPU/GPU resources.

If the application is hosted on Vercel:

- Keep the frontend and lightweight API endpoints on Vercel.
- Offload computationally intensive media processing to dedicated workers.
- Use durable queues and persistent job state.
- Stream or poll progress updates.
- Support retries, cancellation and resume functionality.

Use job states such as:

- Pending.
- Queued.
- Processing.
- Awaiting approval.
- Completed.
- Failed.
- Cancelled.

Implement idempotency to prevent duplicate API charges and duplicate asset creation.

Use webhooks where supported and authenticate provider webhook requests according to official documentation.

## 16. Cost management

Cost control is a core requirement.

Track usage from:

- Anthropic input tokens.
- Anthropic output tokens.
- Anthropic reasoning and cache usage where applicable.
- Image generation.
- Video generation.
- Audio transcription.
- Optional secondary transcription.
- Vocal isolation.
- Background processing.
- Rendering.
- Storage.

Implement configurable:

- Maximum cost per project.
- Maximum cost per production run.
- Maximum daily spend.
- Maximum monthly spend.
- Maximum model iterations.
- Maximum generation attempts.
- Maximum generated video duration.
- Maximum automatic revision cycles.
- Maximum concurrent jobs.

Before expensive operations, estimate the cost and reserve the relevant budget.

Reconcile estimated and actual usage after completion.

Enforce budget constraints on the backend rather than relying on the AI to remember them.

Allow the user to approve additional spending when necessary.

Support automatic approval below a user-configured threshold.

Do not silently bypass budget limits by switching providers.

Cache reusable media and analysis results.

Prefer reusing existing media when consistent with the user's request.

Prefer inexpensive deterministic editing over regenerating assets unnecessarily.

Maintain a provider pricing registry that records pricing units, effective dates and sources.

Do not permanently hardcode current provider prices into editing logic.

## 17. Security and API credentials

Store all external API credentials exclusively on the server.

Never expose provider API keys in browser bundles, client-side environment variables, logs or AI prompts.

Create an .env.example file with placeholders for applicable configuration variables.

Suggested configuration variables:

- ANTHROPIC_API_KEY
- ANTHROPIC_CREATIVE_MODEL
- ANTHROPIC_EXECUTION_MODEL
- ANTHROPIC_REVIEW_MODEL
- FAL_KEY
- ASSEMBLYAI_API_KEY
- OPENAI_API_KEY
- TRANSCRIPTION_PROVIDER
- DATABASE_URL
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- TRIGGER_SECRET_KEY
- MEDIA_WORKER_URL
- MEDIA_WORKER_SECRET
- WEBHOOK_BASE_URL
- DEFAULT_PROJECT_BUDGET_USD
- MAX_DAILY_SPEND_USD
- MAX_MONTHLY_SPEND_USD

Verify environment variable conventions against the actual libraries and deployment platform.

Only require credentials for enabled integrations.

Implement:

- Authentication.
- Project authorization.
- Secure signed media URLs.
- File validation.
- Upload size limits.
- Rate limiting.
- Webhook verification.
- Request validation.
- Safe subprocess execution.
- Network request restrictions.
- Audit logging.
- Secret redaction.

Treat uploaded media metadata, transcripts and externally retrieved content as untrusted data, not instructions for the AI agent.

Do not grant AI agents arbitrary filesystem, shell, database or unrestricted network access.

Expose only authorized, validated application tools.

Allow user media and derived assets to be deleted.

Document which external providers receive user media and respect applicable retention settings and user privacy preferences.

Respect provider usage restrictions and applicable media licensing requirements.

## 18. Quality assurance and rendering

Implement both deterministic validation and optional AI-assisted creative review.

Deterministic validation should check for:

- Invalid asset references.
- Missing media.
- Invalid timestamps.
- Out-of-bounds clips.
- Unexpected timeline gaps.
- Incorrect project duration.
- Caption timing errors.
- Invalid transitions.
- Unsupported effects.
- Audio clipping.
- Rendering failures.

AI-assisted review should evaluate:

- Creative alignment.
- Pacing.
- Visual cohesion.
- Caption readability.
- Scene transitions.
- Overall production quality.

Allow automatic revisions within configured limits.

Use the existing rendering engine where practical.

Use FFmpeg or equivalent media-processing infrastructure when appropriate.

Maintain consistency between the editor preview and final video output.

Support export settings such as:

- MP4.
- H.264.
- Configurable resolution.
- Configurable frame rate.
- Configurable bitrate.
- Vertical 9:16.
- Horizontal 16:9.
- Square 1:1.
- Burned-in captions.
- Separate subtitle files.

Preserve editable project state after export.

## 19. Testing and observability

Implement unit tests, integration tests and end-to-end tests for critical functionality.

Test cases should include:

- Correct editing tool execution.
- Invalid tool arguments.
- Unauthorized project access.
- Concurrent editing conflicts.
- Undo and rollback.
- Budget enforcement.
- Provider failures.
- Provider rate limits.
- Duplicate webhook delivery.
- Background job cancellation.
- Interrupted production runs.
- Missing media.
- Transcript editing.
- Word-level caption synchronization.
- Caption alignment after timeline edits.
- Preview and final-render consistency.

Create a small benchmark dataset containing spoken audio, noisy audio, multilingual audio and sung lyrics.

Measure transcription accuracy against known reference text.

For captions, evaluate both word error rate and timestamp alignment accuracy.

Flag uncertain results for review.

Benchmark the different Claude model configurations using equivalent editing tasks.

Measure:

- Successful task completion.
- Creative quality.
- Editing accuracy.
- Number of tool calls.
- Cost.
- Latency.
- Required manual corrections.

Use measured results to optimize model routing rather than assuming that the most expensive model is always best.

Implement structured logging and job-level observability.

Do not log private media content or credentials unnecessarily.

## 20. Implementation phases

### Phase 0 — Repository audit

Inspect the existing codebase and document:

- Current architecture.
- Existing editing functionality.
- Reusable components.
- Missing functionality.
- Required infrastructure changes.
- Proposed file and folder changes.
- Database migration requirements.
- Provider integration requirements.
- Implementation dependencies.

### Phase 1 — Programmatic editing foundation

- Create the editing tool registry.
- Connect tools to existing editing commands.
- Implement schema validation.
- Implement authoritative project state access.
- Implement undo and checkpoints.
- Verify AI-independent programmatic editing.

### Phase 2 — Single-agent autonomous editing

- Integrate the Anthropic SDK.
- Connect Opus or Sonnet to the editing tools.
- Implement conversational editing.
- Implement project inspection.
- Implement the controlled tool execution loop.
- Verify end-to-end editing from natural-language instructions.

### Phase 3 — Automatic captions and audio intelligence

- Integrate AssemblyAI.
- Implement direct audio upload and transcription.
- Implement word-level timestamps.
- Implement editable caption tracks.
- Implement caption styling and subtitle export.
- Implement music and lyric modes.
- Implement optional vocal isolation and forced alignment.
- Implement beat detection.
- Connect audio and caption tools to the editing agent.

### Phase 4 — Generative media

- Integrate Fal.ai video generation.
- Integrate Fal.ai image generation.
- Implement the model capability registry.
- Implement asynchronous generation jobs.
- Implement persistent generated asset storage.
- Enable autonomous asset generation and timeline insertion.

### Phase 5 — Multi-agent orchestration

- Implement Fable creative planning.
- Implement Sonnet execution.
- Implement Opus review and exception handling.
- Implement production plan schemas.
- Implement intelligent model routing.
- Implement configurable production modes.

### Phase 6 — Automated review and optimization

- Implement preview analysis.
- Implement deterministic quality checks.
- Implement AI-assisted creative review.
- Implement constrained automatic revisions.
- Implement production benchmarking.
- Optimize API costs and latency.

### Phase 7 — Production hardening

- Complete security validation.
- Complete background job reliability.
- Complete budget enforcement.
- Complete error handling.
- Complete testing.
- Complete deployment configuration.
- Complete documentation.

## 21. Acceptance criteria

The implementation is successful when the following workflow operates reliably:

1. A user opens an existing or new video project.
2. The user uploads audio and optionally other media assets.
3. The user describes the desired video in natural language.
4. The AI interprets the request and constructs a production plan.
5. The application estimates and enforces production cost.
6. The AI generates missing video or image assets when authorized.
7. The application accurately transcribes or aligns the uploaded audio.
8. The AI creates synchronized and editable caption tracks.
9. The AI constructs the video timeline through programmatic editing tools.
10. The AI applies requested visual effects, transitions and audio synchronization.
11. The application renders and validates a preview.
12. The AI identifies and resolves problems within configured revision limits.
13. The user can manually edit all generated timeline elements.
14. The user can request additional revisions through natural language.
15. The application exports a completed video and optional subtitle files.
16. Project state, generated assets and captions remain available after export.

A user must also be able to independently upload an audio file, generate captions, correct the transcript, modify the caption style and export subtitles without invoking the autonomous video creation workflow.

## 22. Documentation and implementation instructions

Create or update documentation covering:

- System architecture.
- Installation instructions.
- Local development setup.
- Required API credentials.
- Optional API credentials.
- Model configuration.
- Database migrations.
- Storage configuration.
- Background worker setup.
- Provider integration setup.
- Deployment instructions.
- Tool registry documentation.
- Production plan schemas.
- Captioning workflow.
- Cost management.
- Troubleshooting.

Use official provider documentation to verify current API functionality:

- Anthropic: https://platform.claude.com/docs
- Fal.ai: https://fal.ai/docs
- AssemblyAI: https://www.assemblyai.com/docs
- OpenAI: https://developers.openai.com/api/docs
- FFmpeg: https://ffmpeg.org/documentation.html
- Librosa: https://librosa.org/doc/latest/
- Neon: https://neon.com/docs
- Drizzle: https://orm.drizzle.team/docs
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Trigger.dev: https://trigger.dev/docs

Do not fabricate endpoints, SDK methods, API parameters, model availability or successful test results.

Use modular, maintainable, production-quality code.

Avoid placeholder implementations that pretend to provide real functionality.

Clearly distinguish implemented functionality, mock-provider functionality and functionality that requires additional credentials or infrastructure.

Work incrementally. Keep the application functional after each implementation phase.

Start by auditing the existing repository, identifying the integration points and producing a concrete implementation plan. Then implement the foundational phases with appropriate tests before progressing to more complex functionality.

The ultimate goal is not merely to add a chatbot to a video editor. The goal is to build an autonomous AI video production engine with comprehensive programmatic access to a powerful, fully editable video editing application.
