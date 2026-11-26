import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("railway image", () => {
  it("installs Node 22 and FFmpeg and does not copy persisted data", () => {
    const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
    const railway = readFileSync(new URL("../railway.toml", import.meta.url), "utf8");
    const ignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
    expect(dockerfile).toMatch(/node:22/);
    expect(dockerfile).toMatch(/\bffmpeg\b/);
    expect(dockerfile).toContain('CMD ["npm", "run", "server"]');
    expect(dockerfile).not.toMatch(/APP_AUTH_TOKEN|MEDIA_SIGNING_SECRET|sk-ant-|FAL_KEY=/);
    expect(dockerfile).not.toMatch(/COPY[^\n]*\bdata\b/);
    expect(railway).toContain('builder = "DOCKERFILE"');
    expect(railway).toContain('startCommand = "npm run server"');
    expect(railway).toContain('healthcheckPath = "/health"');
    expect(ignore).toMatch(/^data$/m);
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\*\.sqlite$/m);
  });
});