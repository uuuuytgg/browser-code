import { planGitHubSearchSteps } from "./github";
import { planOfficialDocsSearchSteps } from "./official-docs";
import { getProviderConfig, resolveProviderConfig } from "./provider-config";
import { planWikipediaSearchSteps } from "./wikipedia";

export {
  assertEnrichmentUsesApprovedManifest,
  planEnrichmentFromApprovedManifest
} from "./enrichment";
export type {
  EnrichmentPlan,
  EnrichmentRisk,
  EnrichmentStep,
  EnrichmentStepKind
} from "./enrichment";
export {
  buildEnrichmentExecutionRequests,
  prepareEnrichmentExecution
} from "./enrichment-adapter";
export type {
  EnrichmentExecutionCapability,
  EnrichmentExecutionRequest,
  EnrichmentExecutionTool
} from "./enrichment-adapter";
export {
  assertNoDiscoveryEnrichment,
  assertProviderPlanIsSearchOnly,
  buildDiscoveryCandidatePool,
  collectDiscoveryCandidates,
  createDiscoveryRun,
  dedupeDiscoveryCandidates,
  rankDiscoveryCandidates,
  scanDiscoveryRisks,
  stopAtHumanReview,
  transitionDiscoveryRun
} from "./discovery";
export type {
  BlockedDiscoveryFutureStatus,
  DiscoveryAuditEvent,
  DiscoveryCandidate,
  DiscoveryRiskLevel,
  DiscoveryRiskSignal,
  DiscoveryRun,
  DiscoveryRunStatus,
  DiscoveryTransitionTarget,
  RawDiscoveryCandidate
} from "./discovery";
export {
  buildAnswerContextDraft,
  getProviderAdapter
} from "./answer";
export type {
  AnswerContextDraft,
  AnswerContextSection,
  ProviderAdapterDescriptor,
  ProviderAdapterKind
} from "./answer";
export {
  buildGitHubSearchQueries,
  extractGitHubRepository,
  planGitHubSearchSteps
} from "./github";
export type {
  GitHubSearchKind,
  GitHubSearchQuery,
  GitHubRepositoryRef
} from "./github";
export {
  planOfficialDocsSearchSteps
} from "./official-docs";
export type {
  OfficialDocsSearchQuery
} from "./official-docs";
export {
  defaultProviderConfig,
  getProviderConfig,
  resolveProviderConfig
} from "./provider-config";
export type {
  ProReaderProviderConfig,
  ProReaderProviderConfigInput,
  ProviderConfigEntry,
  ProviderMode
} from "./provider-config";
export {
  buildMcpToolsRuntimeBridge,
  diagnoseProviderRuntime
} from "./runtime-config";
export type {
  McpToolsConfig,
  McpToolsRuntimeBridge,
  ProviderRuntimeDiagnostic,
  ProviderRuntimeStatus,
  RuntimeEnvironment
} from "./runtime-config";
export {
  assertProviderExecutionIsSideEffectSafe,
  buildProviderExecutionRequests,
  executeProviderRequest,
  runProviderExecutionDryRun
} from "./provider-executor";
export type {
  ProviderExecutionAdapter,
  ProviderExecutionAdapters,
  ProviderExecutionKind,
  ProviderExecutionPolicy,
  ProviderExecutionRequest,
  ProviderExecutionResult
} from "./provider-executor";
export {
  buildProviderExecutableActions,
  diagnoseProviderActionReadiness
} from "./provider-actions";
export type {
  ProviderActionReadiness,
  ProviderExecutableAction,
  ProviderExecutablePlan
} from "./provider-actions";
export {
  assertVaultHandoffIsDryRun,
  buildVaultDryRunHandoff
} from "./vault-adapter";
export type {
  VaultAdapterMode,
  VaultDryRunHandoff,
  VaultHandoffArtifact,
  VaultIngestManifest
} from "./vault-adapter";
export {
  applyReviewDecisions,
  assertNoUnreviewedCandidatesInManifest,
  buildApprovedManifest
} from "./review";
export type {
  ApprovedManifest,
  ApprovedManifestEntry,
  CandidateReviewDecision,
  ReviewedDiscoveryCandidate,
  ReviewedDiscoveryRun,
  ReviewDecision
} from "./review";
export {
  applyReviewActions,
  buildReviewedManifest,
  createReviewSession,
  listReviewItems
} from "./review-service";
export type {
  ReviewActionResult,
  ReviewItem,
  ReviewSession,
  ReviewSessionStatus
} from "./review-service";
export {
  planWikipediaSearchSteps
} from "./wikipedia";
export type {
  WikipediaSearchQuery
} from "./wikipedia";

