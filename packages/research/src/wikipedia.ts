import type { ProviderStep } from "./index";
import type { ProviderConfigEntry } from "./provider-config";

export type WikipediaSearchQuery = {
  query: string;
  language: string;
  fallbackLanguage?: string;
  endpoint: "opensearch" | "summary";
  userAgentEnv?: string;
};

export function planWikipediaSearchSteps(
  query: string,
  config: ProviderConfigEntry
): ProviderStep[] {
  return [
    {
      id: "wikipedia-opensearch-zh",
      provider: "wikipedia",
      action: "search",
      input: {
        query,
        language: "zh",
        fallbackLanguage: "en",
        endpoint: "opensearch",
        providerMode: config.mode,
        userAgentEnv: config.userAgentEnv
      } satisfies WikipediaSearchQuery & Record<string, unknown>,
      requiresApproval: false
    },
    {
      id: "wikipedia-summary-fetch",
      provider: "wikipedia",
      action: "fetch",
      input: {
        query,
        language: "zh",
        fallbackLanguage: "en",
        endpoint: "summary",
        selectedFrom: "wikipedia-opensearch-zh",
        providerMode: config.mode,
        userAgentEnv: config.userAgentEnv
      },
      requiresApproval: false
    }
  ];
}
