import { describe, expect, it } from "vitest";
import { allowRequest, authorized, mediaSignatureMatches, resetRateLimits, signMediaName } from "./security";

describe("owner security helpers", () => {
  it("requires the bearer token for changes and rate-limits a key", () => {
    expect(authorized(null, undefined, "POST")).toBe(true);
    expect(authorized("secret", "Bearer secret", "POST")).toBe(true);
    expect(authorized("secret", "Bearer wrong", "POST")).toBe(false);
    expect(authorized("secret", undefined, "GET")).toBe(true);
    resetRateLimits();
    expect(allowRequest("client", 0, 2, 1000)).toBe(true);
    expect(allowRequest("client", 10, 2, 1000)).toBe(true);
    expect(allowRequest("client", 20, 2, 1000)).toBe(false);
  });

  it("rejects an expired or altered media signature", () => {
    const signature = signMediaName("media-secret", "clip.mp4", 2_000);
    expect(mediaSignatureMatches("media-secret", "clip.mp4", 2_000, signature, 1_000)).toBe(true);
    expect(mediaSignatureMatches("media-secret", "clip.mp4", 2_000, signature, 3_000)).toBe(false);
    expect(mediaSignatureMatches("media-secret", "other.mp4", 2_000, signature, 1_000)).toBe(false);
  });
});