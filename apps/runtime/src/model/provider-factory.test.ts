import { describe, expect, it, vi } from "vitest";

import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { MockModelProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai";
import { createProvider, createProviderFromEnv } from "./provider-factory";

describe("provider factory", () => {
  it("creates the expected provider classes", () => {
    expect(createProvider("mock")).toBeInstanceOf(MockModelProvider);
    expect(createProvider("deepseek")).toBeInstanceOf(DeepSeekProvider);
    expect(createProvider("openai")).toBeInstanceOf(OpenAIProvider);
    expect(createProvider("anthropic")).toBeInstanceOf(AnthropicProvider);
  });

  it("defaults to mock from the environment helper", () => {
    vi.stubEnv("SKA_MODEL_PROVIDER", "");
    expect(createProviderFromEnv()).toBeInstanceOf(MockModelProvider);
    vi.unstubAllEnvs();
  });
});
