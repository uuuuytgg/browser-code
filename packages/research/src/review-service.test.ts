import { describe, expect, it } from "vitest";

import {
  applyReviewActions,
  buildDiscoveryCandidatePool,
  buildReviewedManifest,
  createDiscoveryRun,
  createReviewSession,
  listReviewItems,
  planProReader
} from "./index";

function makeRun() {
  const { route, plan } = planProReader({
    query: "collect review service sources",
    requestedMode: "discovery_ingest"
  });
  const run = createDiscoveryRun({
    id: "review-service-run-1",
    query: "collect review service sources",
    route,
    plan
  });

  return buildDiscoveryCandidatePool({
    run,
    rawCandidates: [
      {
        provider: "github",
        title: "Useful implementation",
        url: "https://github.com/example/review-service",
        summary: "Metadata only."
      },
      {
        provider: "websearch",
        title: "Shallow article",
        url: "https://example.com/shallow",
        summary: "Metadata only."
      },
      {
        provider: "wikipedia",
        title: "Background reference",
        url: "https://en.wikipedia.org/wiki/Review",
        summary: "Metadata only."
      }
    ]
  });
}

describe("review service", () => {
  it("creates sessions only for discovery runs waiting for human review", () => {
    const { route, plan } = planProReader({
      query: "collect review service sources",
      requestedMode: "discovery_ingest"
    });
    const run = createDiscoveryRun({
      id: "review-service-run-2",
      query: "collect review service sources",
      route,
      plan
    });

    expect(() => createReviewSession(run)).toThrow("DISCOVERY_NOT_WAITING_FOR_REVIEW");

    const session = createReviewSession(makeRun(), "session-1");
    expect(session).toMatchObject({
      id: "session-1",
      runId: "review-service-run-1",
      status: "open",
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false,
        writesApprovedManifest: false,
        allowsEnrichment: false
      }
    });
  });

  it("lists pending review items from memory without mutating the discovery run", () => {
    const run = makeRun();
    const session = createReviewSession(run);
    const items = listReviewItems(session);

    expect(Object.fromEntries(items.map((item) => [item.candidateId, item.reviewStatus]))).toEqual({
      "github-1": "pending",
      "websearch-2": "pending",
      "wikipedia-3": "pending"
    });
    expect(run.candidates.every((candidate) => candidate.reviewStatus === "pending")).toBe(true);
  });

  it("keeps pending, rejected, and deferred candidates out of the approved manifest", () => {
    const session = createReviewSession(makeRun());
    const result = applyReviewActions(session, [
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
      },
      {
        candidateId: "wikipedia-3",
        decision: "deferred",
        reviewer: "human",
        at: "2026-07-02T00:00:02.000Z"
      }
    ]);

    expect(result.approvedManifest.entries.map((entry) => entry.candidateId)).toEqual(["github-1"]);
    expect(Object.fromEntries(
      listReviewItems(result.session).map((item) => [item.candidateId, item.reviewStatus])
    )).toEqual({
      "github-1": "approved",
      "websearch-2": "rejected",
      "wikipedia-3": "deferred"
    });
  });

  it("builds a reviewed run and approved manifest with all side effects disabled", () => {
    const result = buildReviewedManifest(makeRun(), [
      {
        candidateId: "github-1",
        decision: "approved",
        reviewer: "human",
        at: "2026-07-02T00:00:00.000Z"
      }
    ]);

    expect(result.reviewedRun.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      writesApprovedManifest: false,
      allowsEnrichment: false
    });
    expect(result.approvedManifest.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      allowsEnrichment: false
    });
    expect(result.session.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      writesApprovedManifest: false,
      allowsEnrichment: false
    });
  });
});
