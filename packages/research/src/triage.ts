export type ProReaderTriageKind =
  | "existing_url_pipeline"
  | "proreader"
  | "ambiguous"
  | "normal_agent";

export type ProReaderAmbiguityOption = {
  id: string;
  label: string;
  description: string;
  query: string;
  providerBias: ProviderId[];
};

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
  intent:
    | "local_wiki_question"
    | "code_tooling_question"
    | "knowledge_definition_question"
    | "official_docs_question"
    | "web_research_question"
    | "video_platform_discovery"
    | "social_platform_discovery"
    | "trend_ecosystem_discovery"
    | "vault_ingest_request";
  mode: "answer" | "discovery_ingest";
  providers: ProviderId[];
  requiresHumanReview: boolean;
  requiresVaultWrite: boolean;
  reason: string;
};

export type ProReaderTriage = {
  kind: ProReaderTriageKind;
  query: string;
  reason: string;
  route?: QueryRoute;
  options?: ProReaderAmbiguityOption[];
  instruction?: string;
};

const AMBIGUOUS_TOPICS: Array<{
  pattern: RegExp;
  options: ProReaderAmbiguityOption[];
}> = [
  {
    pattern: /\bfable\s*5?\b|fable5|飞波舞/i,
    options: [
      {
        id: "fable-game",
        label: "Fable 游戏",
        description: "围绕 Fable 游戏、IP、预告、发售、玩家讨论做资料检索。",
        query: "Fable game latest news gameplay release discussion",
        providerBias: ["websearch", "youtube_data_api", "bilibili_mcp", "github"]
      },
      {
        id: "fable-ai-model",
        label: "Fable AI",
        description: "围绕 Fable / Fable5 AI 模型、公司、技术发布、评测做资料检索。",
        query: "Fable Fable5 AI model company benchmark release",
        providerBias: ["websearch", "github", "official_docs", "wikipedia"]
      },
      {
        id: "both",
        label: "两个都查",
        description: "先分开跑两条线，再合并对比来源和结论。",
        query: "Fable game and Fable AI model disambiguation research",
        providerBias: ["websearch", "github", "wikipedia", "youtube_data_api", "bilibili_mcp"]
      }
    ]
  }
];

export function triageProReaderRequest(query: string): ProReaderTriage {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      kind: "normal_agent",
      query: trimmed,
      reason: "Empty prompts stay on the normal agent path."
    };
  }

  if (extractExplicitUrl(trimmed)) {
    return {
      kind: "existing_url_pipeline",
      query: trimmed,
      reason: "Explicit URLs must use the existing BrowserCode URL/video/resource/vault pipeline."
    };
  }

  if (looksLikeDirectCodingWork(trimmed)) {
    return {
      kind: "normal_agent",
      query: trimmed,
      reason: "Direct code editing/debugging prompts should stay on the normal coding agent path."
    };
  }

  const ambiguity = detectKnownAmbiguity(trimmed);
  if (ambiguity) {
    return {
      kind: "ambiguous",
      query: trimmed,
      reason: "The query has multiple plausible research meanings with different provider bias.",
      options: ambiguity.options
    };
  }

  if (!looksLikeResearchRequest(trimmed)) {
    return {
      kind: "normal_agent",
      query: trimmed,
      reason: "The prompt looks like ordinary chat or coding work, not fuzzy research discovery."
    };
  }

  const route = classifyRoute(trimmed);
  return {
    kind: "proreader",
    query: trimmed,
    route,
    reason: "Natural-language fuzzy research should enter ProReader before ordinary web/search tools.",
    instruction: renderCoreProReaderInstruction(trimmed, route, route.providers)
  };
}

export function buildAmbiguousProReaderQuestion(triage: ProReaderTriage) {
  if (triage.kind !== "ambiguous" || !triage.options?.length) {
    throw new Error("PROREADER_TRIAGE_NOT_AMBIGUOUS");
  }

  return {
    header: "ProReader",
    question: `这个查询有多个可能方向。你想让我优先按哪个方向跑 ProReader？\n\n原始查询：${triage.query}`,
    multiple: false,
    options: triage.options.map((option) => ({
      label: option.label,
      description: option.description
    }))
  };
}

export function resolveAmbiguousProReaderSelection(
  triage: ProReaderTriage,
  selectedLabel: string | undefined
): ProReaderTriage {
  if (triage.kind !== "ambiguous" || !triage.options?.length) return triage;

  const selected = triage.options.find((option) => option.label === selectedLabel) ?? triage.options[0];
  const route = classifyRoute(selected.query);

  return {
    kind: "proreader",
    query: selected.query,
    route,
    reason: `User selected ambiguous ProReader direction: ${selected.label}.`,
    instruction: renderCoreProReaderInstruction(selected.query, route, route.providers, {
      originalQuery: triage.query,
      selectedDirection: selected.label,
      providerBias: selected.providerBias
    })
  };
}

