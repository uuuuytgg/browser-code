import { describe, expect, it } from "vitest";

import {
  buildMcpToolsRuntimeBridge,
  diagnoseProviderRuntime,
  resolveProviderConfig
} from "./index";

describe("MCP tools runtime bridge", () => {
  it("turns enabled platform MCP config into provider tool names and runtime mappings", () => {
    const bridge = buildMcpToolsRuntimeBridge({
      bilibiliSearch: {
        enabled: true,
        server: "bilibili-search",
        tools: {
          search: "general_search"
        }
      },
      douyinMcp: {
        enabled: true,
        server: "douyin",
        tools: {
          workSearch: "work_search"
        }
      }
    });
    const config = resolveProviderConfig(bridge.providerConfigInput);
    const diagnostics = diagnoseProviderRuntime(config, {
      configuredMcpTools: bridge.configuredMcpTools
    });

    expect(config.providers.bilibili_mcp).toMatchObject({
      mode: "mcp",
      toolName: "general_search"
    });
    expect(config.providers.douyin_mcp).toMatchObject({
      mode: "mcp",
      toolName: "work_search"
    });
    expect(bridge.configuredMcpTools).toEqual({
      general_search: "bilibili-search.general_search",
      work_search: "douyin.work_search"
    });
    expect(diagnostics.find((item) => item.provider === "bilibili_mcp")).toMatchObject({
      status: "ready",
      configured: ["mcpTool:general_search"]
    });
  });

  it("does not mark disabled MCP entries as configured", () => {
    const bridge = buildMcpToolsRuntimeBridge({
      bilibiliSearch: {
        enabled: false,
        server: "bilibili-search",
        tools: {
          search: "general_search"
        }
      }
    });

    expect(bridge.providerConfigInput.providers).toEqual({});
    expect(bridge.configuredMcpTools).toEqual({});
  });
});
