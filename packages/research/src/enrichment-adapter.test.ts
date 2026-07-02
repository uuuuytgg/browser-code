import { describe, expect, it } from "vitest";

import {
  applyReviewDecisions,
  buildApprovedManifest,
  buildDiscoveryCandidatePool,
  buildEnrichmentExecutionRequests,
  createDiscoveryRun,
  planEnrichmentFromApprovedManifest,
  planProReader
} from "./index";

function makeEnrichmentPlan() {
  const { route, plan } = planProReader({
    query: "collect AI agent sources",
    requestedMode: "discovery_ingest"
  });
  const run = createDiscoveryRun({
    id: "adapter-run-1",
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

  return planEnrichmentFromApprovedManifest(buildApprovedManifest(reviewed));
}

describe("enrichment adapter execution descriptions", () => {
  it("builds every request from an approved enrichment plan step", () => {
    const plan = makeEnrichmentPlan();
    const requests = buildEnrichmentExecutionRequests(plan);
    const approvedStepIds = new Set(plan.steps.map((step) => step.id));

    expect(requests).toHaveLength(plan.steps.length);
    expect(requests.every((request) => approvedStepIds.has(request.stepId))).toBe(true);
    expect(requests.every((request) => request.source === "approved_enrichment_plan")).toBe(true);
    expect(requests.every((request) => request.runId === plan.runId)).toBe(true);
    expect(requests.every((request) => request.writesVault === false && request.writesKnowledgeBase === false)).toBe(true);
  });

  it("describes audio extraction as blocked by default and approval-gated", () => {
    const requests = buildEnrichmentExecutionRequests(makeEnrichmentPlan());
    const audioRequest = requests.find((request) => request.tool === "ffmpeg_extract_audio");

    expect(audioRequest).toMatchObject({
      capability: "audio_extract_fallback",
      blockedByDefault: true,
      requiresApproval: true
    });
  });

  it("describes yt-dlp as metadata-only with noDownload", () => {
    const requests = buildEnrichmentExecutionRequests(makeEnrichmentPlan());
    const ytdlpRequest = requests.find((request) => request.tool === "yt-dlp");

    expect(ytdlpRequest).toMatchObject({
      capability: "video_metadata_probe",
      noDownload: true,
      input: {
        noDownload: true
      }
    });
  });

  it("keeps all execution outputs under the discovery run temp directory", () => {
    const requests = buildEnrichmentExecutionRequests(makeEnrichmentPlan());

    expect(requests.every((request) => request.outputDir.startsWith(".tmp/discovery/runs/adapter-run-1/enrichment/"))).toBe(true);
    expect(JSON.stringify(requests)).not.toContain("vault/");
    expect(JSON.stringify(requests)).not.toContain("kb/");
    expect(JSON.stringify(requests)).not.toContain("index/browsercode.sqlite");
  });

  it("does not expose shell, command, javascript, or python execution adapters", () => {
    const requests = buildEnrichmentExecutionRequests(makeEnrichmentPlan());
    const serialized = JSON.stringify(requests);

    expect(serialized).not.toContain("run_shell");
    expect(serialized).not.toContain("execute_command");
    expect(serialized).not.toContain("eval_js");
    expect(serialized).not.toContain("run_python");
  });
});
