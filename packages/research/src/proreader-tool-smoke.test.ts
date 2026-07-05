import { describe, expect, it } from "vitest";

import proreaderTool from "../../../.browser-code/tool/proreader";

describe("BrowserCode ProReader tool boundary", () => {
  it("returns route, plan, requests, and readiness for fuzzy queries without write side effects", async () => {
    const output = await proreaderTool.execute({
      query: "找 YouTube B站 抖音 小红书 AI Agent 深度视频",
      intent: "platform_discovery",
      researchDepth: "deep",
      providerBias: ["youtube_data_api", "bilibili_mcp", "douyin_mcp", "xiaohongshu_mcp", "site_search", "websearch"],
      needsCandidateReview: true,
      saveMode: "candidate_selection",
      availableCommands: ["gh", "bun"],
    } as never, undefined as never);
    const result = JSON.parse(output as string);

    expect(result.dispatch).toMatchObject({ kind: "proreader" });
    expect(result.route).toMatchObject({
      intent: "video_platform_discovery",
      mode: "discovery_ingest",
      requiresHumanReview: true,
      requiresVaultWrite: false,
    });
    expect(result.route.providers).toEqual(
      expect.arrayContaining(["youtube_data_api", "bilibili_mcp", "douyin_mcp", "xiaohongshu_mcp"]),
    );
    expect(result.route.providers).not.toContain("tiktok_mcp");
    expect(result.plan.steps.every((step: { action: string }) => step.action === "search")).toBe(true);
    expect(result.executionRequests.length).toBeGreaterThan(0);
    expect(result.actionReadiness.length).toBeGreaterThan(0);
    expect(result.dynamicToolExposure).toMatchObject({
      phase: "post_route_deferred_tools",
    });
    expect(result.dynamicToolExposure.policy).toEqual(
      expect.arrayContaining([
        "This is a dynamic execution surface, not a rewritten intent decision.",
      ]),
    );
    expect(result.dynamicToolExposure.providerRegistry.map((item: { provider: string }) => item.provider)).toEqual(
      expect.arrayContaining(["llm_wiki_lite", "websearch", "github", "wikipedia", "bilibili_mcp"]),
    );
    expect(result.dynamicToolExposure.allowedExecutionBackendSkills).toEqual(
      expect.arrayContaining(["multi-search-engine"]),
    );
    expect(JSON.stringify(result)).not.toContain("vault/articles");
    expect(JSON.stringify(result)).not.toContain("kb/claims");
    expect(JSON.stringify(result)).not.toContain("browsercode.sqlite");
  });

  it("short-circuits explicit URLs to the existing URL pipeline", async () => {
    const output = await proreaderTool.execute({
      query: "https://www.xiaohongshu.com/explore/65f000000000000000000000",
    } as never, undefined as never);
    const result = JSON.parse(output as string);

    expect(result.dispatch).toMatchObject({
      kind: "existing_url_pipeline",
      url: "https://www.xiaohongshu.com/explore/65f000000000000000000000",
    });
    expect(result.instructions).toEqual(
      expect.arrayContaining(["Use the existing BrowserCode URL pipeline and current web/video/resource/vault tools."]),
    );
    expect(result.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      executesNetwork: false,
    });
    expect(result).not.toHaveProperty("plan");
    expect(result).not.toHaveProperty("executionRequests");
  });
});
