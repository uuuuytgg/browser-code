import type { ToolSpec } from "../tools/types";

export const providerNames = ["mock", "deepseek", "openai", "anthropic"] as const;
export type ProviderName = (typeof providerNames)[number];

export type ModelMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

export type ModelGenerateInput = {
  system: string;
  messages: ModelMessage[];
  tools?: ToolSpec[];
  response_format?: "json";
  temperature?: number;
  max_tokens?: number;
};

export type ModelGenerateOutput = {
  raw: string;
  parsed: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export interface ModelProvider {
  name: ProviderName;
  generate(input: ModelGenerateInput): Promise<ModelGenerateOutput>;
}
