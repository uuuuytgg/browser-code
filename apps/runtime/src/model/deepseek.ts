import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";

export class DeepSeekProvider implements ModelProvider {
  name = "deepseek";

  async generate(_input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    throw new Error("DeepSeekProvider is not implemented in Stage 1.");
  }
}
