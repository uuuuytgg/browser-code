import { describe, expect, it } from "vitest";

import { githubCacheSchemaSql, planGitHubDiscovery, planResearch } from "./index";

describe("planResearch", () => {
  it("routes ordinary knowledge questions to LLM Wiki Lite", () => {
    const plan = planResearch({ query: "BrowserCode 的 LLM Wiki Lite 是什么？" });

    expect(plan.route).toBe("local_answer");
    expect(plan.providers).toEqual(["llm_wiki_lite"]);
    expect(plan.reviewRequired).toBe(false);
    expect(plan.writesVaultDirectly).toBe(false);
  });

  it("routes direct video URLs to the existing video ingest tools", () => {
    const plan = planResearch({
      query: "保存这个视频",
      url: "https://www.bilibili.com/video/BV1NBjd6CEeB/"
    });

    expect(plan.route).toBe("direct_url_ingest");
    expect(plan.directUrlAdapter).toMatchObject({
      kind: "video",
      platform: "bilibili",
      contentType: "video",
      handoff: "existing_ingest_pipeline"
    });
    expect(plan.directUrlAdapter?.usesExistingTools).toEqual([
      "fetch_transcript",
      "ffmpeg_extract_audio",
      "save_markdown_note"
    ]);
    expect(plan.writesVaultDirectly).toBe(false);
  });

  it("routes newly enumerated social video URLs to existing video ingest handoff", () => {
    const plan = planResearch({
      query: "保存这个抖音精选视频",
      url: "https://www.douyin.com/jingxuan/video/7340000000000000000"
    });

    expect(plan.directUrlAdapter).toMatchObject({
      kind: "video",
      platform: "douyin",
      contentType: "video",
      handoff: "existing_ingest_pipeline"
    });
    expect(plan.directUrlAdapter?.usesExistingTools).toContain("save_markdown_note");
  });

  it("routes direct web URLs to existing web and vault tools", () => {
    const plan = planResearch({
      query: "保存这个网页",
      url: "https://opencode.ai/zh"
    });

    expect(plan.directUrlAdapter).toMatchObject({
      kind: "web",
      contentType: "article",
      handoff: "existing_ingest_pipeline"
    });
    expect(plan.directUrlAdapter?.usesExistingTools).toEqual([
      "web_to_markdown",
      "save_markdown_note"
    ]);
  });

  it("routes GitHub research to discovery instead of direct vault writes", () => {
    const plan = planResearch({
      query: "研究 opencode GitHub repo 的 issue、PR 和 release"
    });

    expect(plan.route).toBe("github_research");
    expect(plan.providers).toContain("github_database");
    expect(plan.reviewRequired).toBe(true);
    expect(plan.writesVaultDirectly).toBe(false);
    expect(plan.githubDiscovery?.datasets).toEqual([
      "repositories",
      "readme_docs",
      "issues",
      "pull_requests",
      "releases"
    ]);
  });

  it("plans GitHub repository discovery with cache tables and access fallbacks", () => {
    const plan = planGitHubDiscovery(
      "研究 https://github.com/sst/opencode 的 issue、PR、release 和源码实现"
    );

    expect(plan.repository).toEqual({ owner: "sst", repo: "opencode" });
    expect(plan.datasets).toEqual([
      "repositories",
      "readme_docs",
      "issues",
      "pull_requests",
      "releases",
      "code_search"
    ]);
    expect(plan.accessOrder).toEqual(["api_or_gh", "web_fallback"]);
    expect(plan.cache.databasePath).toBe(".tmp/research/github.sqlite");
    expect(plan.reviewRequired).toBe(true);
    expect(plan.writesVaultDirectly).toBe(false);
  });

  it("declares GitHub cache schema without coupling it to vault writes", () => {
    expect(githubCacheSchemaSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS repositories");
    expect(githubCacheSchemaSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS pull_requests");
    expect(githubCacheSchemaSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS code_search");
    expect(githubCacheSchemaSql.join("\n")).not.toContain("vault");
  });

  it("routes video discovery to candidates before existing direct URL ingest", () => {
    const plan = planResearch({
      query: "找几个关于 MCP 的 YouTube 视频",
      intent: "discover"
    });

    expect(plan.route).toBe("video_discovery");
    expect(plan.providers).toEqual(["video_discovery", "web_discovery"]);
    expect(plan.reviewRequired).toBe(true);
    expect(plan.notes.join("\n")).toContain("existing direct video ingest path");
  });
});
