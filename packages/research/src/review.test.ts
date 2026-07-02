import { describe, expect, it } from "vitest";

import {
  applyReviewDecisions,
  assertNoUnreviewedCandidatesInManifest,
  buildApprovedManifest,
  buildDiscoveryCandidatePool,
  createDiscoveryRun,
  planProReader
} from "./index";

function makeReviewedRun() {
  const { route, plan } = planProReader({
    query: "collect AI agent sources",
    requestedMode: "discovery_ingest"
  });
  const run = createDiscoveryRun({
    id: "review-run-1",
    query: "collect AI agent sources",
    route,
    plan
  });

  return buildDiscoveryCandidatePool({
    run,
    rawCandidates: [
      {
        provider: "github",
        title: "Agent source repo",
        url: "https://github.com/example/agent",
        summary: "Metadata only."
      },
      {
        provider: "websearch",
        title: "Agent blog post",
        url: "https://example.com/agent-post",
        summary: "Metadata only."
      },
      {
        provider: "bilibili_mcp",
        title: "Agent video",
        url: "https://www.bilibili.com/video/BV123",
        summary: "Metadata only."
      }
    ]
  });
}

describe("human review manifest", () => {
  it("applies human review decisions without enabling enrichment or knowledge writes", () => {
    const run = makeReviewedRun();
    const reviewed = applyReviewDecisions(run, [
      {
        candidateId: "github-1",
        decision: "approved",
        reviewer: "human",
        reason: "Relevant source repo.",
        at: "2026-07-02T00:00:00.000Z"
      },
      {
        candidateId: "websearch-2",
        decision: "rejected",
        reviewer: "human",
        reason: "Too shallow.",
        at: "2026-07-02T00:00:01.000Z"
      }
    ]);

    expect(Object.fromEntries(reviewed.candidates.map((candidate) => [candidate.id, candidate.reviewStatus]))).toEqual({
      "github-1": "approved",
      "websearch-2": "rejected",
      "bilibili_mcp-3": "deferred"
    });
    expect(reviewed.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      writesApprovedManifest: false,
      allowsEnrichment: false
    });
  });

  it("builds an approved manifest from approved candidates only", () => {
    const run = makeReviewedRun();
    const reviewed = applyReviewDecisions(run, [
      {
        candidateId: "github-1",
        decision: "approved",
        reviewer: "human",
        at: "2026-07-02T00:00:00.000Z"
      },
      {
        candidateId: "websearch-2",
        decision: "rejected",
        reviewer: "human",
        at: "2026-07-02T00:00:01.000Z"
      }
    ]);
    const manifest = buildApprovedManifest(reviewed);

    expect(manifest.entries).toEqual([
      {
        candidateId: "github-1",
        provider: "github",
        title: "Agent source repo",
        url: "https://github.com/example/agent",
        normalizedUrl: "https://github.com/example/agent",
        approvedAt: "2026-07-02T00:00:00.000Z",
        reviewer: "human"
      }
    ]);
    expect(manifest.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      allowsEnrichment: false
    });
    expect(() => assertNoUnreviewedCandidatesInManifest(reviewed, manifest)).not.toThrow();
  });

  it("rejects review decisions before the run reaches the human review gate", () => {
    const { route, plan } = planProReader({
      query: "collect AI agent sources",
      requestedMode: "discovery_ingest"
    });
    const run = createDiscoveryRun({
      id: "review-run-2",
      query: "collect AI agent sources",
      route,
      plan
    });

    expect(() => applyReviewDecisions(run, [])).toThrow("DISCOVERY_NOT_WAITING_FOR_REVIEW");
  });

  it("detects rejected or deferred candidates if they are injected into an approved manifest", () => {
    const run = makeReviewedRun();
    const reviewed = applyReviewDecisions(run, [
      {
        candidateId: "github-1",
        decision: "rejected",
        reviewer: "human",
        at: "2026-07-02T00:00:00.000Z"
      }
    ]);

    expect(() => assertNoUnreviewedCandidatesInManifest(reviewed, {
      runId: reviewed.id,
      query: reviewed.query,
      entries: [
        {
          candidateId: "github-1",
          provider: "github",
          title: "Injected",
          url: "https://github.com/example/agent",
          normalizedUrl: "https://github.com/example/agent",
          approvedAt: "2026-07-02T00:00:00.000Z",
          reviewer: "human"
        }
      ],
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false,
        allowsEnrichment: false
      }
    })).toThrow("UNREVIEWED_CANDIDATE_IN_APPROVED_MANIFEST");
  });
});