export type InputDispatch =
  | {
      kind: "existing_url_pipeline";
      url: string;
      reason: string;
    }
  | {
      kind: "proreader";
      query: string;
      reason: string;
    };

export type QueryIntent =
  | "local_wiki_question"
  | "code_tooling_question"
  | "knowledge_definition_question"
  | "official_docs_question"
  | "web_research_question"
  | "video_platform_discovery"
  | "social_platform_discovery"
  | "trend_ecosystem_discovery"
  | "vault_ingest_request";

export type ProviderId =
  | "llm_wiki_lite"
  | "websearch"
  | "webfetch"
  | "github"
  | "wikipedia"
  | "official_docs"
  | "youtube_data_api"
  | "bilibili_mcp"
  | "douyin_mcp"
  | "xiaohongshu_mcp"
  | "tiktok_mcp"
  | "site_search";

export type QueryRoute = {
  intent: QueryIntent;
  mode: "answer" | "discovery_ingest";
  providers: ProviderId[];
  requiresHumanReview: boolean;
  requiresVaultWrite: boolean;
  reason: string;
};

export type ProviderStep = {
  id: string;
  provider: ProviderId;
  action: "search" | "fetch";
  input: Record<string, unknown>;
  requiresApproval: boolean;
};

export type ProviderPlan = {
  mode: "answer" | "discovery_ingest";
  steps: ProviderStep[];
};

export type ProReaderRequest = {
  query: string;
  requestedMode?: "answer" | "discovery_ingest";
};

export type ResearchCandidate = {
  id: string;
  provider: ProviderId;
  title: string;
  url: string;
  summary?: string;
  needsReview: boolean;
};

export type EvidencePack = {
  candidate: ResearchCandidate;
  evidenceMarkdown: string;
  sourceUrls: string[];
};

export function dispatchInput(input: string): InputDispatch {
  const trimmed = input.trim();
  const url = extractExplicitUrl(trimmed);

  if (url) {
    return {
      kind: "existing_url_pipeline",
      url,
      reason: "Explicit URLs are handled by the existing BrowserCode URL pipeline before ProReader."
    };
  }

  return {
    kind: "proreader",
    query: trimmed,
    reason: "Natural-language or fuzzy queries enter ProReader routing."
  };
}

export function routeQuery(request: ProReaderRequest): QueryRoute {
  const query = request.query.trim();

  if (matchesVaultIngestRequest(query) || request.requestedMode === "discovery_ingest") {
    return {
      intent: "vault_ingest_request",
      mode: "discovery_ingest",
      providers: ["websearch", "github", "wikipedia", "youtube_data_api", "bilibili_mcp", "site_search"],
      requiresHumanReview: true,
      requiresVaultWrite: true,
      reason: "The user asked to collect or prepare external material for knowledge ingestion."
    };
  }

  if (matchesVideoDiscoveryQuery(query)) {
    return {
      intent: "video_platform_discovery",
      mode: "discovery_ingest",
      providers: ["websearch", "site_search", "youtube_data_api", "bilibili_mcp", "douyin_mcp", "xiaohongshu_mcp", "tiktok_mcp"],
      requiresHumanReview: true,
      requiresVaultWrite: false,
      reason: "The user is asking for fuzzy platform search over video/social sources."
    };
  }

  if (matchesLocalWikiQuery(query)) {
    return {
      intent: "local_wiki_question",
      mode: "answer",
      providers: ["llm_wiki_lite"],
      requiresHumanReview: false,
      requiresVaultWrite: false,
      reason: "The user is asking about existing BrowserCode/local knowledge."
    };
  }

  if (matchesKnowledgeDefinitionQuery(query)) {
    return {
      intent: "knowledge_definition_question",
      mode: "answer",
      providers: ["llm_wiki_lite", "wikipedia", "official_docs", "websearch"],
      requiresHumanReview: false,
      requiresVaultWrite: false,
      reason: "Definition/background questions benefit from local knowledge and reference providers."
    };
  }

  if (matchesCodeToolingQuery(query)) {
    return {
      intent: "code_tooling_question",
      mode: "answer",
      providers: ["llm_wiki_lite", "github", "official_docs", "websearch"],
      requiresHumanReview: false,
      requiresVaultWrite: false,
      reason: "Code/tooling questions benefit from local knowledge, GitHub, official docs, and web search."
    };
  }

  return {
    intent: "web_research_question",
    mode: "answer",
    providers: ["llm_wiki_lite", "websearch", "webfetch"],
    requiresHumanReview: false,
    requiresVaultWrite: false,
    reason: "Default answer route uses local context and existing web search/fetch."
  };
}

