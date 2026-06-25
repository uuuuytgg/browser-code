import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";
import {
  buildChatMessages,
  normalizeUsage,
  parseJsonString,
  runJsonProviderRequest,
  type FetchLike
} from "./provider-helpers";

type OpenAIProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
};

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly fetchImpl?: FetchLike;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-4.1-mini";
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/chat/completions";
    this.fetchImpl = options.fetchImpl;
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    return runJsonProviderRequest(input, {
      providerName: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      model: this.model,
      fetchImpl: this.fetchImpl,
      buildBody(modelInput, model) {
        return {
          model,
          messages: buildChatMessages(modelInput),
          temperature: modelInput.temperature ?? 0.2,
          max_tokens: modelInput.max_tokens,
          response_format: modelInput.response_format === "json" ? { type: "json_object" } : undefined
        };
      },
      parseResponse(json) {
        const raw = json?.choices?.[0]?.message?.content;
        if (typeof raw !== "string") {
          throw new Error("OpenAI response did not include a string message content.");
        }

        return {
          raw,
          parsed: parseJsonString(raw),
          usage: normalizeUsage(json?.usage)
        };
      }
    });
  }
}
