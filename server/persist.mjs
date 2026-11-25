import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  idempotency_key TEXT,
  payload_hash TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  provider_request_id TEXT,
  reservation_id TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_provider_request ON jobs(provider_request_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  job_id TEXT,
  body_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(provider, delivery_id)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  run_id TEXT,
  provider_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  model_id TEXT,
  estimated_micros INTEGER NOT NULL,
  actual_micros INTEGER,
  status TEXT NOT NULL,
  over_budget INTEGER NOT NULL DEFAULT 0,
  job_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reservations_project ON reservations(project_id, created_at);
CREATE INDEX IF NOT EXISTS reservations_run ON reservations(run_id, created_at);
CREATE INDEX IF NOT EXISTS reservations_created ON reservations(created_at);

CREATE TABLE IF NOT EXISTS usage_entries (
  id TEXT PRIMARY KEY,
  reservation_id TEXT,
  provider_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  model_id TEXT,
  unit TEXT,
  quantity TEXT,
  estimated_micros INTEGER NOT NULL,
  actual_micros INTEGER,
  project_id TEXT,
  run_id TEXT,
  job_id TEXT,
  created_at TEXT NOT NULL
);
`;

export function openDatabase(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function ping(db) {
  const row = db.prepare("SELECT 1 AS ok").get();
  return Number(row?.ok) === 1;
}

export function createJob(db, input) {
  const now = input.now;
  const payload = input.payload ?? {};
  const payloadHash = hashPayload(payload);
  const key = input.idempotencyKey ?? null;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (key) {
      const existing = db.prepare("SELECT * FROM jobs WHERE idempotency_key = ?").get(key);
      if (existing) {
        db.exec("COMMIT");
        if (existing.payload_hash !== payloadHash) {
          return { ok: false, code: "idempotency_conflict", message: "This idempotency key was already used with a different payload.", job: mapJob(existing) };
        }
        return { ok: true, job: mapJob(existing), replayed: true };
      }
    }
    const id = input.id ?? randomUUID();
    db.prepare(
      `INSERT INTO jobs (
        id, kind, status, progress, payload_json, result_json, error_json, idempotency_key, payload_hash,
        attempt, provider_request_id, reservation_id, project_id, created_at, updated_at
      ) VALUES (?, ?, 'queued', 0, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(id, input.kind, JSON.stringify(payload), key, payloadHash, input.providerRequestId ?? null, input.reservationId ?? null, input.projectId ?? null, now, now);
    const job = mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
    db.exec("COMMIT");
    return { ok: true, job, replayed: false };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The job store is busy." };
    throw error;
  }
}

export function getJob(db, id) {
  return mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
}

export function cancelJob(db, id, now) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    if (!row) {
      db.exec("COMMIT");
      return { ok: false, code: "not_found", message: "Job not found." };
    }
    if (row.status === "completed" || row.status === "failed" || row.status === "cancelled") {
      db.exec("COMMIT");
      return { ok: false, code: "invalid_state", message: `A ${row.status} job cannot be cancelled.`, job: mapJob(row) };
    }
    db.prepare("UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, id);
    const job = mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
    db.exec("COMMIT");
    return { ok: true, job };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The job store is busy." };
    throw error;
  }
}

