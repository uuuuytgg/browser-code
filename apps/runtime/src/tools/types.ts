import type { AgentMode, ToolResult } from "@ska/schemas";
import type { ZodType } from "zod";

export type ToolSpec = {
  name: string;
  description: string;
  risk: "low" | "medium" | "high" | "critical";
  agent_modes: AgentMode[];
  requires_confirmation?: boolean;
  input_schema: ZodType;
  output_schema: ZodType;
};

export type ToolLogger = {
  info(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
};

export type ToolContext = {
  task_id: string;
  session_id: string;
  vault_dir: string;
  temp_dir: string;
  allowed_read_roots: string[];
  allowed_write_roots: string[];
  logger: ToolLogger;
};

export type ToolImplementation = {
  spec: ToolSpec;
  execute(input: unknown, context: ToolContext): Promise<unknown>;
};

export type ToolExecutionResult = ToolResult;
