import { executeTool, listSupportedTools } from "../../src/editor/registry";
import type { EditorStore, ToolResult } from "../../src/editor/store";

export type AgentToolCall = { name: string; input: Record<string, unknown> };

export type AgentModel = {
  liveVerified: boolean;
  provider: "anthropic" | "test";
  complete(input: { userText: string; projectVersion: number; tools: readonly string[] }): Promise<{ text: string; toolCalls: AgentToolCall[]; stop: boolean }>;
};

export type AnthropicMessage = {
  stop_reason: string | null;
  content: Array<{ type: "text"; text: string } | { type: "tool_use"; name: string; input: unknown }>;
};

/** The slice of the official Anthropic SDK this chat calls. Tests pass a fake. */
export type AnthropicMessagesClient = {
  messages: {
    create(body: {
      model: string;
      max_tokens: number;
      system: string;
      tools: Array<{ name: string; description: string; input_schema: { type: "object"; additionalProperties: boolean } }>;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<AnthropicMessage>;
  };
};

const HIDDEN_FROM_MODEL = new Set(["attachTranscript", "storeAudioAnalysis", "completeRender", "separateVocals"]);

export function agentToolNames(): string[] {
  return listSupportedTools().filter((name) => !HIDDEN_FROM_MODEL.has(name));
}

export function modelFromAnthropicClient(client: AnthropicMessagesClient, modelId: string, options?: { liveAfterResponse?: boolean }): AgentModel {
  const model: AgentModel = {
    liveVerified: false,
    provider: "anthropic",
    async complete({ userText, tools }) {
      const response = await client.messages.create({
        model: modelId,
        max_tokens: 800,
        system: "Call tools to edit the project. Never invent spoken words or lyrics. If a transcript is missing, say so.",
        tools: tools.map((name) => ({
          name,
          description: `Editor tool ${name}. The server sets projectId and expectedVersion.`,
          input_schema: { type: "object" as const, additionalProperties: true },
        })),
        messages: [{ role: "user", content: userText }],
      });
      if (options?.liveAfterResponse) model.liveVerified = true;
      return readAnthropicMessage(response);
    },
  };
  return model;
}

export function readAnthropicMessage(response: AnthropicMessage): { text: string; toolCalls: AgentToolCall[]; stop: boolean } {
  const toolCalls: AgentToolCall[] = [];
  const texts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text") texts.push(block.text);
    if (block.type === "tool_use" && block.input && typeof block.input === "object") {
      toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
    }
  }
  return { text: texts.join("\n"), toolCalls, stop: response.stop_reason !== "tool_use" };
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
      const batch = applyBatch(input.store, turn.toolCalls, version, input.projectId);
      results.push(...batch.results);
      if (!batch.ok) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "tool-error" };
    } else {
      for (const call of turn.toolCalls) {
        const result = executeTool(input.store, call.name, { ...call.input, projectId: input.projectId, expectedVersion: version });
        results.push(result);
        if (!result.ok) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "tool-error" };
      }
    }
    if (turn.stop) return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "model-stop" };
  }
  return { provider: input.model.provider, liveVerified: input.model.liveVerified, text, results, stopped: "iteration-limit" };
}

function applyBatch(store: EditorStore, calls: AgentToolCall[], version: number, projectId: string): { ok: boolean; results: ToolResult[] } {
  const checkpoint = executeTool(store, "createCheckpoint", { projectId, expectedVersion: version, label: "Before batch" });
  if (!checkpoint.ok) return { ok: false, results: [checkpoint] };
  const results: ToolResult[] = [];
  let current = version;
  for (const call of calls) {
    const result = executeTool(store, call.name, { ...call.input, projectId, expectedVersion: current });
    results.push(result);
    if (!result.ok) {
      const restored = executeTool(store, "restoreCheckpoint", {
        projectId,
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
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 });
  return modelFromAnthropicClient(client as unknown as AnthropicMessagesClient, modelId, { liveAfterResponse: true });
}
