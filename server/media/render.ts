import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runProcess } from "./ffmpeg";

export async function renderColorPreview(input: { output: string; durationSeconds: number; srtPath?: string; width?: number; height?: number }): Promise<void> {
  mkdirSync(dirname(input.output), { recursive: true });
  const width = input.width ?? 320;
  const height = input.height ?? 180;
  const args = ["-y", "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=${input.durationSeconds}`, "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${input.durationSeconds}`];
  if (input.srtPath) args.push("-vf", `subtitles=${input.srtPath}`);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input.output);
  const result = await runProcess("ffmpeg", args);
  if (result.code !== 0) throw new Error("ffmpeg could not render the preview.");
}

export function writeSubtitle(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}
