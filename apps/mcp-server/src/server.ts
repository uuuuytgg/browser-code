import type { McpServerConfig } from "./config";
import { readMcpResource, mcpResourceDefinitions } from "./resources";
import { callReadOnlyTool, mcpToolDefinitions, readOnlyToolNames, type ReadOnlyToolName } from "./tools";
import { VaultClient } from "./vault-client";

export class McpKnowledgeServer {
  readonly client: VaultClient;

  constructor(readonly config: McpServerConfig) {
    this.client = new VaultClient(config.vaultDir);
  }

  getServerInfo() {
    return {
      name: "@ska/mcp-server",
      transport: "in-process",
      access: this.config.allowWrite ? "read-write-disabled-by-implementation" : "read-only"
    } as const;
  }

  listTools() {
    return mcpToolDefinitions;
  }

  listResources() {
    return mcpResourceDefinitions;
  }

  async callTool(name: string, input: unknown) {
    if (!readOnlyToolNames.includes(name as ReadOnlyToolName)) {
      throw new Error(`TOOL_NOT_ALLOWED: ${name}`);
    }

    return callReadOnlyTool(this.client, name as ReadOnlyToolName, input);
  }

  async readResource(uri: string) {
    return readMcpResource(this.client, uri);
  }
}

export function createMcpKnowledgeServer(config: McpServerConfig) {
  return new McpKnowledgeServer(config);
}
