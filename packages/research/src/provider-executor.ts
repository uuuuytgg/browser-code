import type { ProviderId, ProviderPlan, ProviderStep, RawDiscoveryCandidate } from "./index";

export type ProviderExecutionKind =
  | "agent_builtin"
  | "lite_wiki_harness"
  | "api_request"
  | "mcp_tool"
  | "cli_command"
  | "disabled_fallback";

export type ProviderExecutionRequest = {
  id: string;
  provider: ProviderId;
  stepId: string;
  batchId?: string;
  dependsOn?: string[];
  independent?: boolean;
  evaluationCriteria?: string[];
  kind: ProviderExecutionKind;
  input: Record<string, unknown>;
  requiresNetwork: boolean;
  requiresApproval: boolean;
  writesVault: false;
  writesKnowledgeBase: false;
};

export type ProviderExecutionResult = {
  requestId: string;
  provider: ProviderId;
  status: "planned" | "skipped" | "completed" | "blocked_by_policy";
  candidates: RawDiscoveryCandidate[];
  notes: string[];
  sideEffects: {
    writesVault: false;
    writesKnowledgeBase: false;
    executedNetwork: boolean;
  };
};

export type ProviderExecutionPolicy = {
  allowNetwork: boolean;
};

export type ProviderExecutionAdapter = (
  request: ProviderExecutionRequest
) => Promise<Omit<ProviderExecutionResult, "requestId" | "provider" | "sideEffects">>;

export type ProviderExecutionAdapters = Partial<Record<ProviderExecutionKind, ProviderExecutionAdapter>>;

// ── Phase 1+2: Step guard & failure tracking ──

export const STEP_GUARD = {
  timeout: {
    web_fetch: 30_000,
    api_call: 15_000,
    platform_mcp: 30_000,
    video_download: 120_000,
    default: 30_000,
  },
  maxRetries: 3,
  retryDelay: 2_000,
} as const;

export type FailureReason =
  | "timeout"
  | "connection_refused"
  | "dns_not_resolvable"
  | "http_404"
  | "http_403"
  | "http_5xx"
  | "jsdom_empty_shell"
  | "low_quality"
  | "cloudflare_blocked"
  | "rate_limited"
  | "cookie_expired"
  | "mcp_unavailable"
  | "parse_error"
  | "unknown";

export type ProReaderFailure = {
  step: string;
  provider: ProviderId;
  kind: "web_fetch" | "api_call" | "platform_mcp" | "video_download" | "unknown";
  url?: string;
  reason: FailureReason;
  retries: number;
  timestamp: string;
};

/** Maps a step kind to a guard timeout value. */
export function getStepTimeout(kind: string): number {
  const key = kind in STEP_GUARD.timeout ? kind as keyof typeof STEP_GUARD.timeout : "default";
  return STEP_GUARD.timeout[key];
}

/** Classifies a raw error string/message into a FailureReason. */
export function classifyFailure(error: unknown): FailureReason {
  const msg = String(error ?? "").toLowerCase();
  if (!msg) return "unknown";
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("econnrefused") || msg.includes("connection refused")) return "connection_refused";
  if (msg.includes("enotfound") || msg.includes("dns") || msg.includes("name resolution")) return "dns_not_resolvable";
  if (msg.includes("404") || msg.includes("not found")) return "http_404";
  if (msg.includes("403") || msg.includes("forbidden")) return "http_403";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("server error")) return "http_5xx";
  if (msg.includes("empty shell") || msg.includes("jsdom") || msg.includes("no content")) return "jsdom_empty_shell";
  if (msg.includes("low quality") || msg.includes("<50")) return "low_quality";
  if (msg.includes("cloudflare") || msg.includes("challenge") || msg.includes("captcha")) return "cloudflare_blocked";
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) return "rate_limited";
  if (msg.includes("cookie") || msg.includes("unauthorized") || msg.includes("expired")) return "cookie_expired";
  if (msg.includes("mcp") && (msg.includes("unavailable") || msg.includes("not found") || msg.includes("disconnected")))
    return "mcp_unavailable";
  if (msg.includes("parse") || msg.includes("json") || msg.includes("schema")) return "parse_error";
  return "unknown";
}

