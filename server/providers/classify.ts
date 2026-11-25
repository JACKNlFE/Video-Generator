import type { HealthReport, HealthStatus, ProbeOutcome, ProviderKind } from "./types";

export function classifyProbe(input: {
  configured: boolean;
  verify: boolean;
  probe: ProbeOutcome | null;
  requiredModelIds: string[];
}): { status: HealthStatus; detail: string; unavailableModels: string[] } {
  if (!input.configured) {
    return { status: "not configured", detail: "Credentials for this provider are not set.", unavailableModels: [] };
  }
  if (!input.verify || !input.probe) {
    return { status: "configured but unverified", detail: "Credentials are set. No live check was requested.", unavailableModels: [] };
  }
  if (!input.probe.ok) {
    if (input.probe.modelMissing || input.probe.httpStatus === 404) {
      return {
        status: "unavailable model or capability",
        detail: "The provider rejected the requested model or capability.",
        unavailableModels: input.requiredModelIds,
      };
    }
    if (input.probe.httpStatus === 403) {
      return { status: "insufficient permissions", detail: "The credentials were recognized but do not have permission for this check.", unavailableModels: [] };
    }
    const status = input.probe.httpStatus;
    return {
      status: "connection failed",
      detail: status == null ? "The provider could not be reached." : `The provider returned HTTP ${status}.`,
      unavailableModels: [],
    };
  }
  if (input.probe.modelIds && input.requiredModelIds.length > 0) {
    const known = new Set(input.probe.modelIds);
    const missing = input.requiredModelIds.filter((id) => !known.has(id));
    if (missing.length === input.requiredModelIds.length) {
      return {
        status: "unavailable model or capability",
        detail: `None of the configured models are available: ${missing.join(", ")}.`,
        unavailableModels: missing,
      };
    }
    if (missing.length > 0) {
      const available = input.requiredModelIds.filter((id) => known.has(id));
      return {
        status: "connected and verified",
        detail: `Connected. Unavailable model: ${missing.join(", ")}. Available configured model: ${available.join(", ")}.`,
        unavailableModels: missing,
      };
    }
  }
  return { status: "connected and verified", detail: "The live check succeeded.", unavailableModels: [] };
}

export function reportFor(kind: ProviderKind, providerId: string, classified: { status: HealthStatus; detail: string; unavailableModels: string[] }): HealthReport {
  return { kind, providerId, status: classified.status, detail: classified.detail, unavailableModels: classified.unavailableModels };
}

export function httpStatusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; statusCode?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.$metadata?.httpStatusCode === "number") return record.$metadata.httpStatusCode;
  return null;
}

export function redact(text: string, secrets: Array<string | null | undefined>): string {
  let output = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) output = output.split(secret).join("[redacted]");
  }
  return output.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]").slice(0, 300);
}
