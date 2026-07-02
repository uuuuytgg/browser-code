import type { SaveMarkdownNoteInput, VaultContentType } from "@ska/schemas";

import type { EnrichmentPlan } from "./enrichment";
import type { ApprovedManifest } from "./review";

export type VaultAdapterMode = "dry_run";

export type VaultHandoffArtifact = {
  path: string;
  kind: "evidence_pack" | "synthesis_draft" | "ingest_manifest";
  content: string;
  formalSource: false;
};

export type VaultIngestManifest = {
  runId: string;
  query: string;
  mode: VaultAdapterMode;
  approvedCandidateIds: string[];
  enrichmentStepIds: string[];
  items: VaultIngestManifestItem[];
  handoffCommand: {
    tool: "save_markdown_note";
    mode: "external_existing_ingest";
    requiresHumanAction: true;
  };
  sideEffects: {
    executed: false;
    writesVault: false;
    wroteVault: false;
    writesKnowledgeBase: false;
    wroteKnowledgeBase: false;
    updatesIndex: false;
    rebuiltIndex: false;
  };
};

export type VaultIngestManifestItem = SaveMarkdownNoteInput & {
  candidateId: string;
  evidencePath: string;
  recommendedTool: "save_markdown_note";
  requiresHumanExecution: true;
};

export type VaultDryRunHandoff = {
  runId: string;
  mode: VaultAdapterMode;
  createdAt: string;
  outputDir: string;
  artifacts: VaultHandoffArtifact[];
  ingestManifest: VaultIngestManifest;
  forbiddenWrites: string[];
  sideEffects: {
    executed: false;
    writesVault: false;
    wroteVault: false;
    writesKnowledgeBase: false;
    wroteKnowledgeBase: false;
    updatesIndex: false;
    rebuiltIndex: false;
  };
};

export function buildVaultDryRunHandoff(args: {
  manifest: ApprovedManifest;
  enrichmentPlan: EnrichmentPlan;
  createdAt?: string;
}): VaultDryRunHandoff {
  assertMatchingRun(args.manifest, args.enrichmentPlan);
  assertNonEmptyManifest(args.manifest);

  const outputDir = `.tmp/discovery/runs/${args.manifest.runId}/vault_handoff`;
  const ingestManifest = buildIngestManifest(args.manifest, args.enrichmentPlan);

  return {
    runId: args.manifest.runId,
    mode: "dry_run",
    createdAt: args.createdAt ?? new Date(0).toISOString(),
    outputDir,
    artifacts: [
      {
        path: `${outputDir}/evidence_pack.md`,
        kind: "evidence_pack",
        content: renderEvidencePack(args.manifest, args.enrichmentPlan),
        formalSource: false
      },
      {
        path: `${outputDir}/synthesis_draft.md`,
        kind: "synthesis_draft",
        content: renderSynthesisDraft(args.manifest),
        formalSource: false
      },
      {
        path: `${outputDir}/ingest_manifest.json`,
        kind: "ingest_manifest",
        content: JSON.stringify(ingestManifest, null, 2),
        formalSource: false
      }
    ],
    ingestManifest,
    forbiddenWrites: [
      "vault/articles",
      "vault/videos",
      "vault/documents",
      "vault/snippets",
      "vault/resources",
      "vault/index",
      "kb/claims",
      "kb/topics",
      "kb/entities",
      "kb/sources",
      "index/browsercode.sqlite"
    ],
    sideEffects: {
      executed: false,
      writesVault: false,
      wroteVault: false,
      writesKnowledgeBase: false,
      wroteKnowledgeBase: false,
      updatesIndex: false,
      rebuiltIndex: false
    }
  };
}

export function assertVaultHandoffIsDryRun(handoff: VaultDryRunHandoff): void {
  if (handoff.sideEffects.executed
    || handoff.sideEffects.writesVault
    || handoff.sideEffects.wroteVault
    || handoff.sideEffects.writesKnowledgeBase
    || handoff.sideEffects.wroteKnowledgeBase
    || handoff.sideEffects.updatesIndex
    || handoff.sideEffects.rebuiltIndex) {
    throw new Error("VAULT_HANDOFF_MUST_BE_DRY_RUN");
  }

  const unsafeArtifact = handoff.artifacts.find((artifact) => artifact.formalSource);
  if (unsafeArtifact) {
    throw new Error(`VAULT_HANDOFF_ARTIFACT_CANNOT_BE_FORMAL_SOURCE: ${unsafeArtifact.path}`);
  }
}