export function planProviders(route: QueryRoute, query: string, config = resolveProviderConfig()): ProviderPlan {
  const steps: ProviderStep[] = [];

  for (const provider of route.providers) {
    const providerConfig = getProviderConfig(config, provider);
    if (!providerConfig.enabled) {
      steps.push(...buildFallbackSteps(provider, query, providerConfig.fallbackProviders ?? []));
      continue;
    }

    if (provider === "llm_wiki_lite") {
      steps.push({
        id: "local-wiki-search",
        provider,
        action: "search",
        input: {
          query,
          adapter: "harness/make_answer_context.ts",
          outputPath: ".tmp/answer_context.md",
          internalKnowledgePath: "llm_wiki_lite",
          providerMode: providerConfig.mode
        },
        requiresApproval: false
      });
      continue;
    }

    if (provider === "github") {
      steps.push(...filterDiscoverySteps(route, planGitHubSearchSteps(query, providerConfig)));
      continue;
    }

    if (provider === "official_docs") {
      steps.push(...filterDiscoverySteps(route, planOfficialDocsSearchSteps(query, providerConfig)));
      continue;
    }

    if (provider === "wikipedia") {
      steps.push(...filterDiscoverySteps(route, planWikipediaSearchSteps(query, providerConfig)));
      continue;
    }

    if (isPlatformDiscoveryProvider(provider)) {
      steps.push({
        id: `${provider}-search`,
        provider,
        action: "search",
        input: {
          query,
          limit: 20,
          providerMode: providerConfig.mode,
          toolName: providerConfig.toolName ?? null,
          command: providerConfig.command,
          apiKeyEnv: providerConfig.apiKeyEnv,
          tokenEnv: providerConfig.tokenEnv,
          userAgentEnv: providerConfig.userAgentEnv,
          fallbackProviders: providerConfig.fallbackProviders ?? []
        },
        requiresApproval: false
      });
      continue;
    }

    if (provider === "site_search") {
      steps.push(...buildSiteSearchSteps(query));
      continue;
    }

    steps.push({
      id: `${provider}-search`,
      provider,
      action: "search",
      input: { query, providerMode: providerConfig.mode },
      requiresApproval: false
    });
  }

  return {
    mode: route.mode,
    steps
  };
}

export function planProReader(
  request: ProReaderRequest,
  config = resolveProviderConfig()
): { route: QueryRoute; plan: ProviderPlan } {
  const dispatch = dispatchInput(request.query);
  if (dispatch.kind === "existing_url_pipeline") {
    throw new Error(`EXPLICIT_URL_BYPASSES_PROREADER: ${dispatch.url}`);
  }

  const route = routeQuery(request);
  return {
    route,
    plan: planProviders(route, request.query, config)
  };
}

/** @deprecated Explicit URLs should be dispatched to the existing BrowserCode URL pipeline before ProReader. */
export type ResearchRoute =
  | "local_answer"
  | "external_discovery"
  | "github_research"
  | "video_discovery";

/** @deprecated Use ProviderId and ProviderStep for ProReader provider planning. */
export type ProviderKind =
  | "llm_wiki_lite"
  | "github"
  | "official_docs"
  | "websearch"
  | "webfetch"
  | "wikipedia"
  | "video_discovery";

