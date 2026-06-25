import type { ToolCall, ToolResult } from "@ska/schemas";
import { ToolResultSchema } from "@ska/schemas";

import { ToolRegistry } from "./registry";
import type { ToolContext } from "./types";

export class ToolRouter {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(toolCall: ToolCall, context: ToolContext): Promise<ToolResult> {
    const tool = this.registry.getTool(toolCall.name);

    if (!tool) {
      return ToolResultSchema.parse({
        id: toolCall.id,
        name: toolCall.name,
        ok: false,
        error: {
          code: "UNKNOWN_TOOL",
          message: `Unknown tool: ${toolCall.name}`,
          recoverable: true
        }
      });
    }

    try {
      const output = await tool.execute(toolCall.input, context);
      const validatedOutput = tool.spec.output_schema.parse(output);

      return ToolResultSchema.parse({
        id: toolCall.id,
        name: toolCall.name,
        ok: true,
        output: validatedOutput
      });
    } catch (error) {
      return ToolResultSchema.parse({
        id: toolCall.id,
        name: toolCall.name,
        ok: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Tool execution failed",
          recoverable: true
        }
      });
    }
  }
}
