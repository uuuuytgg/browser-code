import { describe, expect, it } from "vitest";

import {
  buildProviderExecutableActions,
  buildProviderExecutionRequests,
  planProReader,
  resolveProviderConfig
} from "./index";

function actionsFor(query: string) {
  const { plan } = planProReader({ query });
  return buildProviderExecutableActions(buildProviderExecutionRequests(plan)).actions;
}

describe("buildProviderExecutableActions", () => {
  it("turns answer providers into existing BrowserCode tool, harness, and API actions", () => {
    const actions = actionsFor("MCP definition official docs GitHub implementation");

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "harness_command", provider: "llm_wiki_lite" }),
        expect.objectContaining({ kind: "api_request", provider: "github" }),
        expect.objectContaining({ kind: "shell_command", provider: "github", command: "gh" }),
        expect.objectContaining({ kind: "agent_tool", provider: "github", tool: "websearch" }),
        expect.objectContaining({ kind: "agent_tool", provider: "official_docs", tool: "websearch" })
      ])
    );
  });

  it("turns Wikipedia provider into API and site-search fallback actions", () => {
    const actions = actionsFor("MCP 是什么 历史 背景 概念");

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "api_request", provider: "wikipedia" }),
        expect.objectContaining({
          kind: "agent_tool",
          provider: "wikipedia",
          tool: "websearch"
        })
      ])
    );
  });

  it("keeps the full video and social fuzzy provider surface executable", () => {
    const config = resolveProviderConfig({
      providers: {
        bilibili_mcp: { toolName: "bilibili_search" },
        douyin_mcp: { toolName: "douyin_search", command: "douyin-cli" },
        xiaohongshu_mcp: { toolName: "xhs_search" },
        tiktok_mcp: { toolName: "tiktok_search" }
      }
    });
    const { plan } = planProReader({ query: "找 YouTube B站 抖音 小红书 TikTok AI Agent 视频" }, config);
    const actions = buildProviderExecutableActions(buildProviderExecutionRequests(plan)).actions;

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "api_request", provider: "youtube_data_api" }),
        expect.objectContaining({ kind: "agent_tool", provider: "youtube_data_api", tool: "websearch" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "bilibili_mcp", toolName: "bilibili_search" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "douyin_mcp", toolName: "douyin_search" }),
        expect.objectContaining({ kind: "shell_command", provider: "douyin_mcp", command: "douyin-cli" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "xiaohongshu_mcp", toolName: "xhs_search" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "tiktok_mcp", toolName: "tiktok_search" })
      ])
    );
    expect(actions.filter((action) => action.kind === "agent_tool").map((action) => JSON.stringify(action))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("site:youtube.com/watch"),
        expect.stringContaining("site:bilibili.com/video"),
        expect.stringContaining("site:douyin.com"),
        expect.stringContaining("site:xiaohongshu.com"),
        expect.stringContaining("site:tiktok.com")
      ])
    );
  });
});
