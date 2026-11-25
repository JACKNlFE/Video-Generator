import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { executeTool, createEditor } from "../src/editor/registry";
import type { EditorStore } from "../src/editor/store";
import { mockPlanner, runAgentTurn } from "./agent/loop";
import type { AppConfig } from "./config";
import { extensionOf, MEDIA_EXTENSIONS, probeDurationMs } from "./media/ffmpeg";
import type { PersistDatabase } from "./persist.d.mts";

const editors = new WeakMap<PersistDatabase, EditorStore>();

export function editorFor(db: PersistDatabase): EditorStore {
  const existing = editors.get(db);
  if (existing) return existing;
  const created = createEditor();
  const row = db.prepare("SELECT document_json FROM editor_sessions WHERE id = 'default'").get() as { document_json?: string } | undefined;
  if (row?.document_json) {
    const parsed = JSON.parse(row.document_json) as Array<[string, EditorStore["sessions"] extends Map<string, infer V> ? V : never]>;
    for (const [id, session] of parsed) created.sessions.set(id, session);
  }
  editors.set(db, created);
  return created;
}

export function ensureEditorTable(db: PersistDatabase): void {
  db.exec("CREATE TABLE IF NOT EXISTS editor_sessions (id TEXT PRIMARY KEY, document_json TEXT NOT NULL)");
}

export function saveEditor(db: PersistDatabase, store: EditorStore): void {
  ensureEditorTable(db);
  db.prepare("INSERT INTO editor_sessions (id, document_json) VALUES ('default', ?) ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json").run(
    JSON.stringify([...store.sessions.entries()]),
  );
}

export async function handleStudio(input: {
  db: PersistDatabase;
  config: AppConfig;
  method: string;
  pathname: string;
  body: Buffer;
  request: IncomingMessage;
  response: ServerResponse;
  send: (response: ServerResponse, status: number, body: unknown) => void;
}): Promise<boolean> {
  ensureEditorTable(input.db);
  if (input.method === "POST" && input.pathname === "/editor/tools") {
    const payload = JSON.parse(input.body.toString("utf8")) as { name?: string; input?: unknown };
    if (!payload.name) {
      input.send(input.response, 400, { error: { code: "validation", message: "Tool name is required." } });
      return true;
    }
    const store = editorFor(input.db);
    const result = executeTool(store, payload.name, payload.input);
    if (result.ok) saveEditor(input.db, store);
    input.send(input.response, result.ok ? 200 : 422, result);
    return true;
  }
  if (input.method === "POST" && input.pathname === "/media/upload") {
    const fileName = header(input.request, "x-file-name") ?? "upload.bin";
    const extension = extensionOf(fileName);
    if (!MEDIA_EXTENSIONS.has(extension)) {
      input.send(input.response, 415, { error: { code: "validation", message: "Upload must be mp3, wav, m4a, aac, flac, mp4, mov, or webm." } });
      return true;
    }
    if (input.body.byteLength > 100_000_000) {
      input.send(input.response, 413, { error: { code: "body_too_large", message: "Uploads are limited to 100 MB." } });
      return true;
    }
    mkdirSync(input.config.mediaRoot, { recursive: true });
    const storedName = `${crypto.randomUUID()}.${extension}`;
    const fullPath = join(input.config.mediaRoot, storedName);
    writeFileSync(fullPath, input.body);
    const durationMs = await probeDurationMs(fullPath);
    input.send(input.response, 201, { fileName: storedName, durationMs, liveVerified: false });
    return true;
  }
  if (input.method === "POST" && input.pathname === "/agent/turns") {
    const payload = JSON.parse(input.body.toString("utf8")) as { projectId?: string; text?: string; maxIterations?: number };
    if (!payload.projectId || !payload.text) {
      input.send(input.response, 400, { error: { code: "validation", message: "projectId and text are required." } });
      return true;
    }
    const store = editorFor(input.db);
    const turn = await runAgentTurn({
      model: mockPlanner(),
      store,
      projectId: payload.projectId,
      userText: payload.text,
      maxIterations: Math.min(payload.maxIterations ?? 4, 8),
    });
    saveEditor(input.db, store);
    input.send(input.response, 200, turn);
    return true;
  }
  return false;
}

function header(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
