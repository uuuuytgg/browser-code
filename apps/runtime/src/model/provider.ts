import type { ToolSpec } from "../tools/types";

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
  usage?: unknown;
};

export interface ModelProvider {
  name: string;
  generate(input: ModelGenerateInput): Promise<ModelGenerateOutput>;
}
