import { extractWav, runProcess } from "./ffmpeg";

export type EnergyAnalysis = {
  durationMs: number;
  bpm: number | null;
  beatsMs: number[];
  onsetsMs: number[];
  loudnessLufs: number | null;
  peakDb: number | null;
  silence: Array<{ startMs: number; endMs: number }>;
  clipping: boolean;
  dropsMs: number[];
  sections: Array<{ startMs: number; endMs: number; label: "low" | "mid" | "high" }>;
  method: "ffmpeg-energy-v1";
};

const WINDOW_MS = 20;

/** Energy onsets from ffmpeg PCM. This is not librosa. BPM is null when the signal has too few onsets. */
export async function analyzeAudio(source: string, wavPath: string): Promise<EnergyAnalysis> {
  await extractWav(source, wavPath);
  const pcm = await runProcess("ffmpeg", ["-v", "error", "-i", wavPath, "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"]);
  if (pcm.code !== 0) throw new Error("ffmpeg could not decode PCM.");
  const samples = readS16le(pcm.stdout);
  const durationMs = Math.round((samples.length / 8000) * 1000);
  const rms = windowRms(samples, 8000, WINDOW_MS);
  const onsetsMs = onsets(rms);
  const beatsMs = onsetsMs.filter((_, index) => index % 2 === 0);
  const bpm = beatsMs.length >= 4 ? bpmFrom(beatsMs) : null;
  const silence = parseSilence((await runProcess("ffmpeg", ["-i", wavPath, "-af", "silencedetect=noise=-35dB:d=0.2", "-f", "null", "-"])).stderr);
  const volume = (await runProcess("ffmpeg", ["-i", wavPath, "-af", "volumedetect", "-f", "null", "-"])).stderr;
  const peak = numberAfter(volume, /max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const mean = numberAfter(volume, /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  return {
    durationMs,
    bpm,
    beatsMs,
    onsetsMs,
    loudnessLufs: mean,
    peakDb: peak,
    silence,
    clipping: peak != null && peak >= -0.1,
    dropsMs: drops(rms),
    sections: sections(rms),
    method: "ffmpeg-energy-v1",
  };
}

function readS16le(buffer: Buffer): Int16Array {
  const length = Math.floor(buffer.byteLength / 2);
  const samples = new Int16Array(length);
  for (let index = 0; index < length; index += 1) samples[index] = buffer.readInt16LE(index * 2);
  return samples;
}

function windowRms(samples: Int16Array, sampleRate: number, windowMs: number): number[] {
  const size = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const values: number[] = [];
  for (let index = 0; index + size <= samples.length; index += size) {
    let sum = 0;
    for (let cursor = index; cursor < index + size; cursor += 1) {
      const sample = samples[cursor] ?? 0;
      sum += sample * sample;
    }
    values.push(Math.sqrt(sum / size) / 32768);
  }
  return values;
}

function onsets(rms: number[]): number[] {
  const times: number[] = [];
  for (let index = 1; index < rms.length; index += 1) {
    const previous = rms[index - 1] ?? 0;
    const current = rms[index] ?? 0;
    if (current > 0.05 && current > previous * 1.8) times.push(index * WINDOW_MS);
  }
  return times;
}

function bpmFrom(beats: number[]): number | null {
  const gaps = beats.slice(1).map((time, index) => time - (beats[index] ?? time)).filter((gap) => gap >= 250 && gap <= 2000);
  if (gaps.length < 3) return null;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
  if (median <= 0) return null;
  return Math.round(60000 / median);
}

function drops(rms: number[]): number[] {
  const found: number[] = [];
  for (let index = 1; index < rms.length; index += 1) {
    const previous = rms[index - 1] ?? 0;
    const current = rms[index] ?? 0;
    if (previous > 0.08 && current < previous * 0.45) found.push(index * WINDOW_MS);
  }
  return found;
}

function sections(rms: number[]): EnergyAnalysis["sections"] {
  if (rms.length === 0) return [];
  const sorted = [...rms].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length / 3)] ?? 0;
  const high = sorted[Math.floor((sorted.length * 2) / 3)] ?? low;
  const chunks: EnergyAnalysis["sections"] = [];
  let label = labelOf(rms[0] ?? 0, low, high);
  let start = 0;
  for (let index = 1; index <= rms.length; index += 1) {
    const next = index === rms.length ? label : labelOf(rms[index] ?? 0, low, high);
    if (next !== label || index === rms.length) {
      chunks.push({ startMs: start * WINDOW_MS, endMs: index * WINDOW_MS, label });
      label = next;
      start = index;
    }
  }
  return chunks;
}

function labelOf(value: number, low: number, high: number): "low" | "mid" | "high" {
  if (value <= low) return "low";
  if (value >= high) return "high";
  return "mid";
}

function parseSilence(stderr: string): Array<{ startMs: number; endMs: number }> {
  const starts = [...stderr.matchAll(/silence_start:\s*(\d+(?:\.\d+)?)/g)].map((match) => Math.round(Number(match[1]) * 1000));
  const ends = [...stderr.matchAll(/silence_end:\s*(\d+(?:\.\d+)?)/g)].map((match) => Math.round(Number(match[1]) * 1000));
  return starts.map((startMs, index) => ({ startMs, endMs: ends[index] ?? startMs }));
}

function numberAfter(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : null;
}