/** Maps a ProviderStep kind to the guard's kind taxonomy. */
export function inferFailureKind(step: ProviderStep): ProReaderFailure["kind"] {
  if (step.provider === "webfetch" || step.provider === "websearch") return "web_fetch";
  if (step.provider === "github" || step.provider === "wikipedia" || step.provider === "official_docs") return "api_call";
  if (
    step.provider === "bilibili_mcp" ||
    step.provider === "douyin_mcp" ||
    step.provider === "xiaohongshu_mcp" ||
    step.provider === "tiktok_mcp"
  )
    return "platform_mcp";
  if (step.provider === "youtube_data_api") return "video_download";
  return "unknown";
}

function buildFailure(step: ProviderStep, error: unknown, retries: number, url?: string): ProReaderFailure {
  const msg = String(error ?? "");
  return {
    step: step.id,
    provider: step.provider,
    kind: inferFailureKind(step),
    url,
    reason: classifyFailure(error),
    retries,
    timestamp: new Date().toISOString(),
  };
}

/** Execution plan instructions for agent-side step execution with guard rails. */
export function buildStepGuardInstructions(steps: ProviderStep[]): string[] {
  return steps.map((step) => {
    const kind = inferFailureKind(step);
    const timeout = getStepTimeout(kind);
    return `${step.id} (${step.provider}): timeout ${timeout}ms, max ${STEP_GUARD.maxRetries} retries. On exhausted retries → skip, record failure, continue.`;
  });
}

// ── Original executor functions ──

export function buildProviderExecutionRequests(plan: ProviderPlan): ProviderExecutionRequest[] {
  return plan.steps.map((step) => ({
    id: `${step.id}-execution`,
    provider: step.provider,
    stepId: step.id,
    batchId: step.batchId,
    dependsOn: step.dependsOn,
    independent: step.independent,
    evaluationCriteria: step.evaluationCriteria,
    kind: inferExecutionKind(step),
    input: step.input,
    requiresNetwork: inferRequiresNetwork(step),
    requiresApproval: step.requiresApproval,
    writesVault: false,
    writesKnowledgeBase: false
  }));
}

export function runProviderExecutionDryRun(request: ProviderExecutionRequest): ProviderExecutionResult {
  return {
    requestId: request.id,
    provider: request.provider,
    status: "planned",
    candidates: [],
    notes: [
      `Dry-run only. ${request.provider} execution is planned but not performed.`,
      request.requiresNetwork ? "Real execution requires a configured provider adapter." : "This can be fulfilled by local agent harness."
    ],
    sideEffects: {
      writesVault: false,
      writesKnowledgeBase: false,
      executedNetwork: false
    }
  };
}

export async function executeProviderRequest(
  request: ProviderExecutionRequest,
  adapters: ProviderExecutionAdapters = {},
  policy: ProviderExecutionPolicy = { allowNetwork: false }
): Promise<ProviderExecutionResult> {
  if (request.requiresNetwork && !policy.allowNetwork) {
    return {
      requestId: request.id,
      provider: request.provider,
      status: "blocked_by_policy",
      candidates: [],
      notes: ["Network execution is blocked by provider execution policy."],
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false,
        executedNetwork: false
      }
    };
  }

  const adapter = adapters[request.kind];
  if (!adapter) {
    return runProviderExecutionDryRun(request);
  }

  const result = await adapter(request);
  return {
    requestId: request.id,
    provider: request.provider,
    status: result.status,
    candidates: result.candidates,
    notes: result.notes,
    sideEffects: {
      writesVault: false,
      writesKnowledgeBase: false,
      executedNetwork: request.requiresNetwork
    }
  };
}

export function assertProviderExecutionIsSideEffectSafe(requests: ProviderExecutionRequest[]): void {
  const unsafe = requests.find((request) => request.writesVault || request.writesKnowledgeBase);
  if (unsafe) {
    throw new Error(`PROVIDER_EXECUTION_WRITES_FORMAL_KNOWLEDGE: ${unsafe.id}`);
  }
}

function inferExecutionKind(step: ProviderStep): ProviderExecutionKind {
  const mode = String(step.input.providerMode ?? "");

  if (step.provider === "llm_wiki_lite") return "lite_wiki_harness";
  if (step.provider === "websearch" || step.provider === "webfetch") return "agent_builtin";
  if (step.input.disabledProvider) return "disabled_fallback";
  if (mode === "mcp" || mode === "mcp_or_cli") return "mcp_tool";
  if (mode === "cli") return "cli_command";
  return "api_request";
}

function inferRequiresNetwork(step: ProviderStep) {
  if (step.provider === "llm_wiki_lite") return false;
  return step.provider !== "webfetch" || Boolean(step.input.url);
}
