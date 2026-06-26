import type { ModelProvider, ProviderName } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { MockModelProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai";

type CreateProviderOptions = {
  mockOutputs?: unknown[];
  apiKey?: string;
  model?: string;
};

export function createProvider(
  providerName: ProviderName,
  options: CreateProviderOptions = {}
): ModelProvider {
  switch (providerName) {
    case "mock":
      return new MockModelProvider(
        options.mockOutputs ?? [
          {
            type: "final",
            answer: {
              message: "Mock provider default response."
            }
          }
        ]
      );
    case "deepseek":
      return new DeepSeekProvider({ apiKey: options.apiKey, model: options.model });
    case "openai":
      return new OpenAIProvider({ apiKey: options.apiKey, model: options.model });
    case "anthropic":
      return new AnthropicProvider({ apiKey: options.apiKey, model: options.model });
  }
}

export function createProviderFromEnv(options: CreateProviderOptions = {}) {
  const rawProviderName = process.env.SKA_MODEL_PROVIDER?.trim();
  const providerName = rawProviderName
    && (rawProviderName === "mock"
      || rawProviderName === "deepseek"
      || rawProviderName === "openai"
      || rawProviderName === "anthropic")
    ? rawProviderName
    : "mock";
  return createProvider(providerName, options);
}
