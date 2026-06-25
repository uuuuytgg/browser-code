import { prohibitedToolNames } from "@ska/shared";

import { resolveMcpServerConfig } from "./config";
import { mcpResourceDefinitions, readMcpResource } from "./resources";
import { createMcpKnowledgeServer, McpKnowledgeServer } from "./server";
import { mcpToolDefinitions } from "./tools";
import { VaultClient } from "./vault-client";

export const mcpServerAppInfo = {
  name: "@ska/mcp-server",
  displayName: "Browser Code MCP Server",
  stage: 12,
  businessLogicImplemented: true,
  defaultAccess: "read-only",
  prohibitedToolNames
} as const;

export {
  McpKnowledgeServer,
  VaultClient,
  createMcpKnowledgeServer,
  mcpResourceDefinitions,
  mcpToolDefinitions,
  readMcpResource,
  resolveMcpServerConfig
};

if (process.argv[1]?.endsWith("index.ts")) {
  const config = resolveMcpServerConfig();
  console.log(
    `${mcpServerAppInfo.displayName} ready in ${config.allowWrite ? "restricted" : "read-only"} mode for ${config.vaultDir}.`
  );
}
