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
