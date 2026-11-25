import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

describe("client boundary", () => {
  it("keeps server secrets out of the editor source", () => {
    const forbidden = ["ANTHROPIC_API_KEY", "FAL_KEY", "ASSEMBLYAI_API_KEY", "OPENAI_API_KEY", "R2_SECRET_ACCESS_KEY", "TRIGGER_SECRET_KEY", "import.meta.env", "from \"../server", "from \"../../server"];
    for (const file of filesIn(join(root, "src"))) {
      if (!/\.(ts|tsx|css)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const token of forbidden) expect(text, file).not.toContain(token);
    }
  });

  it("does not put a server secret into the Vite bundle", () => {
    const marker = "stage1-secret-marker";
    execFileSync("npx", ["vite", "build"], {
      cwd: root,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: marker,
        FAL_KEY: marker,
        VITE_ANTHROPIC_API_KEY: marker,
      },
      stdio: "pipe",
    });
    const bundled = filesIn(join(root, "dist")).filter((file) => statSync(file).isFile()).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(bundled).not.toContain(marker);
    expect(bundled).not.toContain("ANTHROPIC_API_KEY");
    expect(bundled).not.toContain("FAL_KEY");
  });
});
