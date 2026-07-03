import { describe, expect, it } from "vitest";

import {
  buildEnrichmentMcpToolConfig,
  buildMcpToolsRuntimeBridge,
  diagnoseProviderRuntime,
  resolveProviderConfig
} from "./index";

describe("MCP tools runtime bridge", () => {
  it("turns enabled platform MCP config into provider tool names and runtime mappings", () => {
    const bridge = buildMcpToolsRuntimeBridge({
      bilibiliSearch: {
        enabled: true,
        server: "bilibili-mcp",
        source: "github:adoresever/bilibili-mcp",
        readonlyTools: ["bili_search"],
        disabledWriteTools: ["bili_reply"],
        tools: {
          search: "bili_search"
        }
      },
      douyinMcp: {
        enabled: true,
        server: "douyin",
        tools: {
          workSearch: "work_search"
        }
      },
      xiaohongshuMcp: {
        enabled: true,
        server: "socialdatax-xhs",
        source: "github:devinchen2014/xiaohongshu-xhs-rednote-mcp",
        transport: "streamable-http",
        url: "https://mcp.52choujiang.com/xhs/mcp",
        requiresEnv: ["SOCIALDATAX_API_KEY"],
        tools: {
          noteSearch: "xhs_search_notes"
        }
      },
      tiktokMcp: {
        enabled: true,
        server: "tiktok",
        tools: {
          videoSearch: "video_search"
        }
      }
    });
    const config = resolveProviderConfig(bridge.providerConfigInput);
    const diagnostics = diagnoseProviderRuntime(config, {
      configuredMcpTools: bridge.configuredMcpTools
    });

    expect(config.providers.bilibili_mcp).toMatchObject({
      mode: "mcp",
      toolName: "bili_search"
    });
    expect(config.providers.douyin_mcp).toMatchObject({
      mode: "mcp",
      toolName: "work_search"
    });
    expect(config.providers.xiaohongshu_mcp).toMatchObject({
      mode: "mcp",
      toolName: "xhs_search_notes"
    });
    expect(config.providers.tiktok_mcp).toMatchObject({
      mode: "mcp",
      toolName: "video_search"
    });
    expect(bridge.configuredMcpTools).toEqual({
      bili_search: "bilibili-mcp.bili_search",
      work_search: "douyin.work_search",
      xhs_search_notes: "socialdatax-xhs.xhs_search_notes",
      video_search: "tiktok.video_search"
    });
    expect(diagnostics.find((item) => item.provider === "bilibili_mcp")).toMatchObject({
      status: "ready",
      configured: ["mcpTool:bili_search"]
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

  it("maps enabled Bilibili video info MCP config into approved enrichment tools", () => {
    const config = buildEnrichmentMcpToolConfig({
      bilibiliVideoInfo: {
        enabled: true,
        server: "bilibili-video-info",
        requiresEnv: ["SESSDATA"],
        tools: {
          getSubtitle: "get_subtitles",
          getDanmaku: "get_danmaku",
          getComments: "get_comments"
        }
      }
    });

    expect(config).toEqual({
      bilibiliVideoInfo: {
        enabled: true,
        server: "bilibili-video-info",
        tools: {
          getSubtitle: "get_subtitles",
          getDanmaku: "get_danmaku",
          getComments: "get_comments"
        }
      }
    });
  });

  it("keeps disabled Bilibili video info MCP out of approved enrichment config", () => {
    expect(buildEnrichmentMcpToolConfig({
      bilibiliVideoInfo: {
        enabled: false,
        server: "bilibili-video-info",
        tools: {
          getSubtitle: "get_subtitles"
        }
      }
    })).toEqual({});
  });
});
