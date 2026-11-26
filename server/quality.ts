import type { Project } from "../src/editor/schema";
import { playbackMs } from "../src/editor/store";

export type QualityFinding = { code: string; message: string; severity: "error" | "info" };

/** Timeline checks only. This does not watch or listen to a rendered video. */
export function inspectProjectQuality(project: Project): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const media = new Set(project.media.map((item) => item.id));
  for (const clip of project.clips) {
    if (!media.has(clip.mediaId)) findings.push({ code: "missing-media", message: `Clip ${clip.id} points at missing media.`, severity: "error" });
    if (clip.sourceOutMs <= clip.sourceInMs) findings.push({ code: "bad-range", message: `Clip ${clip.id} has an empty source range.`, severity: "error" });
    if (clip.timelineStartMs + playbackMs(clip) > 86_400_000) findings.push({ code: "too-long", message: `Clip ${clip.id} extends past 24 hours.`, severity: "error" });
  }
  for (const segment of project.captions ?? []) {
    const clip = project.clips.find((item) => item.id === segment.clipId);
    if (!clip) {
      findings.push({ code: "orphan-caption", message: `Caption ${segment.id} has no clip.`, severity: "error" });
      continue;
    }
    if (segment.sourceStartMs < clip.sourceInMs || segment.sourceEndMs > clip.sourceOutMs) {
      findings.push({ code: "caption-outside-clip", message: `Caption ${segment.id} is outside its clip.`, severity: "error" });
    }
  }
  if (findings.length === 0) findings.push({ code: "no-timeline-errors", message: "No missing media or broken caption ranges were found. Frames were not reviewed.", severity: "info" });
  return findings;
}

export function revisionAllowed(cyclesUsed: number, maxCycles: number): boolean {
  return cyclesUsed < maxCycles;
}
