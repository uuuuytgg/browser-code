import type { ProviderExecutionRequest } from "./provider-executor";
import type { RuntimeEnvironment } from "./runtime-config";

export type ProviderExecutableAction =
  | {
      kind: "agent_tool";
      tool: "websearch" | "webfetch";
      args: Record<string, unknown>;
      sourceRequestId: string;
      provider: ProviderExecutionRequest["provider"];
    }
  | {
      kind: "shell_command";
      command: string;
      args: string[];
      sourceRequestId: string;
      provider: ProviderExecutionRequest["provider"];
    }
  | {
      kind: "api_request";
      method: "GET";
      url: string;
      headersEnv?: Record<string, string>;
      optionalHeadersEnv?: Record<string, string>;
      queryEnv?: Record<string, string>;
      sourceRequestId: string;
      provider: ProviderExecutionRequest["provider"];
    }
  | {
      kind: "mcp_tool";
      server?: string;
      toolName: string;
      args: Record<string, unknown>;
      sourceRequestId: string;
      provider: ProviderExecutionRequest["provider"];
    }
  | {
      kind: "harness_command";
      command: "bun";
      args: string[];
      outputPath?: string;
      sourceRequestId: string;
      provider: ProviderExecutionRequest["provider"];
    };

export type ProviderExecutablePlan = {
  actions: ProviderExecutableAction[];
  notes: string[];
};

export type ProviderActionReadiness = {
  actionIndex: number;
  provider: ProviderExecutionRequest["provider"];
  kind: ProviderExecutableAction["kind"];
  status: "ready" | "needs_configuration";
  configured: string[];
  missing: string[];
  notes: string[];
};

const PLATFORM_SITE: Partial<Record<ProviderExecutionRequest["provider"], string>> = {
  youtube_data_api: "youtube.com/watch",
  bilibili_mcp: "bilibili.com/video",
  douyin_mcp: "douyin.com",
  xiaohongshu_mcp: "xiaohongshu.com",
  tiktok_mcp: "tiktok.com"
};

export function buildProviderExecutableActions(requests: ProviderExecutionRequest[]): ProviderExecutablePlan {
  const actions = requests.flatMap(buildActionsForRequest);
  return {
    actions,
    notes: [
      "These actions are executable by BrowserCode's existing agent tools, configured MCP tools, API fetches, or CLI commands.",
      "Explicit URLs are not represented here; they must remain on the existing BrowserCode URL pipeline.",
      "Discovery actions collect candidates only. Enrichment remains gated by human-approved manifests."
    ]
  };
}

export function diagnoseProviderActionReadiness(
  actions: ProviderExecutableAction[],
  runtime: RuntimeEnvironment = {}
): ProviderActionReadiness[] {
  return actions.map((action, actionIndex) => {
    const requirements = actionRequirements(action);
    const configured: string[] = [];
    const missing: string[] = [];

    for (const requirement of requirements) {
      if (isRequirementConfigured(requirement, runtime)) configured.push(requirement);
      else missing.push(requirement);
    }

    return {
      actionIndex,
      provider: action.provider,
      kind: action.kind,
      status: missing.length === 0 ? "ready" : "needs_configuration",
      configured,
      missing,
      notes: actionReadinessNotes(action, missing)
    };
  });
}

function buildActionsForRequest(request: ProviderExecutionRequest): ProviderExecutableAction[] {
  switch (request.provider) {
    case "llm_wiki_lite":
      return [
        {
          kind: "harness_command",
          command: "bun",
          args: ["run", "harness/make_answer_context.ts", stringInput(request, "query")],
          outputPath: stringInput(request, "outputPath") || ".tmp/answer_context.md",
          sourceRequestId: request.id,
          provider: request.provider
        }
      ];
    case "websearch":
      return [websearchAction(request, stringInput(request, "query"))];
    case "webfetch":
      return stringInput(request, "url") ? [webfetchAction(request, stringInput(request, "url"))] : [];
    case "official_docs":
      return arrayInput(request, "templates").map((query) => websearchAction(request, query));
    case "site_search":
      return arrayInput(request, "templates").map((query) => websearchAction(request, query));
    case "github":
      return buildGitHubActions(request);
    case "wikipedia":
      return buildWikipediaActions(request);
    case "youtube_data_api":
      return buildYouTubeActions(request);
    case "bilibili_mcp":
    case "douyin_mcp":
    case "xiaohongshu_mcp":
    case "tiktok_mcp":
      return buildPlatformActions(request);
  }
}

function actionRequirements(action: ProviderExecutableAction): string[] {
  if (action.kind === "agent_tool" || action.kind === "harness_command") return [];

  if (action.kind === "shell_command") {
    return [`command:${action.command}`];
  }

  if (action.kind === "mcp_tool") {
    return [`mcpTool:${action.toolName}`];
  }

  return [
    ...Object.values(action.headersEnv ?? {}).filter(isEnvRequirement),
    ...Object.values(action.queryEnv ?? {}).filter(isEnvRequirement)
  ];
}

function isRequirementConfigured(requirement: string, runtime: RuntimeEnvironment): boolean {
  if (requirement.startsWith("command:")) {
    return Boolean(runtime.availableCommands?.includes(requirement.slice("command:".length)));
  }

  if (requirement.startsWith("mcpTool:")) {
    return Boolean(runtime.configuredMcpTools?.[requirement.slice("mcpTool:".length)]);
  }

  return Boolean(runtime.env?.[requirement]);
}

function isEnvRequirement(value: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(value);
}

