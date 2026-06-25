import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";
import {
  normalizeUsage,
  parseJsonString,
  runJsonProviderRequest,
  type FetchLike
} from "./provider-helpers";

type AnthropicProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
};

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly fetchImpl?: FetchLike;

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-3-5-sonnet-latest";
    this.endpoint = options.endpoint ?? "https://api.anthropic.com/v1/messages";
    this.fetchImpl = options.fetchImpl;
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    return runJsonProviderRequest(input, {
      providerName: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      model: this.model,
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-api-key", this.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "");
        headers.set("anthropic-version", "2023-06-01");
        headers.delete("authorization");

        return (this.fetchImpl ?? globalThis.fetch)(url, {
          ...init,
          headers
        });
      },
      buildBody(modelInput, model) {
        return {
          model,
          system: modelInput.system,
          messages: modelInput.messages.map((message) => ({
            role: message.role,
            content: message.content
          })),
          temperature: modelInput.temperature ?? 0.2,
          max_tokens: modelInput.max_tokens ?? 1024
        };
      },
      parseResponse(json) {
        const firstBlock = json?.content?.[0];
        const raw = typeof firstBlock?.text === "string" ? firstBlock.text : undefined;
        if (!raw) {
          throw new Error("Anthropic response did not include a text content block.");
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
