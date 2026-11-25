import type { DatabaseSync } from "node:sqlite";

export type PersistDatabase = DatabaseSync;

export type JobError = { code: string; message: string; retryable: boolean };

export type JobRecord = {
  id: string;
  kind: string;
  status: "pending" | "queued" | "processing" | "awaiting_approval" | "completed" | "failed" | "cancelled";
  progress: number;
  payload: unknown;
  result: unknown;
  error: JobError | null;
  idempotencyKey: string | null;
  payloadHash: string;
  attempt: number;
  providerRequestId: string | null;
  reservationId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationRecord = {
  id: string;
  projectId: string | null;
  runId: string | null;
  providerId: string;
  operation: string;
  modelId: string | null;
  estimatedMicros: number;
  actualMicros: number | null;
  status: "reserved" | "reconciled" | "released";
  overBudget: boolean;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BudgetLimits = {
  projectMicros?: number | null;
  runMicros?: number | null;
  dailyMicros?: number | null;
  monthlyMicros?: number | null;
};

export type Failure = { ok: false; code: string; message: string; [key: string]: unknown };

export function openDatabase(file: string): PersistDatabase;
export function ping(db: PersistDatabase): boolean;
export function createJob(db: PersistDatabase, input: {
  now: string;
  kind: string;
  payload?: unknown;
  idempotencyKey?: string | null;
  id?: string;
  providerRequestId?: string | null;
  reservationId?: string | null;
  projectId?: string | null;
}): { ok: true; job: JobRecord; replayed: boolean } | Failure;
export function getJob(db: PersistDatabase, id: string): JobRecord | null;
export function cancelJob(db: PersistDatabase, id: string, now: string): { ok: true; job: JobRecord } | Failure;
export function retryJob(db: PersistDatabase, id: string, now: string, reservationId?: string | null): { ok: true; job: JobRecord } | Failure;
export function updateProgress(db: PersistDatabase, id: string, progress: number, now: string): { ok: true; job: JobRecord } | Failure;
export function applyWebhook(db: PersistDatabase, input: {
  provider: string;
  deliveryId: string;
  body?: unknown;
  now: string;
  providerRequestId?: string | null;
  jobId?: string | null;
  outcome?: "completed" | "failed" | "processing" | "ignored";
  result?: unknown;
  error?: JobError | null;
  progress?: number;
}): { ok: true; duplicate: boolean; applied: boolean; job: JobRecord | null } | Failure;
export function reserve(db: PersistDatabase, input: {
  estimatedMicros: number;
  limits?: BudgetLimits;
  now: string;
  id?: string;
  projectId?: string | null;
  runId?: string | null;
  providerId: string;
  operation: string;
  modelId?: string | null;
  jobId?: string | null;
  unit?: string | null;
  quantity?: number | null;
}): { ok: true; reservation: ReservationRecord } | Failure;
export function reconcile(db: PersistDatabase, input: {
  id: string;
  actualMicros: number;
  now: string;
  limits?: BudgetLimits;
}): { ok: true; reservation: ReservationRecord; overBudget: boolean } | Failure;
export function releaseReservation(db: PersistDatabase, id: string, now: string): { ok: true; reservation: ReservationRecord } | Failure;
export function getReservation(db: PersistDatabase, id: string): ReservationRecord | null;
export function listReservations(db: PersistDatabase): ReservationRecord[];
