import type { ProviderId } from "./index";

export type ProviderMode =
  | "builtin"
  | "lite_wiki_harness"
  | "api"
  | "cli"
  | "mcp"
  | "mcp_or_cli"
  | "websearch_fallback";

export type ProviderConfigEntry = {
  enabled: boolean;
  mode: ProviderMode;
  tokenEnv?: string;
  apiKeyEnv?: string;
  userAgentEnv?: string;
  command?: string;
  toolName?: string;
  fallbackProviders?: ProviderId[];
};

export type ProReaderProviderConfig = {
  providers: Record<ProviderId, ProviderConfigEntry>;
};

export type ProReaderProviderConfigInput = {
  providers?: Partial<Record<ProviderId, Partial<ProviderConfigEntry>>>;
};

export const defaultProviderConfig: ProReaderProviderConfig = {
  providers: {
    llm_wiki_lite: {
      enabled: true,
      mode: "lite_wiki_harness"
    },
    websearch: {
      enabled: true,
      mode: "builtin"
    },
    webfetch: {
      enabled: true,
      mode: "builtin"
    },
    github: {
      enabled: true,
      mode: "api",
      tokenEnv: "GITHUB_TOKEN",
      command: "gh",
      fallbackProviders: ["websearch"]
    },
    wikipedia: {
      enabled: true,
      mode: "api",
      userAgentEnv: "WIKIMEDIA_USER_AGENT",
      fallbackProviders: ["websearch"]
    },
    official_docs: {
      enabled: true,
      mode: "websearch_fallback",
      fallbackProviders: ["websearch", "webfetch"]
    },
    youtube_data_api: {
      enabled: true,
      mode: "api",
      apiKeyEnv: "YOUTUBE_API_KEY",
      fallbackProviders: ["websearch"]
    },
    bilibili_mcp: {
      enabled: true,
      mode: "mcp",
      fallbackProviders: ["websearch"]
    },
    douyin_mcp: {
      enabled: true,
      mode: "mcp_or_cli",
      fallbackProviders: ["websearch"]
    },
    xiaohongshu_mcp: {
      enabled: true,
      mode: "mcp_or_cli",
      fallbackProviders: ["websearch"]
    },
    tiktok_mcp: {
      enabled: true,
      mode: "mcp_or_cli",
      fallbackProviders: ["websearch"]
    },
    site_search: {
      enabled: true,
      mode: "websearch_fallback",
      fallbackProviders: ["websearch"]
    }
  }
};

export function resolveProviderConfig(input: ProReaderProviderConfigInput = {}): ProReaderProviderConfig {
  const providers = { ...defaultProviderConfig.providers };

  for (const provider of Object.keys(input.providers ?? {}) as ProviderId[]) {
    providers[provider] = {
      ...providers[provider],
      ...input.providers?.[provider]
    };
  }

  return { providers };
}

export function getProviderConfig(
  config: ProReaderProviderConfig | undefined,
  provider: ProviderId
): ProviderConfigEntry {
  return (config ?? defaultProviderConfig).providers[provider];
}
