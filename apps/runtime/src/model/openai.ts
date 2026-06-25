import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";

export class OpenAIProvider implements ModelProvider {
  name = "openai";

  async generate(_input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    throw new Error("OpenAIProvider is not implemented in Stage 1.");
  }
}
