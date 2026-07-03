import { defaultProviderConfig, type ProReaderProviderConfig, type ProReaderProviderConfigInput } from "./provider-config";
import type { EnrichmentMcpToolConfig } from "./enrichment";
import type { ProviderId } from "./index";

export type ProviderRuntimeStatus = "ready" | "needs_configuration" | "disabled";

export type ProviderRuntimeDiagnostic = {
  provider: ProviderId;
  mode: string;
  status: ProviderRuntimeStatus;
  requirements: string[];
  configured: string[];
  missing: string[];
  notes: string[];
};

export type RuntimeEnvironment = {
  env?: Record<string, string | undefined>;
  availableCommands?: string[];
  configuredMcpTools?: Record<string, string | undefined>;
};

export type McpToolsConfig = Record<string, {
  enabled?: boolean;
  server?: string;
  source?: string;
  purpose?: string;
  transport?: string;
  url?: string;
  requiresEnv?: string[];
  readonlyTools?: string[];
  disabledWriteTools?: string[];
  notes?: string[];
  tools?: Record<string, string>;
}>;

export type McpToolsRuntimeBridge = {
  providerConfigInput: ProReaderProviderConfigInput;
  configuredMcpTools: Record<string, string>;
};

const MCP_PROVIDER_BRIDGE: Record<string, { provider: ProviderId; toolKey: string }> = {
  bilibiliSearch: { provider: "bilibili_mcp", toolKey: "search" },
  douyinMcp: { provider: "douyin_mcp", toolKey: "workSearch" },
  xiaohongshuMcp: { provider: "xiaohongshu_mcp", toolKey: "noteSearch" },
  tiktokMcp: { provider: "tiktok_mcp", toolKey: "videoSearch" }
};

export function buildMcpToolsRuntimeBridge(config: McpToolsConfig = {}): McpToolsRuntimeBridge {
  const providerConfigInput: ProReaderProviderConfigInput = { providers: {} };
  const configuredMcpTools: Record<string, string> = {};

  for (const [configKey, bridge] of Object.entries(MCP_PROVIDER_BRIDGE)) {
    const entry = config[configKey];
    const toolName = entry?.tools?.[bridge.toolKey];
    if (!entry?.enabled || !entry.server || !toolName) continue;

    providerConfigInput.providers![bridge.provider] = {
      mode: "mcp",
      toolName
    };
    configuredMcpTools[toolName] = `${entry.server}.${toolName}`;
  }

  return {
    providerConfigInput,
    configuredMcpTools
  };
}

export function buildEnrichmentMcpToolConfig(config: McpToolsConfig = {}): EnrichmentMcpToolConfig {
  const entry = config.bilibiliVideoInfo;
  if (!entry?.enabled) return {};

  return {
    bilibiliVideoInfo: {
      enabled: true,
      server: entry.server,
      tools: {
        getSubtitle: entry.tools?.getSubtitle,
        getDanmaku: entry.tools?.getDanmaku,
        getComments: entry.tools?.getComments
      }
    }
  };
}

export function diagnoseProviderRuntime(
  config: ProReaderProviderConfig = defaultProviderConfig,
  runtime: RuntimeEnvironment = {}
): ProviderRuntimeDiagnostic[] {
  return (Object.keys(config.providers) as ProviderId[]).map((provider) => {
    const entry = config.providers[provider];
    if (!entry.enabled) {
      return {
        provider,
        mode: entry.mode,
        status: "disabled",
        requirements: [],
        configured: [],
        missing: [],
        notes: ["Provider disabled; configured fallbacks should be used."]
      };
    }

    const requirements = [
      entry.tokenEnv,
      entry.apiKeyEnv,
      entry.userAgentEnv,
      entry.command ? `command:${entry.command}` : undefined,
      entry.toolName ? `mcpTool:${entry.toolName}` : undefined
    ].filter((item): item is string => Boolean(item));

    const configured: string[] = [];
    const missing: string[] = [];

    for (const envName of [entry.tokenEnv, entry.apiKeyEnv, entry.userAgentEnv]) {
      if (!envName) continue;
      if (runtime.env?.[envName]) configured.push(envName);
      else missing.push(envName);
    }

    if (entry.command) {
      if (runtime.availableCommands?.includes(entry.command)) configured.push(`command:${entry.command}`);
      else missing.push(`command:${entry.command}`);
    }

    if (entry.toolName) {
      if (runtime.configuredMcpTools?.[entry.toolName]) configured.push(`mcpTool:${entry.toolName}`);
      else missing.push(`mcpTool:${entry.toolName}`);
    }

    return {
      provider,
      mode: entry.mode,
      status: providerRuntimeStatus(provider, missing),
      requirements,
      configured,
      missing,
      notes: buildProviderNotes(provider)
    };
  });
}

function providerRuntimeStatus(provider: ProviderId, missing: string[]): ProviderRuntimeStatus {
  if (missing.length === 0) return "ready";
  if (provider === "github") return "ready";
  return "needs_configuration";
}

function buildProviderNotes(provider: ProviderId) {
  if (provider === "llm_wiki_lite") {
    return ["Internal BrowserCode knowledge should use LLM Wiki Lite harness directly, not MCP."];
  }
  if (provider === "websearch" || provider === "webfetch") {
    return ["Use existing BrowserCode agent tool capability; ProReader should only plan and route."];
  }
  if (provider === "github") {
    return [
      "GitHub public search API can run without a token; GITHUB_TOKEN and gh CLI improve rate limits and coverage.",
      "GitHub provider is fuzzy search first; direct GitHub URL capture stays in the existing URL pipeline."
    ];
  }
  if (provider.endsWith("_mcp")) {
    return ["MCP tool names must come from config; do not hard-code third-party MCP tool names."];
  }
  return [];
}