export function retryJob(db, id, now, reservationId) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    if (!row) {
      db.exec("COMMIT");
      return { ok: false, code: "not_found", message: "Job not found." };
    }
    if (row.status !== "failed" && row.status !== "cancelled") {
      db.exec("COMMIT");
      return { ok: false, code: "invalid_state", message: "Only a failed or cancelled job can be retried.", job: mapJob(row) };
    }
    const nextReservation = reservationId === undefined ? row.reservation_id : reservationId;
    db.prepare(
      `UPDATE jobs
       SET status = 'queued', progress = 0, result_json = NULL, error_json = NULL, attempt = attempt + 1,
           reservation_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(nextReservation, now, id);
    const job = mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
    db.exec("COMMIT");
    return { ok: true, job };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The job store is busy." };
    throw error;
  }
}

export function updateProgress(db, id, progress, now) {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { ok: false, code: "validation", message: "Progress must be an integer from 0 to 100." };
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    if (!row) {
      db.exec("COMMIT");
      return { ok: false, code: "not_found", message: "Job not found." };
    }
    if (row.status === "completed" || row.status === "failed" || row.status === "cancelled") {
      db.exec("COMMIT");
      return { ok: false, code: "invalid_state", message: `A ${row.status} job does not accept progress.`, job: mapJob(row) };
    }
    const status = row.status === "pending" || row.status === "queued" ? "processing" : row.status;
    db.prepare("UPDATE jobs SET status = ?, progress = ?, updated_at = ? WHERE id = ?").run(status, progress, now, id);
    const job = mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
    db.exec("COMMIT");
    return { ok: true, job };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The job store is busy." };
    throw error;
  }
}

export function applyWebhook(db, input) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id, job_id FROM webhook_deliveries WHERE provider = ? AND delivery_id = ?").get(input.provider, input.deliveryId);
    if (existing) {
      db.exec("COMMIT");
      const job = existing.job_id ? getJob(db, existing.job_id) : null;
      return { ok: true, duplicate: true, applied: false, job };
    }
    let row = null;
    if (input.jobId) row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(input.jobId);
    else if (input.providerRequestId) row = db.prepare("SELECT * FROM jobs WHERE provider_request_id = ?").get(input.providerRequestId);
    const jobId = row ? row.id : null;
    db.prepare(
      "INSERT INTO webhook_deliveries (id, provider, delivery_id, job_id, body_json, received_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID(), input.provider, input.deliveryId, jobId, JSON.stringify(input.body ?? null), input.now);
    let applied = false;
    if (row && (row.status === "pending" || row.status === "queued" || row.status === "processing" || row.status === "awaiting_approval")) {
      if (input.outcome === "completed") {
        db.prepare("UPDATE jobs SET status = 'completed', progress = 100, result_json = ?, error_json = NULL, updated_at = ? WHERE id = ?").run(
          JSON.stringify(input.result ?? null),
          input.now,
          row.id,
        );
        applied = true;
      } else if (input.outcome === "failed") {
        db.prepare("UPDATE jobs SET status = 'failed', error_json = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(input.error ?? { code: "provider_failed", message: "The provider reported a failure.", retryable: true }),
          input.now,
          row.id,
        );
        applied = true;
      } else if (input.outcome === "processing") {
        const progress = Number.isInteger(input.progress) ? input.progress : row.progress;
        db.prepare("UPDATE jobs SET status = 'processing', progress = ?, updated_at = ? WHERE id = ?").run(progress, input.now, row.id);
        applied = true;
      }
    }
    const job = jobId ? mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId)) : null;
    db.exec("COMMIT");
    return { ok: true, duplicate: false, applied, job };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The job store is busy." };
    throw error;
  }
}

export function reserve(db, input) {
  if (!Number.isInteger(input.estimatedMicros) || input.estimatedMicros <= 0) {
    return { ok: false, code: "invalid_estimate", message: "A paid reservation needs a positive integer estimate in micros." };
  }
  const limits = input.limits ?? {};
  const now = input.now;
  const id = input.id ?? randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    const checks = scopeChecks(db, input, limits, now);
    if (checks.error) {
      db.exec("COMMIT");
      return checks.error;
    }
    for (const check of checks.checks) {
      if (check.used + input.estimatedMicros > check.limit) {
        db.exec("COMMIT");
        return {
          ok: false,
          code: "budget_exceeded",
          message: `The ${check.scope} spending limit would be exceeded.`,
          scope: check.scope,
          limitMicros: check.limit,
          usedMicros: check.used,
          requestedMicros: input.estimatedMicros,
        };
      }
    }
    db.prepare(
      `INSERT INTO reservations (
        id, project_id, run_id, provider_id, operation, model_id, estimated_micros, actual_micros, status, over_budget, job_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'reserved', 0, ?, ?, ?)`,
    ).run(id, input.projectId ?? null, input.runId ?? null, input.providerId, input.operation, input.modelId ?? null, input.estimatedMicros, input.jobId ?? null, now, now);
    db.prepare(
      `INSERT INTO usage_entries (
        id, reservation_id, provider_id, operation, model_id, unit, quantity, estimated_micros, actual_micros, project_id, run_id, job_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      id,
      input.providerId,
      input.operation,
      input.modelId ?? null,
      input.unit ?? null,
      input.quantity == null ? null : String(input.quantity),
      input.estimatedMicros,
      input.projectId ?? null,
      input.runId ?? null,
      input.jobId ?? null,
      now,
    );
    const reservation = mapReservation(db.prepare("SELECT * FROM reservations WHERE id = ?").get(id));
    db.exec("COMMIT");
    return { ok: true, reservation };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The budget store is busy." };
    throw error;
  }
}

export function reconcile(db, input) {
  if (!Number.isInteger(input.actualMicros) || input.actualMicros < 0) {
    return { ok: false, code: "invalid_estimate", message: "Actual usage must be a non-negative integer in micros." };
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM reservations WHERE id = ?").get(input.id);
    if (!row) {
      db.exec("COMMIT");
      return { ok: false, code: "not_found", message: "Reservation not found." };
    }
    if (row.status !== "reserved") {
      db.exec("COMMIT");
      return { ok: false, code: "invalid_state", message: `A ${row.status} reservation cannot be reconciled.` };
    }
    const overBudget = scopeOverBudget(db, row, input.actualMicros, input.limits ?? {});
    db.prepare("UPDATE reservations SET status = 'reconciled', actual_micros = ?, over_budget = ?, updated_at = ? WHERE id = ?").run(
      input.actualMicros,
      overBudget ? 1 : 0,
      input.now,
      input.id,
    );
    db.prepare("UPDATE usage_entries SET actual_micros = ? WHERE reservation_id = ?").run(input.actualMicros, input.id);
    const reservation = mapReservation(db.prepare("SELECT * FROM reservations WHERE id = ?").get(input.id));
    db.exec("COMMIT");
    return { ok: true, reservation, overBudget };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The budget store is busy." };
    throw error;
  }
}

