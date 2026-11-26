import { spawn } from "node:child_process";

export function runProcess(command: string, args: string[]): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") }));
  });
}

export async function probeDurationMs(file: string): Promise<number> {
  const result = await runProcess("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", file]);
  if (result.code !== 0) throw new Error("ffprobe failed.");
  const parsed = JSON.parse(result.stdout.toString("utf8")) as { format?: { duration?: string } };
  const seconds = Number(parsed.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("The file has no duration.");
  return Math.round(seconds * 1000);
}

export async function extractWav(input: string, output: string): Promise<void> {
  const result = await runProcess("ffmpeg", ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", output]);
  if (result.code !== 0) throw new Error("ffmpeg could not extract audio.");
}

export const MEDIA_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "flac", "mp4", "mov", "webm"]);

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "";
}
