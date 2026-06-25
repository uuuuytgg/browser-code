import { prohibitedToolNames, stage0Scope } from "@ska/shared";

export const mcpServerAppInfo = {
  name: "@ska/mcp-server",
  displayName: "Sidebar Knowledge Agent MCP Server",
  stage: stage0Scope.stage,
  businessLogicImplemented: stage0Scope.businessLogicImplemented,
  defaultAccess: "read-only",
  prohibitedToolNames
} as const;
