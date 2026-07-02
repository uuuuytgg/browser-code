import { describe, expect, it } from "vitest";

import {
  buildAnswerContextDraft,
  buildGitHubSearchQueries,
  diagnoseProviderRuntime,
  dispatchInput,
  getProviderAdapter,
  planOfficialDocsSearchSteps,
  planProReader,
  planWikipediaSearchSteps,
  resolveProviderConfig,
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

describe("routeQuery Chinese fuzzy intent coverage", () => {
  it("routes Chinese local knowledge questions to LLM Wiki Lite", () => {
    const route = routeQuery({ query: "我之前在本地知识库里整理过 BrowserCode 的 LLM Wiki Lite 吗？" });

    expect(route.intent).toBe("local_wiki_question");
    expect(route.providers).toEqual(["llm_wiki_lite"]);
  });

  it("routes Chinese definition questions through Wikipedia and reference providers", () => {
    const route = routeQuery({ query: "MCP 是什么，它的历史背景和核心概念是什么？" });

    expect(route.intent).toBe("knowledge_definition_question");
    expect(route.providers).toEqual(["llm_wiki_lite", "wikipedia", "official_docs", "websearch"]);
  });

  it("routes Chinese video and social platform fuzzy search across all configured platform providers", () => {
    const route = routeQuery({
      query: "帮我在 B站、YouTube、抖音、小红书、TikTok 上找 AI Agent 的深度视频内容"
    });

    expect(route.intent).toBe("video_platform_discovery");
    expect(route.providers).toEqual([
      "websearch",
      "site_search",
      "youtube_data_api",
      "bilibili_mcp",
      "douyin_mcp",
      "xiaohongshu_mcp",
      "tiktok_mcp"
    ]);
  });

  it("routes Chinese ingest preparation to discovery with review before vault writes", () => {
    const route = routeQuery({ query: "帮我搜集一批外部资料，准备入库到知识库" });

    expect(route.intent).toBe("vault_ingest_request");
    expect(route.mode).toBe("discovery_ingest");
    expect(route.requiresHumanReview).toBe(true);
    expect(route.requiresVaultWrite).toBe(true);
  });
});

describe("planProReader", () => {
  it("rejects explicit URLs even when callers bypass dispatchInput", () => {
    expect(() => planProReader({ query: "https://github.com/sst/opencode" })).toThrow(
      "EXPLICIT_URL_BYPASSES_PROREADER"
    );
  });

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

describe("provider configuration", () => {
  it("passes GitHub runtime requirements into fuzzy search steps", () => {
    const { plan } = planProReader({ query: "opencode runtime issue" });
    const githubStep = plan.steps.find((step) => step.provider === "github");

    expect(githubStep?.input).toMatchObject({
      providerMode: "api",
      tokenEnv: "GITHUB_TOKEN",
      command: "gh",
      fallbackProviders: ["websearch"]
    });
  });

  it("passes MCP or CLI runtime requirements into platform discovery steps", () => {
    const config = resolveProviderConfig({
      providers: {
        douyin_mcp: {
          mode: "mcp_or_cli",
          command: "douyin-search",
          toolName: "configured_douyin_search"
        }
      }
    });
    const { plan } = planProReader({ query: "鎵?YouTube Bilibili Douyin TikTok video" }, config);

    expect(plan.steps.find((step) => step.id === "douyin_mcp-search")).toMatchObject({
      provider: "douyin_mcp",
      input: {
        providerMode: "mcp_or_cli",
        command: "douyin-search",
        toolName: "configured_douyin_search"
      }
    });
  });

  it("uses configured MCP tool names for platform discovery instead of hard-coding them", () => {
    const config = resolveProviderConfig({
      providers: {
        bilibili_mcp: {
          mode: "mcp",
          toolName: "configured_bilibili_search"
        }
      }
    });
    const { plan } = planProReader({ query: "YouTube Bilibili MCP video discovery" }, config);

    expect(plan.steps.find((step) => step.id === "bilibili_mcp-search")).toMatchObject({
      provider: "bilibili_mcp",
      input: {
        providerMode: "mcp",
        toolName: "configured_bilibili_search"
      }
    });
  });

  it("falls back to websearch when a configured provider is disabled", () => {
    const config = resolveProviderConfig({
      providers: {
        wikipedia: {
          enabled: false,
          fallbackProviders: ["websearch"]
        }
      }
    });
    const { plan } = planProReader({ query: "photosynthesis wikipedia history" }, config);

    expect(plan.steps.some((step) => step.id === "wikipedia-search")).toBe(false);
    expect(plan.steps).toContainEqual({
      id: "wikipedia-fallback-websearch-search",
      provider: "websearch",
      action: "search",
      input: {
        query: "photosynthesis wikipedia history",
        disabledProvider: "wikipedia"
      },
      requiresApproval: false
    });
  });
});

describe("provider runtime diagnostics", () => {
  it("reports missing provider runtime requirements without exposing secret values", () => {
    const diagnostics = diagnoseProviderRuntime(resolveProviderConfig(), {
      env: {
        GITHUB_TOKEN: "secret-value",
        WIKIMEDIA_USER_AGENT: undefined,
        YOUTUBE_API_KEY: undefined
      },
      availableCommands: []
    });

    expect(diagnostics.find((item) => item.provider === "github")).toMatchObject({
      status: "needs_configuration",
      configured: ["GITHUB_TOKEN"],
      missing: ["command:gh"]
    });
    expect(JSON.stringify(diagnostics)).not.toContain("secret-value");
    expect(diagnostics.find((item) => item.provider === "wikipedia")?.missing).toContain("WIKIMEDIA_USER_AGENT");
  });
});

describe("core fuzzy provider planners", () => {
  it("plans Wikipedia search and summary fetch with zh-first and en fallback", () => {
    const config = resolveProviderConfig();
    const steps = planWikipediaSearchSteps("MCP protocol history", config.providers.wikipedia);

    expect(steps).toEqual([
      {
        id: "wikipedia-opensearch-zh",
        provider: "wikipedia",
        action: "search",
        input: {
          query: "MCP protocol history",
          language: "zh",
          fallbackLanguage: "en",
          endpoint: "opensearch",
          providerMode: "api",
          userAgentEnv: "WIKIMEDIA_USER_AGENT"
        },
        requiresApproval: false
      },
      {
        id: "wikipedia-summary-fetch",
        provider: "wikipedia",
        action: "fetch",
        input: {
          query: "MCP protocol history",
          language: "zh",
          fallbackLanguage: "en",
          endpoint: "summary",
          selectedFrom: "wikipedia-opensearch-zh",
          providerMode: "api",
          userAgentEnv: "WIKIMEDIA_USER_AGENT"
        },
        requiresApproval: false
      }
    ]);
  });

  it("plans official docs as template search over preferred documentation domains", () => {
    const config = resolveProviderConfig();
    const steps = planOfficialDocsSearchSteps("OpenAI responses API", config.providers.official_docs);

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: "official-docs-search",
      provider: "official_docs",
      action: "search",
      input: {
        query: "OpenAI responses API",
        providerMode: "websearch_fallback",
        fallbackProviders: ["websearch", "webfetch"]
      },
      requiresApproval: false
    });
    expect(steps[0].input.templates).toEqual(
      expect.arrayContaining([
        "OpenAI responses API official docs",
        "OpenAI responses API documentation",
        "OpenAI responses API API reference",
        "OpenAI responses API site:platform.openai.com"
      ])
    );
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