function actionReadinessNotes(action: ProviderExecutableAction, missing: string[]) {
  if (missing.length === 0) {
    if (action.kind === "agent_tool") return ["Ready through existing BrowserCode agent tool capability."];
    if (action.kind === "harness_command") return ["Ready through local BrowserCode harness; no MCP required."];
    return ["Ready with current runtime configuration."];
  }

  if (action.kind === "api_request") {
    return ["API action needs environment configuration; keep provider fallbacks available."];
  }
  if (action.kind === "shell_command") {
    return ["CLI action needs the command to be available to the agent runtime."];
  }
  if (action.kind === "mcp_tool") {
    return ["MCP action needs the tool mapping to be configured in the agent runtime."];
  }
  return ["Action needs runtime configuration."];
}

function buildGitHubActions(request: ProviderExecutionRequest): ProviderExecutableAction[] {
  const query = stringInput(request, "query");
  const kind = stringInput(request, "kind");
  const tokenEnv = stringInput(request, "tokenEnv") || "GITHUB_TOKEN";
  const command = stringInput(request, "command");
  const endpoint = kind === "repository"
    ? `/search/repositories?q=${encodeURIComponent(query)}&per_page=10`
    : `/search/issues?q=${encodeURIComponent(query)}&per_page=10`;
  const actions: ProviderExecutableAction[] = [
    {
      kind: "api_request",
      method: "GET",
      url: `https://api.github.com${endpoint}`,
      headersEnv: {
        Accept: "application/vnd.github+json"
      },
      optionalHeadersEnv: {
        Authorization: tokenEnv
      },
      sourceRequestId: request.id,
      provider: request.provider
    }
  ];

  if (command) {
    actions.push({
      kind: "shell_command",
      command,
      args: githubCliArgs(kind, query),
      sourceRequestId: request.id,
      provider: request.provider
    });
  }

  actions.push(websearchAction(request, `${query} site:github.com`));
  return actions;
}

function buildWikipediaActions(request: ProviderExecutionRequest): ProviderExecutableAction[] {
  const query = stringInput(request, "query");
  const language = stringInput(request, "language") || "zh";
  const endpoint = stringInput(request, "endpoint");
  const userAgentEnv = stringInput(request, "userAgentEnv") || "WIKIMEDIA_USER_AGENT";
  const url = endpoint === "summary"
    ? `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    : `https://${language}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=10&namespace=0&format=json`;

  return [
    {
      kind: "api_request",
      method: "GET",
      url,
      headersEnv: {
        "User-Agent": userAgentEnv
      },
      sourceRequestId: request.id,
      provider: request.provider
    },
    websearchAction(request, `${query} site:wikipedia.org OR site:wikimedia.org`)
  ];
}

function buildYouTubeActions(request: ProviderExecutionRequest): ProviderExecutableAction[] {
  const query = stringInput(request, "query");
  const apiKeyEnv = stringInput(request, "apiKeyEnv") || "YOUTUBE_API_KEY";
  return [
    {
      kind: "api_request",
      method: "GET",
      url: `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&q=${encodeURIComponent(query)}`,
      queryEnv: {
        key: apiKeyEnv
      },
      sourceRequestId: request.id,
      provider: request.provider
    },
    websearchAction(request, `${query} site:youtube.com/watch`)
  ];
}

function buildPlatformActions(request: ProviderExecutionRequest): ProviderExecutableAction[] {
  const query = stringInput(request, "query");
  const toolName = stringInput(request, "toolName");
  const command = stringInput(request, "command");
  const site = PLATFORM_SITE[request.provider];
  const actions: ProviderExecutableAction[] = [];

  if (toolName) {
    actions.push({
      kind: "mcp_tool",
      toolName,
      args: {
        query,
        limit: numberInput(request, "limit") ?? 20
      },
      sourceRequestId: request.id,
      provider: request.provider
    });
  }

  if (command) {
    actions.push({
      kind: "shell_command",
      command,
      args: ["search", query, "--limit", String(numberInput(request, "limit") ?? 20)],
      sourceRequestId: request.id,
      provider: request.provider
    });
  }

  if (site) {
    actions.push(websearchAction(request, `${query} site:${site}`));
  }

  return actions;
}

function websearchAction(request: ProviderExecutionRequest, query: string): ProviderExecutableAction {
  return {
    kind: "agent_tool",
    tool: "websearch",
    args: {
      query,
      numResults: numberInput(request, "limit") ?? 10
    },
    sourceRequestId: request.id,
    provider: request.provider
  };
}

function webfetchAction(request: ProviderExecutionRequest, url: string): ProviderExecutableAction {
  return {
    kind: "agent_tool",
    tool: "webfetch",
    args: {
      url,
      format: "markdown"
    },
    sourceRequestId: request.id,
    provider: request.provider
  };
}

function githubCliArgs(kind: string, query: string): string[] {
  if (kind === "repository") return ["search", "repos", query, "--limit", "10"];
  if (kind === "pull_request") return ["search", "prs", query, "--limit", "10"];
  if (kind === "code") return ["search", "code", query, "--limit", "10"];
  return ["search", "issues", query, "--limit", "10"];
}

function stringInput(request: ProviderExecutionRequest, key: string) {
  const value = request.input[key];
  return typeof value === "string" ? value : "";
}

function numberInput(request: ProviderExecutionRequest, key: string) {
  const value = request.input[key];
  return typeof value === "number" ? value : undefined;
}

function arrayInput(request: ProviderExecutionRequest, key: string) {
  const value = request.input[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
