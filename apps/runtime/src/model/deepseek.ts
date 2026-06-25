import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";
import {
  buildChatMessages,
  normalizeUsage,
  parseJsonString,
  runJsonProviderRequest,
  type FetchLike
} from "./provider-helpers";

type DeepSeekProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
};

export class DeepSeekProvider implements ModelProvider {
  readonly name = "deepseek";

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly fetchImpl?: FetchLike;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "deepseek-chat";
    this.endpoint = options.endpoint ?? "https://api.deepseek.com/chat/completions";
    this.fetchImpl = options.fetchImpl;
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    return runJsonProviderRequest(input, {
      providerName: "deepseek",
      apiKeyEnv: "DEEPSEEK_API_KEY",
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
          throw new Error("DeepSeek response did not include a string message content.");
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
