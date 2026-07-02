import { defaultProviderConfig, type ProReaderProviderConfig } from "./provider-config";
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
      status: missing.length === 0 ? "ready" : "needs_configuration",
      requirements,
      configured,
      missing,
      notes: buildProviderNotes(provider)
    };
  });
}

function buildProviderNotes(provider: ProviderId) {
  if (provider === "llm_wiki_lite") {
    return ["Internal BrowserCode knowledge should use LLM Wiki Lite harness directly, not MCP."];
  }
  if (provider === "websearch" || provider === "webfetch") {
    return ["Use existing BrowserCode agent tool capability; ProReader should only plan and route."];
  }
  if (provider === "github") {
    return ["GitHub provider is fuzzy search first; direct GitHub URL capture stays in the existing URL pipeline."];
  }
  if (provider.endsWith("_mcp")) {
    return ["MCP tool names must come from config; do not hard-code third-party MCP tool names."];
  }
  return [];
}
