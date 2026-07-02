import type { DiscoveryCandidate, DiscoveryRun } from "./discovery";
import {
  applyReviewDecisions,
  assertNoUnreviewedCandidatesInManifest,
  buildApprovedManifest
} from "./review";
import type {
  ApprovedManifest,
  CandidateReviewDecision,
  ReviewedDiscoveryRun,
  ReviewDecision
} from "./review";

export type ReviewSessionStatus = "open" | "reviewed";

export type ReviewItem = {
  candidateId: string;
  provider: DiscoveryCandidate["provider"];
  title: string;
  url: string;
  normalizedUrl: string;
  rankScore: number;
  riskSignals: DiscoveryCandidate["riskSignals"];
  reviewStatus: DiscoveryCandidate["reviewStatus"] | ReviewDecision;
};

export type ReviewSession = {
  id: string;
  runId: string;
  query: string;
  status: ReviewSessionStatus;
  run: DiscoveryRun;
  reviewedRun?: ReviewedDiscoveryRun;
  approvedManifest?: ApprovedManifest;
  sideEffects: {
    writesVault: false;
    writesKnowledgeBase: false;
    writesApprovedManifest: false;
    allowsEnrichment: false;
  };
};

export type ReviewActionResult = {
  session: ReviewSession;
  reviewedRun: ReviewedDiscoveryRun;
  approvedManifest: ApprovedManifest;
};

export function createReviewSession(run: DiscoveryRun, id = `review-${run.id}`): ReviewSession {
  assertWaitingForHumanReview(run);

  return {
    id,
    runId: run.id,
    query: run.query,
    status: "open",
    run,
    sideEffects: noReviewServiceSideEffects()
  };
}

export function listReviewItems(session: ReviewSession): ReviewItem[] {
  const candidates = session.reviewedRun?.candidates ?? session.run.candidates;

  return candidates.map((candidate) => ({
    candidateId: candidate.id,
    provider: candidate.provider,
    title: candidate.title,
    url: candidate.url,
    normalizedUrl: candidate.normalizedUrl,
    rankScore: candidate.rankScore,
    riskSignals: candidate.riskSignals,
    reviewStatus: candidate.reviewStatus
  }));
}

export function applyReviewActions(
  session: ReviewSession,
  decisions: CandidateReviewDecision[]
): ReviewActionResult {
  const reviewedRun = applyReviewDecisions(session.run, decisions);
  const approvedManifest = buildApprovedManifest(reviewedRun);
  assertNoUnreviewedCandidatesInManifest(reviewedRun, approvedManifest);

  return {
    session: {
      ...session,
      status: "reviewed",
      reviewedRun,
      approvedManifest,
      sideEffects: noReviewServiceSideEffects()
    },
    reviewedRun,
    approvedManifest
  };
}

export function buildReviewedManifest(
  run: DiscoveryRun,
  decisions: CandidateReviewDecision[],
  sessionId?: string
): ReviewActionResult {
  return applyReviewActions(createReviewSession(run, sessionId), decisions);
}

function assertWaitingForHumanReview(run: DiscoveryRun) {
  if (run.status !== "WAITING_FOR_HUMAN_REVIEW") {
    throw new Error(`DISCOVERY_NOT_WAITING_FOR_REVIEW: ${run.status}`);
  }
}

function noReviewServiceSideEffects(): ReviewSession["sideEffects"] {
  return {
    writesVault: false,
    writesKnowledgeBase: false,
    writesApprovedManifest: false,
    allowsEnrichment: false
  };
}
