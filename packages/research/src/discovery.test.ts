import { describe, expect, it } from "vitest";

import {
  assertNoDiscoveryEnrichment,
  assertProviderPlanIsSearchOnly,
  buildDiscoveryCandidatePool,
  collectDiscoveryCandidates,
  createDiscoveryRun,
  planProReader,
  transitionDiscoveryRun
} from "./index";

describe("discovery state machine", () => {
  it("builds a candidate pool and stops at human review without side effects", () => {
    const { route, plan } = planProReader({
      query: "collect AI agent video sources",
      requestedMode: "discovery_ingest"
    });
    const run = createDiscoveryRun({
      id: "run-1",
      query: "collect AI agent video sources",
      route,
      plan,
      now: "2026-07-01T00:00:00.000Z"
    });
    const reviewed = buildDiscoveryCandidatePool({
      run,
      now: "2026-07-01T00:00:01.000Z",
      rawCandidates: [
        {
          provider: "youtube_data_api",
          title: "AI Agent lecture",
          url: "https://www.youtube.com/watch?v=abc#intro",
          summary: "Metadata only."
        },
        {
          provider: "websearch",
          title: "Duplicate result",
          url: "https://www.youtube.com/watch?v=abc",
          summary: "Transcript should wait for approval."
        },
        {
          provider: "bilibili_mcp",
          title: "Bilibili AI Agent",
          url: "https://www.bilibili.com/video/BV123",
          summary: "Metadata and subtitle mention."
        }
      ]
    });

    expect(reviewed.status).toBe("WAITING_FOR_HUMAN_REVIEW");
    expect(reviewed.candidates).toHaveLength(2);
    expect(reviewed.candidates.every((candidate) => candidate.reviewStatus === "pending")).toBe(true);
    expect(reviewed.candidates.some((candidate) => candidate.riskSignals.some((risk) => risk.level === "medium"))).toBe(true);
    expect(reviewed.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      writesApprovedManifest: false,
      allowsEnrichment: false
    });
    expect(reviewed.auditLog.map((event) => event.status)).toEqual([
      "SEARCH_PLANNED",
      "CANDIDATES_COLLECTED",
      "CANDIDATES_DEDUPED",
      "CANDIDATES_RANKED",
      "RISK_SCANNED",
      "WAITING_FOR_HUMAN_REVIEW"
    ]);
  });

  it("keeps discovery provider plans search-only before human review", () => {
    const { plan } = planProReader({
      query: "collect wikipedia and github background sources",
      requestedMode: "discovery_ingest"
    });

    expect(plan.steps.every((step) => step.action === "search")).toBe(true);
    expect(() => assertProviderPlanIsSearchOnly(plan)).not.toThrow();
    expect(JSON.stringify(plan)).not.toContain("wikipedia-summary-fetch");
  });

  it("blocks enrichment before a human-approved manifest exists", () => {
    const { route, plan } = planProReader({
      query: "collect AI agent video sources",
      requestedMode: "discovery_ingest"
    });
    const run = createDiscoveryRun({
      id: "run-2",
      query: "collect AI agent video sources",
      route,
      plan
    });
    const reviewed = buildDiscoveryCandidatePool({
      run,
      rawCandidates: [
        {
          provider: "websearch",
          title: "AI Agent source",
          url: "https://example.com/source",
          summary: "Metadata only."
        }
      ]
    });

    expect(() => assertNoDiscoveryEnrichment(reviewed)).toThrow("DISCOVERY_ENRICHMENT_BLOCKED_UNTIL_HUMAN_REVIEW");
  });

  it("rejects future approval and enrichment transitions in Phase 3", () => {
    const { route, plan } = planProReader({
      query: "collect AI agent video sources",
      requestedMode: "discovery_ingest"
    });
    const run = createDiscoveryRun({
      id: "run-3",
      query: "collect AI agent video sources",
      route,
      plan
    });
    const reviewed = buildDiscoveryCandidatePool({
      run,
      rawCandidates: [
        {
          provider: "websearch",
          title: "AI Agent source",
          url: "https://example.com/source",
          summary: "Metadata only."
        }
      ]
    });

    expect(() => transitionDiscoveryRun(reviewed, "APPROVED")).toThrow("DISCOVERY_TRANSITION_BLOCKED_BEFORE_HUMAN_REVIEW");
    expect(() => transitionDiscoveryRun(reviewed, "ENRICHING")).toThrow("DISCOVERY_TRANSITION_BLOCKED_BEFORE_HUMAN_REVIEW");
    expect(() => transitionDiscoveryRun(reviewed, "HANDED_OFF_TO_VAULT")).toThrow("DISCOVERY_TRANSITION_BLOCKED_BEFORE_HUMAN_REVIEW");
  });

  it("allows only the narrow Phase 3 transition path", () => {
    const { route, plan } = planProReader({
      query: "collect AI agent video sources",
      requestedMode: "discovery_ingest"
    });
    const run = createDiscoveryRun({
      id: "run-4",
      query: "collect AI agent video sources",
      route,
      plan
    });
    const collected = collectDiscoveryCandidates(run, [
      {
        provider: "websearch",
        title: "AI Agent source",
        url: "https://example.com/source",
        summary: "Metadata only."
      }
    ]);
    const deduped = transitionDiscoveryRun(collected, "CANDIDATES_DEDUPED");
    const ranked = transitionDiscoveryRun(deduped, "CANDIDATES_RANKED");
    const scanned = transitionDiscoveryRun(ranked, "RISK_SCANNED");
    const review = transitionDiscoveryRun(scanned, "WAITING_FOR_HUMAN_REVIEW");

    expect(review.status).toBe("WAITING_FOR_HUMAN_REVIEW");
    expect(review.auditLog.map((event) => event.status)).toEqual([
      "SEARCH_PLANNED",
      "CANDIDATES_COLLECTED",
      "CANDIDATES_DEDUPED",
      "CANDIDATES_RANKED",
      "RISK_SCANNED",
      "WAITING_FOR_HUMAN_REVIEW"
    ]);
  });
});