function renderCoreProReaderInstruction(
  query: string,
  route: QueryRoute,
  providers: ProviderId[],
  extra?: {
    originalQuery?: string;
    selectedDirection?: string;
    providerBias?: ProviderId[];
  }
) {
  const lines = [
    "BrowserCode core preflight selected ProReader for this turn.",
    `Query: ${query}`,
    `Intent: ${route.intent}`,
    `Mode: ${route.mode}`,
    `Provider plan: ${unique(providers).join(", ")}`,
    `Human review required: ${route.requiresHumanReview ? "yes" : "no"}`,
    "You must call the proreader tool before websearch, webfetch, multi-search-engine, or platform MCP search for this user request.",
    "Execute ready ProReader actions with existing tools/providers. Use ordinary search only as a ProReader fallback or follow-up evidence tool.",
    "Explicit URLs discovered during execution should use the existing URL pipeline; do not feed explicit URLs back into ProReader.",
    "Keep agent judgment: if ProReader marks an action unavailable, use ready fallbacks and explain only real gaps."
  ];

  if (extra?.originalQuery) lines.push(`Original ambiguous query: ${extra.originalQuery}`);
  if (extra?.selectedDirection) lines.push(`Selected direction: ${extra.selectedDirection}`);
  if (extra?.providerBias?.length) lines.push(`Selected provider bias: ${extra.providerBias.join(", ")}`);

  return lines.join("\n");
}

function looksLikeResearchRequest(query: string) {
  return /找|搜索|搜|查|研究|调研|资料|内容|来源|资源|信息|相关|最新|有什么|怎么看|整理|收集|入库|候选|deep|research|search|find|collect|source|latest|what.*about|fuzzy/i.test(query);
}

function looksLikeDirectCodingWork(query: string) {
  return /(修一下|修复|改一下|实现|重构|测试|typecheck|报错|bug|fix|implement|refactor|test).*(\b[\w.-]+\.(ts|tsx|js|jsx|json|md|py|rs|go)\b|packages\/|apps\/|opencode\/|src\/|\\src\\)/i.test(query);
}

function classifyRoute(query: string): QueryRoute {
  if (/入库|收集|整理|资料|候选|evidence pack|collect|ingest|source/i.test(query)) {
    return {
      intent: "vault_ingest_request",
      mode: "discovery_ingest",
      providers: ["websearch", "github", "wikipedia", "youtube_data_api", "bilibili_mcp", "site_search"],
      requiresHumanReview: true,
      requiresVaultWrite: true,
      reason: "The user is preparing external material for possible knowledge ingestion."
    };
  }

  if (/视频|B站|bilibili|youtube|油管|抖音|小红书|tiktok|平台|内容|video|creator/i.test(query)) {
    return {
      intent: "video_platform_discovery",
      mode: "discovery_ingest",
      providers: ["websearch", "site_search", "youtube_data_api", "bilibili_mcp", "douyin_mcp", "xiaohongshu_mcp"],
      requiresHumanReview: true,
      requiresVaultWrite: false,
      reason: "The user is asking for fuzzy platform search over video/social sources."
    };
  }

  if (/github|repo|repository|issue|pull request|\bpr\b|cli|mcp|api|sdk|typescript|python|bun|opencode|codex/i.test(query)) {
    return {
      intent: "code_tooling_question",
      mode: "answer",
      providers: ["llm_wiki_lite", "github", "official_docs", "websearch"],
      requiresHumanReview: false,
      requiresVaultWrite: false,
      reason: "Code/tooling research benefits from local knowledge, GitHub, official docs, and web search."
    };
  }

  if (/是什么|定义|历史|原理|背景|概念|人物|组织|wikipedia|维基|what is|history|background/i.test(query)) {
    return {
      intent: "knowledge_definition_question",
      mode: "answer",
      providers: ["llm_wiki_lite", "wikipedia", "official_docs", "websearch"],
      requiresHumanReview: false,
      requiresVaultWrite: false,
      reason: "Definition/background questions benefit from local knowledge and reference providers."
    };
  }

  return {
    intent: "web_research_question",
    mode: "answer",
    providers: ["llm_wiki_lite", "websearch", "webfetch"],
    requiresHumanReview: false,
    requiresVaultWrite: false,
    reason: "Default fuzzy research route uses ProReader before ordinary web search/fetch."
  };
}

function detectKnownAmbiguity(query: string) {
  return AMBIGUOUS_TOPICS.find((topic) => topic.pattern.test(query));
}

function extractExplicitUrl(input: string) {
  return input.match(/https?:\/\/[^\s<>"']+/i)?.[0];
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
