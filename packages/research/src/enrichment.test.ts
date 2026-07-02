import { describe, expect, it } from "vitest";

import {
  applyReviewDecisions,
  assertEnrichmentUsesApprovedManifest,
  buildApprovedManifest,
  buildDiscoveryCandidatePool,
  createDiscoveryRun,
  planEnrichmentFromApprovedManifest,
  planProReader
} from "./index";
import type { ApprovedManifest } from "./index";

function makeManifest() {
  const { route, plan } = planProReader({
    query: "collect AI agent sources",
    requestedMode: "discovery_ingest"
  });
  const run = createDiscoveryRun({
    id: "enrich-run-1",
    query: "collect AI agent sources",
    route,
    plan
  });
  const reviewRun = buildDiscoveryCandidatePool({
    run,
    rawCandidates: [
      {
        provider: "youtube_data_api",
        title: "Agent video",
        url: "https://www.youtube.com/watch?v=abc",
        summary: "Metadata only."
      },
      {
        provider: "github",
        title: "Agent source repo",
        url: "https://github.com/example/agent",
        summary: "Metadata only."
      },
      {
        provider: "bilibili_mcp",
        title: "Agent Bilibili video",
        url: "https://www.bilibili.com/video/BV123",
        summary: "Metadata only."
      },
      {
        provider: "websearch",
        title: "Agent article",
        url: "https://example.com/article",
        summary: "Metadata only."
      }
    ]
  });
  const reviewed = applyReviewDecisions(reviewRun, [
    {
      candidateId: "youtube_data_api-1",
      decision: "approved",
      reviewer: "human",
      at: "2026-07-02T00:00:00.000Z"
    },
    {
      candidateId: "github-2",
      decision: "approved",
      reviewer: "human",
      at: "2026-07-02T00:00:01.000Z"
    },
    {
      candidateId: "bilibili_mcp-3",
      decision: "approved",
      reviewer: "human",
      at: "2026-07-02T00:00:03.000Z"
    },
    {
      candidateId: "websearch-4",
      decision: "approved",
      reviewer: "human",
      at: "2026-07-02T00:00:02.000Z"
    }
  ]);

  return buildApprovedManifest(reviewed);
}

describe("enrichment planning", () => {
  it("plans enrichment only from approved manifest entries", () => {
    const manifest = makeManifest();
    const plan = planEnrichmentFromApprovedManifest(manifest);

    expect(Object.fromEntries(
      ["youtube_data_api-1", "bilibili_mcp-3", "github-2", "websearch-4"].map((id) => [
        id,
        plan.steps.filter((step) => step.candidateId === id).length
      ])
    )).toEqual({
      "youtube_data_api-1": 3,
      "bilibili_mcp-3": 5,
      "github-2": 1,
      "websearch-4": 1
    });
    expect(plan.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      downloadsMediaByDefault: false
    });
  });

  it("keeps video download and audio extraction blocked by default", () => {
    const plan = planEnrichmentFromApprovedManifest(makeManifest());
    const fallback = plan.steps.find((step) => step.kind === "audio_extraction");

    expect(fallback).toMatchObject({
      tool: "ffmpeg_extract_audio",
      risk: "high",
      requiresApproval: true,
      blockedByDefault: true
    });
    expect(plan.steps.find((step) => step.tool === "yt-dlp")).toMatchObject({
      input: {
        noDownload: true
      },
      requiresApproval: true,
      blockedByDefault: false
    });
  });

  it("plans Bilibili danmaku and comments as explicit approved enrichment steps", () => {
    const plan = planEnrichmentFromApprovedManifest(makeManifest());

    expect(plan.steps.find((step) => step.id === "bilibili_mcp-3-bilibili-danmaku")).toMatchObject({
      kind: "danmaku",
      tool: "platform_mcp",
      input: {
        provider: "bilibili_mcp",
        capability: "danmaku"
      },
      requiresApproval: true
    });
    expect(plan.steps.find((step) => step.id === "bilibili_mcp-3-bilibili-comments")).toMatchObject({
      kind: "comments",
      tool: "platform_mcp",
      input: {
        provider: "bilibili_mcp",
        capability: "comments"
      },
      requiresApproval: true
    });
  });

  it("requires every planned enrichment step to remain approval-gated", () => {
    const plan = planEnrichmentFromApprovedManifest(makeManifest());

    expect(plan.steps.every((step) => step.requiresApproval)).toBe(true);
  });

  it("keeps all outputs under the discovery run temp directory", () => {
    const plan = planEnrichmentFromApprovedManifest(makeManifest());

    expect(plan.steps.every((step) => step.outputDir.startsWith(".tmp/discovery/runs/enrich-run-1/enrichment/"))).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("vault/");
    expect(JSON.stringify(plan)).not.toContain("kb/");
    expect(JSON.stringify(plan)).not.toContain("index/browsercode.sqlite");
  });

  it("requires an approved manifest before enrichment planning is useful", () => {
    const emptyManifest: ApprovedManifest = {
      runId: "empty-run",
      query: "nothing approved",
      entries: [],
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false,
        allowsEnrichment: false
      }
    };

    expect(() => assertEnrichmentUsesApprovedManifest(emptyManifest)).toThrow("ENRICHMENT_REQUIRES_APPROVED_MANIFEST_ENTRIES");
    expect(() => planEnrichmentFromApprovedManifest(emptyManifest)).toThrow("ENRICHMENT_REQUIRES_APPROVED_MANIFEST_ENTRIES");
  });
});
