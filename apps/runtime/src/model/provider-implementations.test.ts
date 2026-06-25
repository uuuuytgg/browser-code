import { describe, expect, it } from "vitest";

import type { ModelGenerateInput } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { OpenAIProvider } from "./openai";

const input: ModelGenerateInput = {
  system: "Return JSON only.",
  messages: [
    {
      role: "user",
      content: "{\"task\":\"demo\"}"
    }
  ],
  response_format: "json",
  temperature: 0.2
};

describe("provider implementations", () => {
  it("parses a DeepSeek-style JSON response", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "{\"type\":\"final\",\"answer\":{\"message\":\"ok\"}}"
                }
              }
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            }
          }),
          { status: 200 }
        )
    });

    const result = await provider.generate(input);
    expect(result.parsed).toMatchObject({
      type: "final"
    });
    expect(result.usage?.total_tokens).toBe(15);
  });

  it("parses an OpenAI-style JSON response", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "{\"type\":\"tool_call\",\"tool_call\":{\"id\":\"1\",\"name\":\"x\",\"input\":{}}}"
                }
              }
            ]
          }),
          { status: 200 }
        )
    });

    const result = await provider.generate(input);
    expect(result.parsed).toMatchObject({
      type: "tool_call"
    });
  });

  it("parses an Anthropic-style JSON response", async () => {
    const provider = new AnthropicProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: "{\"type\":\"final\",\"answer\":{\"message\":\"ok\"}}"
              }
            ],
            usage: {
              input_tokens: 12,
              output_tokens: 4
            }
          }),
          { status: 200 }
        )
    });

    const result = await provider.generate(input);
    expect(result.parsed).toMatchObject({
      type: "final"
    });
    expect(result.usage?.input_tokens).toBe(12);
  });

  it("fails clearly when the provider returns non-JSON text", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "not json"
                }
              }
            ]
          }),
          { status: 200 }
        )
    });

    await expect(provider.generate(input)).rejects.toThrow("Model output is not valid JSON");
  });
});
