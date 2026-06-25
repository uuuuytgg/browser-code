import type {
  AgentMode,
  ToolRisk,
  WebToMarkdownInput,
  WebToMarkdownOutput
} from "@ska/schemas";
import {
  WebToMarkdownInputSchema,
  WebToMarkdownOutputSchema
} from "@ska/schemas";

import { webToMarkdown } from "./web-to-markdown";

export const toolWebPackageInfo = {
  name: "@ska/tool-web",
  stage: 2,
  placeholderTools: [
    {
      name: "web_to_markdown",
      risk: "low" as ToolRisk,
      agent_modes: ["curator"] as AgentMode[],
      implemented: true
    }
  ]
} as const;

export const webToMarkdownToolSpec = {
  name: "web_to_markdown",
  description: "Convert captured HTML into Markdown without calling an LLM or downloading assets.",
  risk: "low" as ToolRisk,
  agent_modes: ["curator"] as AgentMode[],
  input_schema: WebToMarkdownInputSchema,
  output_schema: WebToMarkdownOutputSchema
} as const;

export async function runWebToMarkdown(input: WebToMarkdownInput): Promise<WebToMarkdownOutput> {
  const parsedInput = WebToMarkdownInputSchema.parse(input);
  const output = await webToMarkdown(parsedInput);
  return WebToMarkdownOutputSchema.parse(output);
}

export { webToMarkdown };
