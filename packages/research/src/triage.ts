export type ProReaderTriageKind = "existing_url_pipeline" | "proreader" | "ambiguous" | "normal_agent";

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

export type ProReaderAmbiguityOption = {
  id: string;
  label: string;
  description: string;
  query: string;
  providerBias: ProviderId[];
};

export type ProReaderTriage = {
  kind: ProReaderTriageKind;
  query: string;
  reason: string;
  route?: QueryRoute;
  options?: ProReaderAmbiguityOption[];
  instruction?: string;
};

export function triageProReaderRequest(query: string): ProReaderTriage {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      kind: "normal_agent",
      query: trimmed,
      reason: "Empty prompts stay on the normal BrowserCode path."
    };
  }

  if (extractExplicitUrl(trimmed)) {
    return {
      kind: "existing_url_pipeline",
      query: trimmed,
      reason: "Explicit URLs must use the existing BrowserCode URL/video/resource/vault pipeline."
    };
  }

  const ambiguity = detectAmbiguity(trimmed);
  if (ambiguity.length) {
    return {
      kind: "ambiguous",
      query: trimmed,
      route: defaultAgenticRoute(),
      options: ambiguity,
      reason: "The query has several plausible meanings with comparable confidence; ask the user to choose before executing search.",
      instruction: renderAmbiguousInstruction(trimmed, ambiguity)
    };
  }

  const route = defaultAgenticRoute();
  return {
    kind: "proreader",
    query: trimmed,
    route,
    reason: "Non-URL BrowserCode turns enter ProReader so the agent can make an agentic routing decision.",
    instruction: renderCoreProReaderInstruction(trimmed, route)
  };
}

function renderAmbiguousInstruction(query: string, options: ProReaderAmbiguityOption[]) {
  return [
    "BrowserCode core preflight selected ProReader, but the query is ambiguous.",
    `Query: ${query}`,
    "Call the question tool first with the provided options. After the user answers, continue in the same turn by calling proreader for the selected direction.",
    "Do not call websearch, webfetch, platform MCP search, route-type skills, or task before the user chooses a direction.",
    `Options: ${options.map((option) => `${option.label}: ${option.description}`).join(" | ")}`
  ].join("\n");
}

export function buildAmbiguousProReaderQuestion(triage: ProReaderTriage) {
  const options = triage.options?.length ? triage.options : defaultAmbiguityOptions(triage.query);

  return {
    header: "ProReader",
    question: `This query may have multiple plausible research directions. Which direction should ProReader pursue first?\n\nOriginal query: ${triage.query}`,
    multiple: false,
    options: options.map((option) => ({
      label: option.label,
      description: option.description
    }))
  };
}

export function resolveAmbiguousProReaderSelection(
  triage: ProReaderTriage,
  selectedLabel: string | undefined
): ProReaderTriage {
  const options = triage.options?.length ? triage.options : defaultAmbiguityOptions(triage.query);
  const selected = options.find((option) => option.label === selectedLabel) ?? options[0]!;
  const route = defaultAgenticRoute();

  return {
    kind: "proreader",
    query: selected.query,
    route,
    reason: `User selected ProReader research direction: ${selected.label}.`,
    instruction: renderCoreProReaderInstruction(selected.query, route, {
      originalQuery: triage.query,
      selectedDirection: selected.label,
      providerBias: selected.providerBias
    })
  };
}

function renderCoreProReaderInstruction(
  query: string,
  route: QueryRoute,
  extra?: {
    originalQuery?: string;
    selectedDirection?: string;
    providerBias?: ProviderId[];
  }
) {
  const lines = [
    "BrowserCode core preflight selected ProReader for this turn.",
    `Query: ${query}`,
    "Hard boundary: this is not an explicit URL, so do not jump straight to websearch, webfetch, multi-search-engine, or platform MCP search.",
    "Call the proreader tool first. Inside ProReader, perform agentic triage: infer the user's intent and decide whether this is QA, discovery, local knowledge, platform search, GitHub/source research, Wikipedia/reference lookup, or ordinary BrowserCode conversation.",
    "If the request is not a research/discovery task after agentic triage, explain that decision briefly and continue with the normal BrowserCode answer path.",
    "If several meanings are plausible with comparable confidence, call the question tool to ask the user to choose a direction, then continue in the same turn.",
    "After ProReader returns a plan, execute ready actions with existing tools/providers. Use ordinary search only as a ProReader fallback or follow-up evidence tool.",
    "Explicit URLs discovered during execution should use the existing URL pipeline; do not feed explicit URLs back into ProReader.",
    "Keep agent judgment: ProReader is a harness and routing layer, not a script. Use it to steer provider choice without suppressing reasoning.",
    `Agentic provider envelope: ${route.providers.join(", ")}`
  ];

  if (extra?.originalQuery) lines.push(`Original ambiguous query: ${extra.originalQuery}`);
  if (extra?.selectedDirection) lines.push(`Selected direction: ${extra.selectedDirection}`);
  if (extra?.providerBias?.length) lines.push(`Selected provider bias: ${extra.providerBias.join(", ")}`);

  return lines.join("\n");
}

function defaultAgenticRoute(): QueryRoute {
  return {
    intent: "web_research_question",
    mode: "answer",
    providers: [
      "llm_wiki_lite",
      "websearch",
      "webfetch",
      "github",
      "wikipedia",
      "official_docs",
      "youtube_data_api",
      "bilibili_mcp",
      "douyin_mcp",
      "xiaohongshu_mcp",
      "site_search"
    ],
    requiresHumanReview: false,
    requiresVaultWrite: false,
    reason: "Provider choice is intentionally deferred to ProReader's agentic triage."
  };
}

function defaultAmbiguityOptions(query: string): ProReaderAmbiguityOption[] {
  return [
    {
      id: "primary",
      label: "Primary meaning",
      description: "Use the most likely meaning after ProReader's agentic triage.",
      query,
      providerBias: ["llm_wiki_lite", "websearch", "wikipedia", "official_docs"]
    },
    {
      id: "alternate",
      label: "Alternate meaning",
      description: "Use the strongest alternate interpretation if the first meaning is not intended.",
      query,
      providerBias: ["websearch", "github", "youtube_data_api", "bilibili_mcp"]
    },
    {
      id: "compare",
      label: "Compare meanings",
      description: "Research the plausible meanings separately, then compare sources and conclusions.",
      query,
      providerBias: ["websearch", "github", "wikipedia", "youtube_data_api", "bilibili_mcp"]
    }
  ];
}

function detectAmbiguity(query: string): ProReaderAmbiguityOption[] {
  if (/\bfable\s*5?\b/i.test(query)) {
    return [
      {
        id: "model",
        label: "AI model",
        description: "Research Fable/Fable 5 as an AI model, release, benchmark, or model ecosystem topic.",
        query,
        providerBias: ["websearch", "github", "official_docs", "youtube_data_api", "bilibili_mcp"]
      },
      {
        id: "game",
        label: "Game",
        description: "Research Fable as the game franchise or a specific game release/community topic.",
        query,
        providerBias: ["websearch", "wikipedia", "youtube_data_api", "bilibili_mcp"]
      },
      {
        id: "compare",
        label: "Compare meanings",
        description: "Research the plausible meanings separately, then compare evidence and disambiguate.",
        query,
        providerBias: ["websearch", "github", "wikipedia", "youtube_data_api", "bilibili_mcp"]
      }
    ];
  }
  return [];
}

function extractExplicitUrl(input: string) {
  return input.match(/https?:\/\/[^\s<>"']+/i)?.[0];
}
