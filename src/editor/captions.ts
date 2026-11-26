import type { CaptionSegment, CaptionStyle, Clip, Project } from "./schema";
import { captionStylePresets } from "./schema";

const PRESETS: Record<(typeof captionStylePresets)[number], CaptionStyle> = {
  subtitles: style("subtitles", 28, "none", "bottom"),
  "short-form": style("short-form", 42, "highlight", "middle"),
  "word-highlight": style("word-highlight", 40, "highlight", "bottom"),
  karaoke: style("karaoke", 36, "karaoke", "bottom"),
  "single-word": style("single-word", 64, "single-word", "middle"),
  "cinematic-lyrics": style("cinematic-lyrics", 32, "fade", "bottom"),
};

function style(preset: CaptionStyle["preset"], fontSize: number, animation: CaptionStyle["animation"], position: CaptionStyle["position"]): CaptionStyle {
  return {
    preset,
    fontFamily: "Arial",
    fontSize,
    color: "#ffffff",
    highlightColor: "#f5c542",
    backgroundColor: "#000000",
    backgroundOpacity: preset === "cinematic-lyrics" ? 0 : 0.45,
    outlineColor: "#000000",
    outlineWidth: 2,
    position,
    safeMarginPx: preset === "short-form" ? 160 : 64,
    animation,
  };
}

export function captionPreset(preset: CaptionStyle["preset"]): CaptionStyle {
  return structuredClone(PRESETS[preset]);
}

export function spokenTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** Caption corrections may change case and punctuation. They may not change the spoken words. */
export function spokenWordsMatch(original: string, edited: string): boolean {
  const left = spokenTokens(original);
  const right = spokenTokens(edited);
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

export function captionTimelineRange(clip: Clip, sourceStartMs: number, sourceEndMs: number): { startMs: number; endMs: number } {
  const speed = clip.speed ?? 1;
  return {
    startMs: Math.round(clip.timelineStartMs + (sourceStartMs - clip.sourceInMs) / speed),
    endMs: Math.round(clip.timelineStartMs + (sourceEndMs - clip.sourceInMs) / speed),
  };
}

export function retargetCaptionsOnSplit(project: Project, leftClipId: string, rightClipId: string, splitSourceMs: number): void {
  if (!project.captions) return;
  const created: CaptionSegment[] = [];
  for (const segment of project.captions) {
    if (segment.clipId !== leftClipId) continue;
    const leftWords = segment.words.filter((word) => word.sourceStartMs < splitSourceMs);
    const rightWords = segment.words.filter((word) => word.sourceStartMs >= splitSourceMs);
    if (leftWords.length > 0 && rightWords.length > 0) {
      segment.words = leftWords;
      segment.sourceEndMs = splitSourceMs;
      segment.text = leftWords.map((word) => word.text).join(" ");
      segment.rawText = segment.text;
      const right = structuredClone(segment);
      right.id = crypto.randomUUID();
      right.clipId = rightClipId;
      right.words = rightWords;
      right.sourceStartMs = rightWords[0]?.sourceStartMs ?? splitSourceMs;
      right.sourceEndMs = rightWords[rightWords.length - 1]?.sourceEndMs ?? splitSourceMs;
      right.text = rightWords.map((word) => word.text).join(" ");
      right.rawText = right.text;
      created.push(right);
    } else if (rightWords.length > 0) {
      segment.clipId = rightClipId;
    }
  }
  project.captions.push(...created);
}

export function clipCaptionsToSource(project: Project, clipId: string, sourceInMs: number, sourceOutMs: number): void {
  if (!project.captions) return;
  project.captions = project.captions.flatMap((segment) => {
    if (segment.clipId !== clipId) return [segment];
    const words = segment.words.filter((word) => word.sourceEndMs > sourceInMs && word.sourceStartMs < sourceOutMs);
    if (words.length === 0) return [];
    const dropped = words.length !== segment.words.length;
    return [{
      ...segment,
      words: dropped ? words.map((word) => ({ ...word, uncertain: true })) : words,
      sourceStartMs: Math.max(segment.sourceStartMs, sourceInMs),
      sourceEndMs: Math.min(segment.sourceEndMs, sourceOutMs),
      text: words.map((word) => word.text).join(" "),
      rawText: words.map((word) => word.text).join(" "),
    }];
  });
}

export function segmentsToSrt(project: Project): string {
  return blocks(project)
    .map((block, index) => `${index + 1}\n${stamp(block.startMs)} --> ${stamp(block.endMs)}\n${block.text}\n`)
    .join("\n");
}

export function segmentsToVtt(project: Project): string {
  const lines = blocks(project).map((block) => {
    const note = block.uncertain ? " NOTE uncertain alignment" : "";
    return `${stamp(block.startMs, ".")} --> ${stamp(block.endMs, ".")}${note}\n${block.text}\n`;
  });
  return `WEBVTT\n\n${lines.join("\n")}`;
}

function blocks(project: Project): Array<{ startMs: number; endMs: number; text: string; uncertain: boolean }> {
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  return (project.captions ?? [])
    .flatMap((segment) => {
      const clip = clips.get(segment.clipId);
      if (!clip) return [];
      const range = captionTimelineRange(clip, segment.sourceStartMs, segment.sourceEndMs);
      if (range.endMs <= range.startMs) return [];
      return [{ ...range, text: segment.text, uncertain: segment.words.some((word) => word.uncertain) }];
    })
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function stamp(ms: number, separator = ","): string {
  const clamped = Math.max(0, ms);
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}
