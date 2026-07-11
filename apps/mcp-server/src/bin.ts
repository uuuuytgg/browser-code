#!/usr/bin/env node
// MCP stdio entry point for the vault knowledge server.
// Usage: node dist/bin.js
// Reads vault dir from SKA_VAULT_DIR env (default ./vault).
// Exposes 5 read-only tools + 4 knowledge:// resources to any
// MCP-compatible agent (Claude Desktop, opencode fork, etc.).

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { createMcpKnowledgeServer, resolveMcpServerConfig } from "./index.js"

async function main() {
  const config = resolveMcpServerConfig()
  const knowledgeServer = createMcpKnowledgeServer(config)

  const server = new Server(
    {
      name: "browser-code-knowledge",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  )

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = knowledgeServer.listTools()
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      })),
    }
  })

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const result = await knowledgeServer.callTool(name, args ?? {})
      return {
        content: [
          {
            type: "text" as const,
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${error.message}` }],
        isError: true,
      }
    }
  })

  // List resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = knowledgeServer.listResources()
    return {
      resources: resources.map((r) => ({
        uri: r.uriTemplate,
        name: r.uriTemplate,
        description: r.description,
        mimeType: "text/markdown" as const,
      })),
    }
  })

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const result = await knowledgeServer.readResource(request.params.uri)
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "text/markdown",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error: any) {
      throw new Error(`Resource read failed: ${error.message}`)
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log to stderr so stdio isn't corrupted for the MCP protocol
  console.error(`MCP knowledge server started (vault: ${config.vaultDir}, read-only)`)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
