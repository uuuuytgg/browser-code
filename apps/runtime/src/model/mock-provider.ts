import type { ModelGenerateInput, ModelGenerateOutput, ModelProvider } from "./provider";

export class MockModelProvider implements ModelProvider {
  name = "mock";

  private readonly outputs: unknown[];

  private index = 0;

  constructor(outputs: unknown[]) {
    this.outputs = outputs;
  }

  async generate(_input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    const next = this.outputs[this.index];
    this.index += 1;

    if (next === undefined) {
      throw new Error("MockModelProvider exhausted outputs");
    }

    return {
      raw: JSON.stringify(next),
      parsed: next
    };
  }
}
