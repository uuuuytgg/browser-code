import { describe, expect, it } from "vitest";

import {
  buildAnswerContextDraft,
  buildGitHubSearchQueries,
  dispatchInput,
  getProviderAdapter,
  planProReader,
  routeQuery
} from "./index";

describe("dispatchInput", () => {
  it("short-circuits explicit URLs to the existing BrowserCode URL pipeline", () => {
    const dispatch = dispatchInput("保存 https://www.douyin.com/jingxuan/video/7340000000000000000");

    expect(dispatch).toEqual({
      kind: "existing_url_pipeline",
      url: "https://www.douyin.com/jingxuan/video/7340000000000000000",
      reason: "Explicit URLs are handled by the existing BrowserCode URL pipeline before ProReader."
    });
  });

  it("routes fuzzy natural-language input into ProReader", () => {
    const dispatch = dispatchInput("帮我找一批 MCP 在 B 站和 YouTube 上的深度内容");

    expect(dispatch.kind).toBe("proreader");
  });
});

describe("routeQuery", () => {
  it("routes local knowledge questions to LLM Wiki Lite", () => {
    const route = routeQuery({ query: "BrowserCode 的 LLM Wiki Lite 是什么？" });

    expect(route.intent).toBe("local_wiki_question");
    expect(route.mode).toBe("answer");
    expect(route.providers).toEqual(["llm_wiki_lite"]);
    expect(route.requiresHumanReview).toBe(false);
    expect(route.requiresVaultWrite).toBe(false);
  });

  it("routes code tooling questions to GitHub, official docs, websearch, and local wiki", () => {
    const route = routeQuery({ query: "opencode session runtime 的实现和相关 issue" });

    expect(route.intent).toBe("code_tooling_question");
    expect(route.mode).toBe("answer");
    expect(route.providers).toEqual(["llm_wiki_lite", "github", "official_docs", "websearch"]);
  });

  it("routes knowledge definition questions to Wikipedia and reference providers", () => {
    const route = routeQuery({ query: "MCP 是什么，它的历史背景和核心概念是什么？" });

    expect(route.intent).toBe("knowledge_definition_question");
    expect(route.providers).toEqual(["llm_wiki_lite", "wikipedia", "official_docs", "websearch"]);
  });

  it("routes fuzzy video/social discovery to platform search providers and review", () => {
    const route = routeQuery({ query: "帮我找 B站、YouTube、抖音、小红书上关于 AI Agent 的深度视频" });

    expect(route.intent).toBe("video_platform_discovery");
    expect(route.mode).toBe("discovery_ingest");
    expect(route.providers).toEqual([
      "websearch",
      "site_search",
      "youtube_data_api",
      "bilibili_mcp",
      "douyin_mcp",
      "xiaohongshu_mcp",
      "tiktok_mcp"
    ]);
    expect(route.requiresHumanReview).toBe(true);
    expect(route.requiresVaultWrite).toBe(false);
  });

  it("routes ingest requests to discovery with review and no direct vault write", () => {
    const route = routeQuery({ query: "帮我搜集一批 Claude Code workflow 外部资料，准备入库" });

    expect(route.intent).toBe("vault_ingest_request");
    expect(route.mode).toBe("discovery_ingest");
    expect(route.requiresHumanReview).toBe(true);
    expect(route.requiresVaultWrite).toBe(true);
  });
});

describe("planProReader", () => {
  it("builds fuzzy GitHub search steps instead of URL/cache-first work", () => {
    const { plan } = planProReader({ query: "opencode session runtime 的 issue、PR、release 和源码实现" });

    expect(plan.steps.filter((step) => step.provider === "github").map((step) => step.id)).toEqual([
      "github-issue-search",
      "github-pull_request-search",
      "github-release-search",
      "github-code-search",
      "github-repository-search"
    ]);
    expect(JSON.stringify(plan)).not.toContain("github.sqlite");
  });

  it("builds platform discovery search steps without enrichment approval bypass", () => {
    const { route, plan } = planProReader({ query: "找几个关于 MCP 的 YouTube 和 B站视频" });

    expect(route.mode).toBe("discovery_ingest");
    expect(plan.steps.some((step) => step.id === "youtube_data_api-search")).toBe(true);
    expect(plan.steps.some((step) => step.id === "bilibili_mcp-search")).toBe(true);
    expect(plan.steps.every((step) => step.action === "search")).toBe(true);
    expect(plan.steps.every((step) => step.requiresApproval === false)).toBe(true);
  });
});

describe("answer system planning", () => {
  it("plans LLM Wiki Lite through the existing answer-context harness", () => {
    const { plan } = planProReader({ query: "BrowserCode LLM Wiki Lite" });

    expect(plan.steps[0]).toMatchObject({
      id: "local-wiki-search",
      provider: "llm_wiki_lite",
      action: "search",
      input: {
        adapter: "harness/make_answer_context.ts",
        outputPath: ".tmp/answer_context.md",
        internalKnowledgePath: "llm_wiki_lite"
      },
      requiresApproval: false
    });
  });

  it("keeps answer mode as no-review and no-knowledge-write while using adapters", () => {
    const route = routeQuery({ query: "MCP definition and background" });
    const { plan } = planProReader({ query: "MCP definition and background" });
    const draft = buildAnswerContextDraft({ query: "MCP definition and background", route, plan });

    expect(draft.outputPath).toBe(".tmp/answer/answer_context.md");
    expect(draft.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      requiresHumanReview: false
    });
    expect(getProviderAdapter("llm_wiki_lite")).toMatchObject({
      kind: "lite_wiki_harness",
      command: {
        tool: "bun",
        args: ["run", "harness/make_answer_context.ts", "<query>"],
        outputPath: ".tmp/answer_context.md"
      }
    });
    expect(getProviderAdapter("webfetch")).toMatchObject({
      kind: "agent_builtin"
    });
  });
});

describe("buildGitHubSearchQueries", () => {
  it("creates repository-scoped search queries when a GitHub URL appears in a fuzzy query", () => {
    const queries = buildGitHubSearchQueries("研究 https://github.com/sst/opencode 的 issue 和源码实现");

    expect(queries).toEqual([
      {
        kind: "issue",
        query: "研究 https://github.com/sst/opencode 的 issue 和源码实现 is:issue repo:sst/opencode",
        repository: { owner: "sst", repo: "opencode" }
      },
      {
        kind: "code",
        query: "研究 https://github.com/sst/opencode 的 issue 和源码实现 repo:sst/opencode",
        repository: { owner: "sst", repo: "opencode" }
      },
      {
        kind: "repository",
        query: "研究 https://github.com/sst/opencode 的 issue 和源码实现",
        repository: { owner: "sst", repo: "opencode" }
      }
    ]);
  });
});
