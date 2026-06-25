import type { ModelProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { OpenAIProvider } from "./openai";

export function createProvider(providerName: "deepseek" | "openai" | "anthropic"): ModelProvider {
  switch (providerName) {
    case "deepseek":
      return new DeepSeekProvider();
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
  }
}
