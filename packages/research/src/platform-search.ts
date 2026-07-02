import type { ProviderStep } from "./index";
import type { ProviderConfigEntry } from "./provider-config";

export type PlatformSearchProvider =
  | "bilibili_mcp"
  | "douyin_mcp"
  | "xiaohongshu_mcp"
  | "tiktok_mcp";

export type PlatformSearchQuery = {
  query: string;
  limit: number;
  providerMode: string;
  endpoint?: string;
  method?: "GET" | "POST";
  headersEnv?: Record<string, string>;
  optionalHeadersEnv?: Record<string, string>;
  bodyTemplate?: Record<string, unknown>;
  toolName?: string | null;
  command?: string;
  fallbackProviders: string[];
};

export function planPlatformSearchSteps(
  provider: PlatformSearchProvider,
  query: string,
  config: ProviderConfigEntry
): ProviderStep[] {
  return [
    {
      id: `${provider}-search`,
      provider,
      action: "search",
      input: {
        query,
        limit: 20,
        providerMode: config.mode,
        ...platformEndpoint(provider, query),
        toolName: config.toolName ?? null,
        command: config.command,
        apiKeyEnv: config.apiKeyEnv,
        tokenEnv: config.tokenEnv,
        userAgentEnv: config.userAgentEnv,
        fallbackProviders: config.fallbackProviders ?? ["websearch"]
      } satisfies PlatformSearchQuery & Record<string, unknown>,
      requiresApproval: false
    }
  ];
}

function platformEndpoint(provider: PlatformSearchProvider, query: string): Partial<PlatformSearchQuery> {
  switch (provider) {
    case "bilibili_mcp":
      return {
        endpoint: `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&page=1`,
        method: "GET",
        optionalHeadersEnv: {
          Cookie: "BILIBILI_COOKIE",
          "User-Agent": "BROWSER_CODE_PLATFORM_USER_AGENT"
        }
      };
    case "douyin_mcp":
      return {
        endpoint: `https://www.douyin.com/aweme/v1/web/general/search/single/?keyword=${encodeURIComponent(query)}&search_channel=aweme_general&type=general&aid=6383`,
        method: "GET",
        headersEnv: {
          Cookie: "DOUYIN_COOKIE",
          "User-Agent": "BROWSER_CODE_PLATFORM_USER_AGENT"
        }
      };
    case "xiaohongshu_mcp":
      return {
        endpoint: "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes",
        method: "POST",
        headersEnv: {
          Cookie: "XIAOHONGSHU_COOKIE",
          "User-Agent": "BROWSER_CODE_PLATFORM_USER_AGENT"
        },
        bodyTemplate: {
          keyword: query,
          page: 1,
          page_size: 20,
          search_id: "",
          sort: "general",
          note_type: 0
        }
      };
    case "tiktok_mcp":
      return {
        endpoint: `https://www.tiktok.com/api/search/general/full/?keyword=${encodeURIComponent(query)}&aid=1988`,
        method: "GET",
        headersEnv: {
          Cookie: "TIKTOK_COOKIE",
          "User-Agent": "BROWSER_CODE_PLATFORM_USER_AGENT"
        }
      };
  }
}
