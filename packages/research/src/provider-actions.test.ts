import { describe, expect, it } from "vitest";

import {
  buildProviderExecutableActions,
  buildProviderExecutionRequests,
  diagnoseProviderActionReadiness,
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

  it("keeps the active video and social fuzzy provider surface executable", () => {
    const config = resolveProviderConfig({
      providers: {
        bilibili_mcp: { toolName: "bilibili_search" },
        douyin_mcp: { toolName: "douyin_search", command: "douyin-cli" },
        xiaohongshu_mcp: { toolName: "xhs_search" }
      }
    });
    const { plan } = planProReader({ query: "找 YouTube B站 抖音 小红书 TikTok AI Agent 视频" }, config);
    const actions = buildProviderExecutableActions(buildProviderExecutionRequests(plan)).actions;

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "api_request", provider: "youtube_data_api" }),
        expect.objectContaining({ kind: "api_request", provider: "bilibili_mcp" }),
        expect.objectContaining({ kind: "api_request", provider: "douyin_mcp" }),
        expect.objectContaining({ kind: "api_request", provider: "xiaohongshu_mcp", method: "POST" }),
        expect.objectContaining({ kind: "agent_tool", provider: "youtube_data_api", tool: "websearch" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "bilibili_mcp", toolName: "bilibili_search" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "douyin_mcp", toolName: "douyin_search" }),
        expect.objectContaining({ kind: "shell_command", provider: "douyin_mcp", command: "douyin-cli" }),
        expect.objectContaining({ kind: "mcp_tool", provider: "xiaohongshu_mcp", toolName: "xhs_search" })
      ])
    );
    expect(actions.filter((action) => action.kind === "agent_tool").map((action) => JSON.stringify(action))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("site:youtube.com/watch"),
        expect.stringContaining("site:bilibili.com/video"),
        expect.stringContaining("site:douyin.com"),
        expect.stringContaining("site:xiaohongshu.com")
      ])
    );
    expect(actions.some((action) => action.provider === "tiktok_mcp")).toBe(false);
  });

  it("diagnoses action-level readiness without disabling agent-owned fallbacks", () => {
    const config = resolveProviderConfig({
      providers: {
        github: { tokenEnv: "GITHUB_TOKEN", command: "gh" },
        bilibili_mcp: { toolName: "bilibili_search" },
        douyin_mcp: { toolName: "douyin_search", command: "douyin-cli" }
      }
    });
    const githubPlan = planProReader({ query: "GitHub AI Agent issue" }, config).plan;
    const platformPlan = planProReader({ query: "B站 抖音 AI Agent 视频" }, config).plan;
    const actions = [
      ...buildProviderExecutableActions(buildProviderExecutionRequests(githubPlan)).actions,
      ...buildProviderExecutableActions(buildProviderExecutionRequests(platformPlan)).actions
    ];
    const readiness = diagnoseProviderActionReadiness(actions, {
      env: {},
      availableCommands: ["douyin-cli"],
      configuredMcpTools: {
        douyin_search: "douyin.work_search"
      }
    });

    expect(readiness.find((item) => item.provider === "llm_wiki_lite")).toMatchObject({
      status: "ready",
      missing: []
    });
    expect(readiness.find((item) => item.provider === "github" && item.kind === "api_request")).toMatchObject({
      status: "ready",
      missing: []
    });
    expect(readiness.find((item) => item.provider === "github" && item.kind === "agent_tool")).toMatchObject({
      status: "ready",
      missing: []
    });
    expect(readiness.find((item) => item.provider === "bilibili_mcp" && item.kind === "mcp_tool")).toMatchObject({
      status: "needs_configuration",
      missing: ["mcpTool:bilibili_search"]
    });
    expect(readiness.find((item) => item.provider === "douyin_mcp" && item.kind === "mcp_tool")).toMatchObject({
      status: "ready",
      configured: ["mcpTool:douyin_search"]
    });
    expect(readiness.find((item) => item.provider === "douyin_mcp" && item.kind === "shell_command")).toMatchObject({
      status: "ready",
      configured: ["command:douyin-cli"]
    });
  });

  it("diagnoses cookie-gated social platform APIs while leaving Bilibili public search runnable", () => {
    const { plan } = planProReader({ query: "Bilibili 抖音 小红书 TikTok AI Agent 视频" });
    const actions = buildProviderExecutableActions(buildProviderExecutionRequests(plan)).actions;
    const readiness = diagnoseProviderActionReadiness(actions, {
      env: {
        BROWSER_CODE_PLATFORM_USER_AGENT: "BrowserCode/0.1"
      }
    });

    expect(actions.find((action) => action.provider === "bilibili_mcp" && action.kind === "api_request")).toMatchObject({
      kind: "api_request",
      method: "GET",
      url: expect.stringContaining("api.bilibili.com/x/web-interface/search/type")
    });
    expect(actions.find((action) => action.provider === "xiaohongshu_mcp" && action.kind === "api_request")).toMatchObject({
      kind: "api_request",
      method: "POST",
      body: expect.objectContaining({
        keyword: "Bilibili 抖音 小红书 TikTok AI Agent 视频"
      })
    });
    expect(readiness.find((item) => item.provider === "bilibili_mcp" && item.kind === "api_request")).toMatchObject({
      status: "ready",
      missing: []
    });
    expect(readiness.find((item) => item.provider === "douyin_mcp" && item.kind === "api_request")).toMatchObject({
      status: "needs_configuration",
      missing: ["DOUYIN_COOKIE"]
    });
    expect(readiness.find((item) => item.provider === "xiaohongshu_mcp" && item.kind === "api_request")).toMatchObject({
      status: "needs_configuration",
      missing: ["XIAOHONGSHU_COOKIE"]
    });
  });

  it("keeps GitHub public API search ready without a token", () => {
    const { plan } = planProReader({ query: "GitHub opencode issue" });
    const actions = buildProviderExecutableActions(buildProviderExecutionRequests(plan)).actions;
    const githubApi = actions.find((action) => action.provider === "github" && action.kind === "api_request");
    const readiness = diagnoseProviderActionReadiness(actions, { env: {}, availableCommands: [] });

    expect(githubApi).toMatchObject({
      kind: "api_request",
      provider: "github",
      headersEnv: {
        Accept: "application/vnd.github+json"
      },
      optionalHeadersEnv: {
        Authorization: "GITHUB_TOKEN"
      }
    });
    expect(readiness.find((item) => item.provider === "github" && item.kind === "api_request")).toMatchObject({
      status: "ready",
      missing: []
    });
  });
});