function buildIngestManifest(
  manifest: ApprovedManifest,
  enrichmentPlan: EnrichmentPlan
): VaultIngestManifest {
  return {
    runId: manifest.runId,
    query: manifest.query,
    mode: "dry_run",
    approvedCandidateIds: manifest.entries.map((entry) => entry.candidateId),
    enrichmentStepIds: enrichmentPlan.steps.map((step) => step.id),
    items: manifest.entries.map((entry) => buildIngestItem(manifest.runId, entry)),
    handoffCommand: {
      tool: "save_markdown_note",
      mode: "external_existing_ingest",
      requiresHumanAction: true
    },
    sideEffects: {
      executed: false,
      writesVault: false,
      wroteVault: false,
      writesKnowledgeBase: false,
      wroteKnowledgeBase: false,
      updatesIndex: false,
      rebuiltIndex: false
    }
  };
}

function buildIngestItem(
  runId: string,
  entry: ApprovedManifest["entries"][number]
): VaultIngestManifestItem {
  const evidencePath = `.tmp/discovery/runs/${runId}/vault_handoff/evidence_pack.md`;

  return {
    candidateId: entry.candidateId,
    evidencePath,
    recommendedTool: "save_markdown_note",
    requiresHumanExecution: true,
    markdown: [
      `# ${entry.title}`,
      "",
      "This is a dry-run ingest item generated from reviewed external discovery.",
      "",
      `Source: ${entry.url}`,
      `Evidence pack: ${evidencePath}`
    ].join("\n"),
    metadata: {
      title: entry.title,
      source_url: entry.url,
      source_platform: inferSourcePlatform(entry.url),
      tags: ["proreader", "external-discovery"],
      keywords: [entry.provider]
    },
    content_type: inferContentType(entry.url),
    source_url: entry.url
  };
}

function renderEvidencePack(manifest: ApprovedManifest, enrichmentPlan: EnrichmentPlan) {
  const lines = [
    `# Evidence Pack: ${manifest.query}`,
    "",
    "This is a dry-run handoff artifact. It is not a formal source.",
    "",
    "## Approved Candidates",
    ""
  ];

  for (const entry of manifest.entries) {
    lines.push(`- ${entry.title}`);
    lines.push(`  - candidateId: ${entry.candidateId}`);
    lines.push(`  - provider: ${entry.provider}`);
    lines.push(`  - url: ${entry.url}`);
  }

  lines.push("");
  lines.push("## Planned Enrichment Steps");
  lines.push("");

  for (const step of enrichmentPlan.steps) {
    lines.push(`- ${step.id}`);
    lines.push(`  - candidateId: ${step.candidateId}`);
    lines.push(`  - tool: ${step.tool}`);
    lines.push(`  - requiresApproval: ${step.requiresApproval}`);
    lines.push(`  - blockedByDefault: ${step.blockedByDefault}`);
  }

  return lines.join("\n");
}

function renderSynthesisDraft(manifest: ApprovedManifest) {
  return [
    `# Synthesis Draft: ${manifest.query}`,
    "",
    "This draft is for human review and is not a formal source.",
    "",
    "## Source Candidates",
    "",
    ...manifest.entries.map((entry) => `- ${entry.title} (${entry.url})`)
  ].join("\n");
}

function assertMatchingRun(manifest: ApprovedManifest, enrichmentPlan: EnrichmentPlan) {
  if (manifest.runId !== enrichmentPlan.runId) {
    throw new Error(`VAULT_HANDOFF_RUN_MISMATCH: ${manifest.runId} != ${enrichmentPlan.runId}`);
  }
}

function assertNonEmptyManifest(manifest: ApprovedManifest) {
  if (manifest.entries.length === 0) {
    throw new Error("VAULT_HANDOFF_REQUIRES_APPROVED_MANIFEST_ENTRIES");
  }
}

function inferContentType(url: string): VaultContentType {
  if (/youtube\.com|youtu\.be|bilibili\.com|douyin\.com|xiaohongshu\.com|tiktok\.com/i.test(url)) {
    return "video";
  }
  if (/\.pdf($|[?#])/i.test(url)) return "document";
  if (/github\.com/i.test(url)) return "resource";
  return "article";
}

function inferSourcePlatform(url: string) {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/bilibili\.com/i.test(url)) return "bilibili";
  if (/github\.com/i.test(url)) return "github";
  return "web";
}
