import { describe, expect, it } from "vitest";
import { SaveMarkdownNoteInputSchema } from "@ska/schemas";

import {
  applyReviewDecisions,
  assertVaultHandoffIsDryRun,
  buildApprovedManifest,
  buildDiscoveryCandidatePool,
  buildVaultDryRunHandoff,
  createDiscoveryRun,
  planEnrichmentFromApprovedManifest,
  planProReader
} from "./index";

function makeHandoff() {
  const { route, plan } = planProReader({
    query: "collect AI agent sources",
    requestedMode: "discovery_ingest"
  });
  const run = createDiscoveryRun({
    id: "vault-run-1",
    query: "collect AI agent sources",
    route,
    plan
  });
  const reviewRun = buildDiscoveryCandidatePool({
    run,
    rawCandidates: [
      {
        provider: "github",
        title: "Agent source repo",
        url: "https://github.com/example/agent",
        summary: "Metadata only."
      }
    ]
  });
  const reviewed = applyReviewDecisions(reviewRun, [
    {
      candidateId: "github-1",
      decision: "approved",
      reviewer: "human",
      at: "2026-07-02T00:00:00.000Z"
    }
  ]);
  const manifest = buildApprovedManifest(reviewed);
  const enrichmentPlan = planEnrichmentFromApprovedManifest(manifest);

  return buildVaultDryRunHandoff({ manifest, enrichmentPlan });
}

describe("vault adapter dry-run handoff", () => {
  it("builds evidence pack, synthesis draft, and ingest manifest without formal writes", () => {
    const handoff = makeHandoff();

    expect(handoff.outputDir).toBe(".tmp/discovery/runs/vault-run-1/vault_handoff");
    expect(handoff.artifacts.map((artifact) => artifact.kind)).toEqual([
      "evidence_pack",
      "synthesis_draft",
      "ingest_manifest"
    ]);
    expect(handoff.artifacts.every((artifact) => artifact.formalSource === false)).toBe(true);
    expect(handoff.sideEffects).toEqual({
      executed: false,
      writesVault: false,
      wroteVault: false,
      writesKnowledgeBase: false,
      wroteKnowledgeBase: false,
      updatesIndex: false,
      rebuiltIndex: false
    });
    expect(() => assertVaultHandoffIsDryRun(handoff)).not.toThrow();
  });

  it("hands off to the existing save_markdown_note ingest path without calling it", () => {
    const handoff = makeHandoff();

    expect(handoff.ingestManifest.handoffCommand).toEqual({
      tool: "save_markdown_note",
      mode: "external_existing_ingest",
      requiresHumanAction: true
    });
    expect(handoff.ingestManifest.sideEffects).toEqual({
      executed: false,
      writesVault: false,
      wroteVault: false,
      writesKnowledgeBase: false,
      wroteKnowledgeBase: false,
      updatesIndex: false,
      rebuiltIndex: false
    });
  });

  it("builds ingest items that match the existing save_markdown_note input shape", () => {
    const handoff = makeHandoff();

    expect(handoff.ingestManifest.items).toHaveLength(1);
    expect(() => SaveMarkdownNoteInputSchema.parse(handoff.ingestManifest.items[0])).not.toThrow();
    expect(handoff.ingestManifest.items[0]).toMatchObject({
      candidateId: "github-1",
      recommendedTool: "save_markdown_note",
      requiresHumanExecution: true,
      content_type: "resource",
      metadata: {
        source_platform: "github"
      }
    });
  });

  it("keeps generated artifacts outside vault, kb, and sqlite", () => {
    const handoff = makeHandoff();
    const generatedTargets = JSON.stringify({
      artifactPaths: handoff.artifacts.map((artifact) => artifact.path),
      evidencePaths: handoff.ingestManifest.items.map((item) => item.evidencePath)
    });

    expect(handoff.artifacts.every((artifact) => artifact.path.startsWith(".tmp/discovery/runs/vault-run-1/vault_handoff/"))).toBe(true);
    expect(generatedTargets).not.toContain("vault/articles");
    expect(generatedTargets).not.toContain("kb/claims");
    expect(generatedTargets).not.toContain("index/browsercode.sqlite");
    expect(handoff.forbiddenWrites).toEqual(expect.arrayContaining([
      "vault/articles",
      "kb/claims",
      "index/browsercode.sqlite"
    ]));
  });

  it("rejects mismatched manifest and enrichment run ids", () => {
    const handoff = makeHandoff();
    const manifest = JSON.parse(handoff.artifacts.find((artifact) => artifact.kind === "ingest_manifest")?.content ?? "{}");

    expect(() => buildVaultDryRunHandoff({
      manifest: {
        runId: "other-run",
        query: "collect AI agent sources",
        entries: [],
        sideEffects: {
          writesVault: false,
          writesKnowledgeBase: false,
          allowsEnrichment: false
        }
      },
      enrichmentPlan: {
        runId: manifest.runId,
        query: manifest.query,
        steps: [],
        sideEffects: {
          writesVault: false,
          writesKnowledgeBase: false,
          downloadsMediaByDefault: false
        }
      }
    })).toThrow("VAULT_HANDOFF_RUN_MISMATCH");
  });

  it("rejects empty approved manifests", () => {
    expect(() => buildVaultDryRunHandoff({
      manifest: {
        runId: "empty-run",
        query: "empty",
        entries: [],
        sideEffects: {
          writesVault: false,
          writesKnowledgeBase: false,
          allowsEnrichment: false
        }
      },
      enrichmentPlan: {
        runId: "empty-run",
        query: "empty",
        steps: [],
        sideEffects: {
          writesVault: false,
          writesKnowledgeBase: false,
          downloadsMediaByDefault: false
        }
      }
    })).toThrow("VAULT_HANDOFF_REQUIRES_APPROVED_MANIFEST_ENTRIES");
  });
});