export function releaseReservation(db, id, now) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id);
    if (!row) {
      db.exec("COMMIT");
      return { ok: false, code: "not_found", message: "Reservation not found." };
    }
    if (row.status !== "reserved") {
      db.exec("COMMIT");
      return { ok: false, code: "invalid_state", message: `A ${row.status} reservation cannot be released.` };
    }
    db.prepare("UPDATE reservations SET status = 'released', updated_at = ? WHERE id = ?").run(now, id);
    const reservation = mapReservation(db.prepare("SELECT * FROM reservations WHERE id = ?").get(id));
    db.exec("COMMIT");
    return { ok: true, reservation };
  } catch (error) {
    rollback(db);
    if (isBusy(error)) return { ok: false, code: "busy", message: "The budget store is busy." };
    throw error;
  }
}

export function getReservation(db, id) {
  return mapReservation(db.prepare("SELECT * FROM reservations WHERE id = ?").get(id));
}

export function listReservations(db) {
  return db.prepare("SELECT * FROM reservations ORDER BY created_at, id").all().map(mapReservation);
}

function scopeChecks(db, input, limits, now) {
  const checks = [];
  if (limits.projectMicros != null) {
    if (!input.projectId) return { error: { ok: false, code: "project_required", message: "A project budget is configured, so the reservation needs a project id." } };
    checks.push({ scope: "project", limit: limits.projectMicros, used: usedMicros(db, "project_id = ?", [input.projectId]) });
  }
  if (limits.runMicros != null && input.runId) {
    checks.push({ scope: "run", limit: limits.runMicros, used: usedMicros(db, "run_id = ?", [input.runId]) });
  }
  if (limits.dailyMicros != null) {
    const window = utcDayWindow(now);
    checks.push({ scope: "daily", limit: limits.dailyMicros, used: usedMicros(db, "created_at >= ? AND created_at < ?", [window.start, window.end]) });
  }
  if (limits.monthlyMicros != null) {
    const window = utcMonthWindow(now);
    checks.push({ scope: "monthly", limit: limits.monthlyMicros, used: usedMicros(db, "created_at >= ? AND created_at < ?", [window.start, window.end]) });
  }
  return { checks };
}

function scopeOverBudget(db, row, actualMicros, limits) {
  const extra = actualMicros - row.estimated_micros;
  if (extra <= 0) return false;
  const pretend = {
    projectId: row.project_id,
    runId: row.run_id,
    estimatedMicros: row.estimated_micros,
  };
  const checks = scopeChecks(db, pretend, limits, row.created_at);
  if (checks.error) return true;
  return checks.checks.some((check) => check.used - row.estimated_micros + actualMicros > check.limit);
}

function usedMicros(db, clause, params) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(
      CASE status
        WHEN 'reserved' THEN estimated_micros
        WHEN 'reconciled' THEN COALESCE(actual_micros, estimated_micros)
        ELSE 0
      END
    ), 0) AS used
    FROM reservations
    WHERE ${clause}`,
  ).get(...params);
  return Number(row.used);
}

function utcDayWindow(iso) {
  const start = `${iso.slice(0, 10)}T00:00:00.000Z`;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end: end.toISOString() };
}

function utcMonthWindow(iso) {
  const start = `${iso.slice(0, 7)}-01T00:00:00.000Z`;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end: end.toISOString() };
}

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    payload: JSON.parse(row.payload_json),
    result: row.result_json == null ? null : JSON.parse(row.result_json),
    error: row.error_json == null ? null : JSON.parse(row.error_json),
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    attempt: row.attempt,
    providerRequestId: row.provider_request_id,
    reservationId: row.reservation_id,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReservation(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    providerId: row.provider_id,
    operation: row.operation,
    modelId: row.model_id,
    estimatedMicros: row.estimated_micros,
    actualMicros: row.actual_micros,
    status: row.status,
    overBudget: row.over_budget === 1,
    jobId: row.job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hashPayload(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

function rollback(db) {
  try {
    db.exec("ROLLBACK");
  } catch {
    // The connection may already be outside a transaction.
  }
}

function isBusy(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_BUSY") || message.includes("database is locked");
}
