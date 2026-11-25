import { executeTool, listSupportedTools } from "../../src/editor/registry";
import type { EditorStore, ToolResult } from "../../src/editor/store";

export type AgentToolCall = { name: string; input: Record<string, unknown> };

export type AgentModel = {
  liveVerified: boolean;
  provider: "mock" | "anthropic";
  complete(input: { userText: string; projectVersion: number; tools: readonly string[] }): Promise<{ text: string; toolCalls: AgentToolCall[]; stop: boolean }>;
};

const HIDDEN_FROM_MODEL = new Set(["attachTranscript", "storeAudioAnalysis", "completeRender", "separateVocals"]);

export function agentToolNames(): string[] {
  return listSupportedTools().filter((name) => !HIDDEN_FROM_MODEL.has(name));
}

export function mockPlanner(): AgentModel {
  return {
    liveVerified: false,
    provider: "mock",
    async complete({ userText, projectVersion }) {
      const projectId = readId(userText, "project");
      const clipId = readId(userText, "clip");
      const calls: AgentToolCall[] = [];
      if (/glow/i.test(userText) && projectId && clipId) {
        calls.push({ name: "applyEffect", input: { projectId, expectedVersion: projectVersion, clipId, type: "glow", amount: 0.4 } });
      }
      if (/faster|speed/i.test(userText) && projectId && clipId) {
        calls.push({ name: "setClipSpeed", input: { projectId, expectedVersion: projectVersion, clipId, speed: 2 } });
      }
      return {
        text: calls.length > 0 ? "Mock planner queued editor tools. This was not a Claude response." : "Mock planner: no Claude key is configured, so this sentence was not sent to a model.",
        toolCalls: calls,
        stop: true,
      };
    },
  };
}

export async function runAgentTurn(input: {
  model: AgentModel;
  store: EditorStore;
  userText: string;
  projectId: string;
  maxIterations: number;
  cancelled?: () => boolean;
  beforeIteration?: (iteration: number) => { ok: true } | { ok: false; reason: string };
}): Promise<{ provider: string; liveVerified: boolean; text: string; results: ToolResult[]; stopped: string }> {
  const results: ToolResult[] = [];
  let text = "";
  for (let iteration = 0; iteration < input.maxIterations; iteration += 1) {
    if (input.cancelled?.()) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "cancelled" };
    const gate = input.beforeIteration?.(iteration) ?? { ok: true as const };
    if (!gate.ok) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: gate.reason };
    const inspected = executeTool(input.store, "inspectProject", { projectId: input.projectId });
    if (!inspected.ok) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "missing-project" };
    const version = (inspected.output as { project: { version: number } }).project.version;
    const turn = await input.model.complete({ userText: input.userText, projectVersion: version, tools: agentToolNames() });
    text = turn.text;
    if (turn.toolCalls.length > 1) {
      const batch = applyBatch(input.store, turn.toolCalls, version);
      results.push(...batch.results);
      if (!batch.ok) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "tool-error" };
    } else {
      for (const call of turn.toolCalls) {
        const result = executeTool(input.store, call.name, { ...call.input, expectedVersion: version });
        results.push(result);
        if (!result.ok) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "tool-error" };
      }
    }
    if (turn.stop) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "model-stop" };
  }
  return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "iteration-limit" };
}

function applyBatch(store: EditorStore, calls: AgentToolCall[], version: number): { ok: boolean; results: ToolResult[] } {
  const checkpoint = executeTool(store, "createCheckpoint", { projectId: String(calls[0]?.input.projectId ?? ""), expectedVersion: version, label: "Before batch" });
  if (!checkpoint.ok) return { ok: false, results: [checkpoint] };
  const results: ToolResult[] = [];
  let current = version;
  for (const call of calls) {
    const result = executeTool(store, call.name, { ...call.input, expectedVersion: current });
    results.push(result);
    if (!result.ok) {
      const restored = executeTool(store, "restoreCheckpoint", {
        projectId: String(call.input.projectId ?? ""),
        expectedVersion: current,
        checkpointId: (checkpoint.output as { checkpointId: string }).checkpointId,
      });
      results.push(restored);
      return { ok: false, results };
    }
    current = (result.output as { version?: number }).version ?? current;
  }
  return { ok: true, results };
}

export async function anthropicPlanner(apiKey: string, modelId: string): Promise<AgentModel> {
  const model: AgentModel = {
    liveVerified: false,
    provider: "anthropic",
    async complete({ userText, tools }) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 });
      const response = await client.messages.create({
        model: modelId,
        max_tokens: 800,
        system: "Call tools to edit the project. Never invent spoken words or lyrics. If a transcript is missing, say so.",
        tools: tools.map((name) => ({
          name,
          description: `Editor tool ${name}. The server fills expectedVersion.`,
          input_schema: { type: "object" as const, additionalProperties: true },
        })),
        messages: [{ role: "user", content: userText }],
      });
      model.liveVerified = true;
      const toolCalls: AgentToolCall[] = [];
      const texts: string[] = [];
      for (const block of response.content) {
        if (block.type === "text") texts.push(block.text);
        if (block.type === "tool_use" && block.input && typeof block.input === "object") {
          toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
        }
      }
      return { text: texts.join("\n"), toolCalls, stop: response.stop_reason !== "tool_use" };
    },
  };
  return model;
}

function readId(text: string, label: string): string | null {
  const match = new RegExp(`${label}:([0-9a-f-]{36})`, "i").exec(text);
  return match?.[1] ?? null;
}
