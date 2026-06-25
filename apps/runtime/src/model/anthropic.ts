import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";

export class AnthropicProvider implements ModelProvider {
  name = "anthropic";

  async generate(_input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    throw new Error("AnthropicProvider is not implemented in Stage 1.");
  }
}
