import type { ProviderStep } from "./index";
import type { ProviderConfigEntry } from "./provider-config";

export type OfficialDocsSearchQuery = {
  query: string;
  templates: string[];
  preferredDomains: string[];
  providerMode: string;
  fallbackProviders: string[];
};

const DEFAULT_DOC_DOMAINS = [
  "docs.github.com",
  "developers.google.com",
  "docs.anthropic.com",
  "platform.openai.com",
  "docs.npmjs.com",
  "nodejs.org/api"
];

export function planOfficialDocsSearchSteps(
  query: string,
  config: ProviderConfigEntry
): ProviderStep[] {
  const templates = [
    `${query} official docs`,
    `${query} documentation`,
    `${query} API reference`,
    ...DEFAULT_DOC_DOMAINS.map((domain) => `${query} site:${domain}`)
  ];

  return [
    {
      id: "official-docs-search",
      provider: "official_docs",
      action: "search",
      input: {
        query,
        templates,
        preferredDomains: DEFAULT_DOC_DOMAINS,
        providerMode: config.mode,
        fallbackProviders: config.fallbackProviders ?? []
      } satisfies OfficialDocsSearchQuery,
      requiresApproval: false
    }
  ];
}
