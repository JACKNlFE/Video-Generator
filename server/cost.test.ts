import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { reserveForOperation } from "./cost";
import { listReservations, openDatabase, reconcile, releaseReservation, reserve } from "./persist.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function file(): string {
  const dir = mkdtempSync(join(tmpdir(), "vg-cost-"));
  dirs.push(dir);
  return join(dir, "jobs.sqlite");
}

const now = "2026-11-25T18:00:00.000Z";
const limits = { dailyMicros: 1_000_000 };

describe("budget enforcement", () => {
  it("blocks a second reservation that would pass the limit", () => {
    const db = openDatabase(file());
    const first = reserve(db, { estimatedMicros: 600_000, limits, now, providerId: "anthropic", operation: "input_tokens", projectId: "project-1" });
    const second = reserve(db, { estimatedMicros: 500_000, limits, now, providerId: "anthropic", operation: "input_tokens", projectId: "project-1" });
    const within = reserve(db, { estimatedMicros: 400_000, limits, now, providerId: "anthropic", operation: "output_tokens", projectId: "project-1" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("budget_exceeded");
      expect(second.scope).toBe("daily");
    }
    expect(within.ok).toBe(true);
    expect(listReservations(db).filter((row) => row.status === "reserved")).toHaveLength(2);
    db.close();
  });

  it("releases the unused hold when the actual cost is lower", () => {
    const db = openDatabase(file());
    const held = reserve(db, { estimatedMicros: 800_000, limits, now, providerId: "anthropic", operation: "input_tokens" });
    if (!held.ok) throw new Error(held.message);
    const reconciled = reconcile(db, { id: held.reservation.id, actualMicros: 100_000, now, limits });
    expect(reconciled.ok && reconciled.overBudget).toBe(false);
    const next = reserve(db, { estimatedMicros: 800_000, limits, now, providerId: "anthropic", operation: "input_tokens" });
    expect(next.ok).toBe(true);
    db.close();
  });

  it("allows another reservation after a release", () => {
    const db = openDatabase(file());
    const held = reserve(db, { estimatedMicros: 900_000, limits, now, providerId: "openai", operation: "transcription" });
    if (!held.ok) throw new Error(held.message);
    expect(reserve(db, { estimatedMicros: 200_000, limits, now, providerId: "openai", operation: "transcription" }).ok).toBe(false);
    expect(releaseReservation(db, held.reservation.id, now).ok).toBe(true);
    expect(reserve(db, { estimatedMicros: 200_000, limits, now, providerId: "openai", operation: "transcription" }).ok).toBe(true);
    db.close();
  });

  it("refuses an unverified price when the caller does not pass an explicit estimate", () => {
    const db = openDatabase(file());
    const refused = reserveForOperation(db, { providerId: "fal", operation: "video", modelId: null, quantity: 1, limits, now });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("price_unverified");
    expect(listReservations(db)).toHaveLength(0);
    const priced = reserveForOperation(db, { providerId: "anthropic", modelId: "claude-fable-5-2", operation: "input_tokens", quantity: 1_000_000, limits: { dailyMicros: 8_000_000 }, now });
    const blocked = reserveForOperation(db, { providerId: "anthropic", modelId: "claude-fable-5-2", operation: "input_tokens", quantity: 1, limits: { dailyMicros: 8_000_000 }, now });
    expect(priced.ok).toBe(true);
    expect(blocked.ok).toBe(false);
    db.close();
  });

  it("lets only one of two concurrent reservations pass a shared limit", async () => {
    const dbPath = file();
    openDatabase(dbPath).close();
    const reservation = { estimatedMicros: 600_000, limits, now, providerId: "anthropic", operation: "input_tokens" };
    const [first, second] = await Promise.all([reserveInWorker(dbPath, reservation), reserveInWorker(dbPath, reservation)]);
    const successes = [first, second].filter((result) => result.ok);
    const blocked = [first, second].filter((result) => !result.ok && result.code === "budget_exceeded");
    expect(successes).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    const db = openDatabase(dbPath);
    expect(listReservations(db)).toHaveLength(1);
    db.close();
  });
});

function reserveInWorker(dbPath: string, reservation: object): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./reserve-worker.mjs", import.meta.url), { workerData: { dbPath, reservation } });
    worker.once("message", (message) => resolve(message as { ok: boolean; code?: string }));
    worker.once("error", reject);
  });
}
