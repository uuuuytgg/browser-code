import type { DiscoveryCandidate, DiscoveryRun } from "./discovery";

export type ReviewDecision = "approved" | "rejected" | "deferred";

export type CandidateReviewDecision = {
  candidateId: string;
  decision: ReviewDecision;
  reviewer: string;
  reason?: string;
  at: string;
};

export type ReviewedDiscoveryCandidate = Omit<DiscoveryCandidate, "reviewStatus"> & {
  reviewStatus: ReviewDecision;
  review?: CandidateReviewDecision;
};

export type ReviewedDiscoveryRun = Omit<DiscoveryRun, "candidates" | "sideEffects"> & {
  candidates: ReviewedDiscoveryCandidate[];
  sideEffects: DiscoveryRun["sideEffects"] & {
    writesApprovedManifest: false;
    allowsEnrichment: false;
  };
};

export type ApprovedManifestEntry = {
  candidateId: string;
  provider: DiscoveryCandidate["provider"];
  title: string;
  url: string;
  normalizedUrl: string;
  approvedAt: string;
  reviewer: string;
};

export type ApprovedManifest = {
  runId: string;
  query: string;
  entries: ApprovedManifestEntry[];
  sideEffects: {
    writesVault: false;
    writesKnowledgeBase: false;
    allowsEnrichment: false;
  };
};

export function applyReviewDecisions(
  run: DiscoveryRun,
  decisions: CandidateReviewDecision[]
): ReviewedDiscoveryRun {
  assertReadyForReview(run);

  const decisionByCandidate = new Map(decisions.map((decision) => [decision.candidateId, decision]));

  return {
    ...run,
    candidates: run.candidates.map((candidate) => {
      const review = decisionByCandidate.get(candidate.id);
      if (!review) {
        return {
          ...candidate,
          reviewStatus: "deferred",
          review: {
            candidateId: candidate.id,
            decision: "deferred",
            reviewer: "system",
            reason: "No review decision was supplied.",
            at: new Date(0).toISOString()
          }
        };
      }

      return {
        ...candidate,
        reviewStatus: review.decision,
        review
      };
    }),
    sideEffects: {
      ...run.sideEffects,
      writesApprovedManifest: false,
      allowsEnrichment: false
    }
  };
}

export function buildApprovedManifest(run: ReviewedDiscoveryRun): ApprovedManifest {
  const entries = run.candidates
    .filter((candidate) => candidate.reviewStatus === "approved")
    .map((candidate) => {
      if (!candidate.review || candidate.review.decision !== "approved") {
        throw new Error(`APPROVED_CANDIDATE_MISSING_REVIEW: ${candidate.id}`);
      }

      return {
        candidateId: candidate.id,
        provider: candidate.provider,
        title: candidate.title,
        url: candidate.url,
        normalizedUrl: candidate.normalizedUrl,
        approvedAt: candidate.review.at,
        reviewer: candidate.review.reviewer
      };
    });

  return {
    runId: run.id,
    query: run.query,
    entries,
    sideEffects: {
      writesVault: false,
      writesKnowledgeBase: false,
      allowsEnrichment: false
    }
  };
}

export function assertNoUnreviewedCandidatesInManifest(
  run: ReviewedDiscoveryRun,
  manifest: ApprovedManifest
): void {
  const approvedIds = new Set(
    run.candidates
      .filter((candidate) => candidate.reviewStatus === "approved")
      .map((candidate) => candidate.id)
  );

  const badEntry = manifest.entries.find((entry) => !approvedIds.has(entry.candidateId));
  if (badEntry) {
    throw new Error(`UNREVIEWED_CANDIDATE_IN_APPROVED_MANIFEST: ${badEntry.candidateId}`);
  }
}

function assertReadyForReview(run: DiscoveryRun) {
  if (run.status !== "WAITING_FOR_HUMAN_REVIEW") {
    throw new Error(`DISCOVERY_NOT_WAITING_FOR_REVIEW: ${run.status}`);
  }
}
