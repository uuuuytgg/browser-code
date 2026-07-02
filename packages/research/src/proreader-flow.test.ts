import { describe, expect, it } from "vitest";

import {
  applyReviewActions,
  buildDiscoveryCandidatePool,
  buildEnrichmentExecutionRequests,
  buildProviderExecutionRequests,
  buildVaultDryRunHandoff,
  createDiscoveryRun,
  createReviewSession,
  executeProviderRequest,
  planEnrichmentFromApprovedManifest,
  planProReader
} from "./index";

describe("ProReader execution-review-enrichment flow", () => {
  it("runs the first three integration layers without touching formal knowledge stores", async () => {
    const { route, plan } = planProReader({
      query: "collect AI agent sources",
      requestedMode: "discovery_ingest"
    });
    const executionRequest = buildProviderExecutionRequests(plan).find((request) => request.provider === "github");

    expect(executionRequest).toBeDefined();
    const executionResult = await executeProviderRequest(
      executionRequest!,
      {
        api_request: async () => ({
          status: "completed",
          candidates: [
            {
              provider: "github",
              title: "Agent source repo",
              url: "https://github.com/example/agent",
              summary: "Fake provider execution candidate."
            }
          ],
          notes: ["fake execution"]
        })
      },
      { allowNetwork: true }
    );

    const discoveryRun = createDiscoveryRun({
      id: "flow-run-1",
      query: "collect AI agent sources",
      route,
      plan
    });
    const reviewReadyRun = buildDiscoveryCandidatePool({
      run: discoveryRun,
      rawCandidates: executionResult.candidates
    });
    const reviewSession = createReviewSession(reviewReadyRun);
    const reviewResult = applyReviewActions(reviewSession, [
      {
        candidateId: "github-1",
        decision: "approved",
        reviewer: "human",
        at: "2026-07-02T00:00:00.000Z"
      }
    ]);
    const enrichmentPlan = planEnrichmentFromApprovedManifest(reviewResult.approvedManifest);
    const enrichmentRequests = buildEnrichmentExecutionRequests(enrichmentPlan);
    const handoff = buildVaultDryRunHandoff({
      manifest: reviewResult.approvedManifest,
      enrichmentPlan
    });

    expect(enrichmentRequests).toHaveLength(1);
    expect(enrichmentRequests[0]).toMatchObject({
      tool: "github",
      source: "approved_enrichment_plan",
      writesVault: false,
      writesKnowledgeBase: false
    });
    expect(handoff.sideEffects).toMatchObject({
      executed: false,
      writesVault: false,
      writesKnowledgeBase: false,
      rebuiltIndex: false
    });

    const generatedTargets = JSON.stringify({
      enrichmentRequests,
      artifactPaths: handoff.artifacts.map((artifact) => artifact.path),
      ingestItems: handoff.ingestManifest.items.map((item) => ({
        evidencePath: item.evidencePath,
        recommendedTool: item.recommendedTool,
        requiresHumanExecution: item.requiresHumanExecution
      }))
    });

    expect(generatedTargets).not.toContain("vault/articles");
    expect(generatedTargets).not.toContain("kb/claims");
    expect(generatedTargets).not.toContain("index/browsercode.sqlite");
  });
});
