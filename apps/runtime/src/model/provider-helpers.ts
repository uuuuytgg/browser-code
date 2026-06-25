import type { ModelGenerateInput, ModelGenerateOutput } from "./provider";

export type FetchLike = typeof fetch;

export type ProviderHttpConfig = {
  providerName: "deepseek" | "openai" | "anthropic";
  apiKeyEnv: string;
  apiKey?: string;
  endpoint: string;
  model: string;
  fetchImpl?: FetchLike;
  buildBody(input: ModelGenerateInput, model: string): unknown;
  parseResponse(json: any): ModelGenerateOutput;
};

export async function runJsonProviderRequest(
  input: ModelGenerateInput,
  config: ProviderHttpConfig
): Promise<ModelGenerateOutput> {
  const apiKey = config.apiKey ?? process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${config.providerName} API key is missing. Expected ${config.apiKeyEnv}.`);
  }

  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(`Fetch is unavailable for provider ${config.providerName}.`);
  }

  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(config.buildBody(input, config.model))
  });

  if (!response.ok) {
    throw new Error(
      `${config.providerName} request failed with status ${response.status}`
    );
  }

  const json = await response.json();
  return config.parseResponse(json);
}

export function buildChatMessages(input: ModelGenerateInput) {
  return [
    { role: "system", content: input.system },
    ...input.messages
  ];
}

export function parseJsonString(raw: string) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Model output is not valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`
    );
  }
}

export function normalizeUsage(usage: any) {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const inputTokens =
    typeof usage.prompt_tokens === "number"
      ? usage.prompt_tokens
      : typeof usage.input_tokens === "number"
        ? usage.input_tokens
        : undefined;
  const outputTokens =
    typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : typeof usage.output_tokens === "number"
        ? usage.output_tokens
        : undefined;
  const totalTokens =
    typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens
  };
}