/** @deprecated Use dispatchInput + routeQuery + planProviders. */
export type ResearchRequest = {
  query: string;
  requestedMode?: "answer" | "discovery_ingest";
};

/** @deprecated Use QueryRoute and ProviderPlan. */
export type LegacyProviderPlan = {
  route: ResearchRoute;
  providers: ProviderKind[];
  reviewRequired: boolean;
  writesVaultDirectly: false;
  notes: string[];
};

/** @deprecated Use planProReader for fuzzy ProReader queries. */
export function planResearch(request: ResearchRequest): { route: QueryRoute; plan: ProviderPlan } {
  return planProReader({
    query: request.query,
    requestedMode: request.requestedMode
  });
}

function extractExplicitUrl(input: string) {
  const match = input.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0];
}

function matchesLocalWikiQuery(query: string) {
  return /我之前|本地知识|已有知识|browser-code|browsercode|vault|wiki lite|llm wiki lite|知识库/i.test(query);
}

function matchesCodeToolingQuery(query: string) {
  return /github|repo|repository|issue|pull request|\bpr\b|cli|mcp|api|sdk|报错|部署|配置|typescript|python|bun|opencode|claude code|codex/i.test(query);
}

function matchesKnowledgeDefinitionQuery(query: string) {
  return /是什么|定义|历史|原理|背景|概念|人物|组织|技术路线|wikipedia|维基/i.test(query);
}

function matchesVideoDiscoveryQuery(query: string) {
  return /youtube|bilibili|b站|哔哩|抖音|小红书|tiktok|视频|教程|平台上有什么|大家怎么看|内容生态|热门内容|深度内容/i.test(query);
}

function matchesVaultIngestRequest(query: string) {
  return /帮我搜集|整理一批资料|加入知识库|准备入库|资料包|evidence pack|外部资料|候选池/i.test(query);
}

function isLocalWikiQuery(query: string) {
  return /我之前|本地知识|已有知识|browser-code|browsercode|vault|wiki lite/i.test(query);
}

function isCodeToolingQuery(query: string) {
  return /github|repo|repository|issue|pull request|\bpr\b|cli|mcp|api|sdk|报错|部署|配置|typescript|python|bun|opencode|claude code|codex/i.test(query);
}

function isKnowledgeDefinitionQuery(query: string) {
  return /是什么|定义|历史|原理|背景|概念|人物|组织|技术路线|wikipedia|维基/i.test(query);
}

function isVideoDiscoveryQuery(query: string) {
  return /youtube|bilibili|b站|抖音|小红书|tiktok|视频|教程|平台上有什么|大家怎么看|内容生态|热门内容/i.test(query);
}

function isVaultIngestRequest(query: string) {
  return /帮我搜集|整理一批资料|加入知识库|准备入库|资料包|evidence pack|外部资料|候选池/i.test(query);
}

function isPlatformDiscoveryProvider(provider: ProviderId) {
  return provider === "youtube_data_api"
    || provider === "bilibili_mcp"
    || provider === "douyin_mcp"
    || provider === "xiaohongshu_mcp"
    || provider === "tiktok_mcp";
}

function buildSiteSearchSteps(query: string): ProviderStep[] {
  return [
    ["youtube", "site:youtube.com/watch"],
    ["bilibili", "site:bilibili.com/video"],
    ["douyin", "site:douyin.com"],
    ["xiaohongshu", "site:xiaohongshu.com"],
    ["tiktok", "site:tiktok.com"]
  ].map(([id, site]) => ({
    id: `site-search-${id}`,
    provider: "websearch" as const,
    action: "search" as const,
    input: { query: `${query} ${site}` },
    requiresApproval: false
  }));
}

function buildFallbackSteps(provider: ProviderId, query: string, fallbackProviders: ProviderId[]): ProviderStep[] {
  return fallbackProviders.map((fallbackProvider) => ({
    id: `${provider}-fallback-${fallbackProvider}-search`,
    provider: fallbackProvider,
    action: "search",
    input: {
      query,
      disabledProvider: provider
    },
    requiresApproval: false
  }));
}

function filterDiscoverySteps(route: QueryRoute, steps: ProviderStep[]) {
  if (route.mode !== "discovery_ingest") return steps;
  return steps.filter((step) => step.action === "search");
}
