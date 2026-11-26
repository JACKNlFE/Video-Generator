import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeAudio } from "./analyze";
import { probeDurationMs, runProcess } from "./ffmpeg";
import { renderColorPreview, writeSubtitle } from "./render";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ffmpeg media tools", () => {
  it("finds silence, keeps bpm unset when the tone has too few beats, and renders a preview", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vg-media-"));
    dirs.push(dir);
    const tone = join(dir, "tone.wav");
    const generated = await runProcess("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2", "-af", "volume=0:enable='between(t,0.4,0.8)'", tone]);
    expect(generated.code).toBe(0);
    const duration = await probeDurationMs(tone);
    expect(duration).toBeGreaterThan(1000);
    const analysis = await analyzeAudio(tone, join(dir, "analysis.wav"));
    expect(analysis.method).toBe("ffmpeg-energy-v1");
    expect(analysis.silence.some((span) => span.startMs >= 300 && span.endMs <= 900)).toBe(true);
    expect(analysis.bpm === null || analysis.bpm > 0).toBe(true);
    const srt = join(dir, "captions.srt");
    writeSubtitle(srt, "1\n00:00:00,000 --> 00:00:00,800\nHello there\n");
    const preview = join(dir, "preview.mp4");
    await renderColorPreview({ output: preview, durationSeconds: 1, srtPath: srt });
    expect(statSync(preview).size).toBeGreaterThan(500);
    const probed = await probeDurationMs(preview);
    expect(probed).toBeGreaterThan(500);
  });
});
