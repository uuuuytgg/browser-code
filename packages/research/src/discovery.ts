import type { ProviderId, ProviderPlan, ProviderStep, QueryRoute, ResearchCandidate } from "./index";

export type DiscoveryRunStatus =
  | "CREATED"
  | "SEARCH_PLANNED"
  | "CANDIDATES_COLLECTED"
  | "CANDIDATES_DEDUPED"
  | "CANDIDATES_RANKED"
  | "RISK_SCANNED"
  | "WAITING_FOR_HUMAN_REVIEW";

export type BlockedDiscoveryFutureStatus =
  | "APPROVED"
  | "REJECTED"
  | "DEFERRED"
  | "ENRICHING"
  | "EVIDENCE_READY"
  | "INGEST_MANIFEST_READY"
  | "HANDED_OFF_TO_VAULT";

export type DiscoveryTransitionTarget = DiscoveryRunStatus | BlockedDiscoveryFutureStatus;

export type DiscoveryAuditEvent = {
  status: DiscoveryRunStatus;
  message: string;
  at: string;
};

export type DiscoveryRiskLevel = "low" | "medium" | "high";

export type DiscoveryRiskSignal = {
  level: DiscoveryRiskLevel;
  reason: string;
};

export type DiscoveryCandidate = ResearchCandidate & {
  provider: ProviderId;
  normalizedUrl: string;
  rankScore: number;
  riskSignals: DiscoveryRiskSignal[];
  reviewStatus: "pending";
};

export type DiscoveryRun = {
  id: string;
  query: string;
  route: QueryRoute;
  plan: ProviderPlan;
  status: DiscoveryRunStatus;
  candidates: DiscoveryCandidate[];
  auditLog: DiscoveryAuditEvent[];
  sideEffects: {
    writesVault: false;
    writesKnowledgeBase: false;
    writesApprovedManifest: false;
    allowsEnrichment: false;
  };
};

export type RawDiscoveryCandidate = {
  provider: ProviderId;
  title: string;
  url: string;
  summary?: string;
};

export function createDiscoveryRun(args: {
  id: string;
  query: string;
  route: QueryRoute;
  plan: ProviderPlan;
  now?: string;
}): DiscoveryRun {
  assertDiscoveryRoute(args.route);

  return {
    id: args.id,
    query: args.query,
    route: args.route,
    plan: args.plan,
    status: "SEARCH_PLANNED",
    candidates: [],
    auditLog: [
      {
        status: "SEARCH_PLANNED",
        message: `Planned ${args.plan.steps.length} discovery provider steps.`,
        at: args.now ?? new Date(0).toISOString()
      }
    ],
    sideEffects: {
      writesVault: false,
      writesKnowledgeBase: false,
      writesApprovedManifest: false,
      allowsEnrichment: false
    }
  };
}

export function collectDiscoveryCandidates(
  run: DiscoveryRun,
  rawCandidates: RawDiscoveryCandidate[],
  now = new Date(0).toISOString()
): DiscoveryRun {
  assertStatus(run, "SEARCH_PLANNED");

  return {
    ...run,
    status: "CANDIDATES_COLLECTED",
    candidates: rawCandidates.map((candidate, index) => normalizeCandidate(candidate, index)),
    auditLog: appendAudit(run, "CANDIDATES_COLLECTED", `Collected ${rawCandidates.length} raw candidates.`, now)
  };
}

export function dedupeDiscoveryCandidates(run: DiscoveryRun, now = new Date(0).toISOString()): DiscoveryRun {
  assertStatus(run, "CANDIDATES_COLLECTED");

  const seen = new Set<string>();
  const candidates = run.candidates.filter((candidate) => {
    if (seen.has(candidate.normalizedUrl)) return false;
    seen.add(candidate.normalizedUrl);
    return true;
  });

  return {
    ...run,
    status: "CANDIDATES_DEDUPED",
    candidates,
    auditLog: appendAudit(run, "CANDIDATES_DEDUPED", `Deduped to ${candidates.length} candidates.`, now)
  };
}

export function rankDiscoveryCandidates(run: DiscoveryRun, now = new Date(0).toISOString()): DiscoveryRun {
  assertStatus(run, "CANDIDATES_DEDUPED");

  const candidates = run.candidates
    .map((candidate) => ({
      ...candidate,
      rankScore: scoreCandidate(candidate)
    }))
    .sort((a, b) => b.rankScore - a.rankScore || a.title.localeCompare(b.title));

  return {
    ...run,
    status: "CANDIDATES_RANKED",
    candidates,
    auditLog: appendAudit(run, "CANDIDATES_RANKED", `Ranked ${candidates.length} candidates.`, now)
  };
}

export function scanDiscoveryRisks(run: DiscoveryRun, now = new Date(0).toISOString()): DiscoveryRun {
  assertStatus(run, "CANDIDATES_RANKED");

  const candidates = run.candidates.map((candidate) => ({
    ...candidate,
    riskSignals: buildRiskSignals(candidate)
  }));

  return {
    ...run,
    status: "RISK_SCANNED",
    candidates,
    auditLog: appendAudit(run, "RISK_SCANNED", `Risk scanned ${candidates.length} candidates.`, now)
  };
}

export function stopAtHumanReview(run: DiscoveryRun, now = new Date(0).toISOString()): DiscoveryRun {
  assertStatus(run, "RISK_SCANNED");

  return {
    ...run,
    status: "WAITING_FOR_HUMAN_REVIEW",
    candidates: run.candidates.map((candidate) => ({
      ...candidate,
      needsReview: true,
      reviewStatus: "pending"
    })),
    auditLog: appendAudit(run, "WAITING_FOR_HUMAN_REVIEW", "Stopped before enrichment and formal ingest.", now)
  };
}

export function buildDiscoveryCandidatePool(args: {
  run: DiscoveryRun;
  rawCandidates: RawDiscoveryCandidate[];
  now?: string;
}): DiscoveryRun {
  const collected = collectDiscoveryCandidates(args.run, args.rawCandidates, args.now);
  const deduped = dedupeDiscoveryCandidates(collected, args.now);
  const ranked = rankDiscoveryCandidates(deduped, args.now);
  const scanned = scanDiscoveryRisks(ranked, args.now);
  return stopAtHumanReview(scanned, args.now);
}

export function assertNoDiscoveryEnrichment(run: DiscoveryRun): void {
  if (run.status !== "WAITING_FOR_HUMAN_REVIEW") {
    throw new Error(`DISCOVERY_NOT_READY_FOR_REVIEW: ${run.status}`);
  }

  throw new Error("DISCOVERY_ENRICHMENT_BLOCKED_UNTIL_HUMAN_REVIEW");
}

export function assertProviderPlanIsSearchOnly(plan: ProviderPlan): void {
  const unsafeStep = plan.steps.find((step) => step.action !== "search");
  if (unsafeStep) {
    throw new Error(`DISCOVERY_PLAN_CONTAINS_NON_SEARCH_STEP: ${unsafeStep.id}`);
  }
}

export function transitionDiscoveryRun(
  run: DiscoveryRun,
  target: DiscoveryTransitionTarget,
  now = new Date(0).toISOString()
): DiscoveryRun {
  if (isBlockedFutureStatus(target)) {
    throw new Error(`DISCOVERY_TRANSITION_BLOCKED_BEFORE_HUMAN_REVIEW: ${run.status}->${target}`);
  }

  switch (target) {
    case "CANDIDATES_COLLECTED":
      throw new Error("USE_collectDiscoveryCandidates_FOR_CANDIDATES_COLLECTED");
    case "CANDIDATES_DEDUPED":
      return dedupeDiscoveryCandidates(run, now);
    case "CANDIDATES_RANKED":
      return rankDiscoveryCandidates(run, now);
    case "RISK_SCANNED":
      return scanDiscoveryRisks(run, now);
    case "WAITING_FOR_HUMAN_REVIEW":
      return stopAtHumanReview(run, now);
    case "CREATED":
    case "SEARCH_PLANNED":
      throw new Error(`INVALID_DISCOVERY_TRANSITION_TARGET: ${target}`);
  }
}

function normalizeCandidate(candidate: RawDiscoveryCandidate, index: number): DiscoveryCandidate {
  const normalizedUrl = normalizeUrl(candidate.url);

  return {
    id: `${candidate.provider}-${index + 1}`,
    provider: candidate.provider,
    title: candidate.title.trim(),
    url: candidate.url,
    normalizedUrl,
    summary: candidate.summary,
    needsReview: true,
    rankScore: 0,
    riskSignals: [],
    reviewStatus: "pending"
  };
}

function isBlockedFutureStatus(target: DiscoveryTransitionTarget): target is BlockedDiscoveryFutureStatus {
  return target === "APPROVED"
    || target === "REJECTED"
    || target === "DEFERRED"
    || target === "ENRICHING"
    || target === "EVIDENCE_READY"
    || target === "INGEST_MANIFEST_READY"
    || target === "HANDED_OFF_TO_VAULT";
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

function scoreCandidate(candidate: DiscoveryCandidate) {
  let score = 0;
  if (candidate.title) score += 10;
  if (candidate.summary) score += Math.min(10, Math.ceil(candidate.summary.length / 80));
  if (candidate.provider !== "websearch") score += 5;
  return score;
}

function buildRiskSignals(candidate: DiscoveryCandidate): DiscoveryRiskSignal[] {
  const signals: DiscoveryRiskSignal[] = [];
  const text = `${candidate.title} ${candidate.summary ?? ""}`.toLowerCase();

  if (/comment|danmaku|弹幕|评论|transcript|subtitle|字幕/.test(text)) {
    signals.push({
      level: "medium",
      reason: "Deep content such as comments, danmaku, transcript, or subtitles requires review before enrichment."
    });
  }

  if (!candidate.normalizedUrl.startsWith("http://") && !candidate.normalizedUrl.startsWith("https://")) {
    signals.push({
      level: "high",
      reason: "Candidate URL is not an HTTP(S) URL."
    });
  }

  return signals.length > 0 ? signals : [{ level: "low", reason: "Metadata-only candidate." }];
}

function assertDiscoveryRoute(route: QueryRoute) {
  if (route.mode !== "discovery_ingest" || !route.requiresHumanReview) {
    throw new Error(`NOT_DISCOVERY_ROUTE: ${route.intent}`);
  }
}

function assertStatus(run: DiscoveryRun, expected: DiscoveryRunStatus) {
  if (run.status !== expected) {
    throw new Error(`INVALID_DISCOVERY_TRANSITION: expected ${expected}, got ${run.status}`);
  }
}

function appendAudit(
  run: DiscoveryRun,
  status: DiscoveryRunStatus,
  message: string,
  at: string
): DiscoveryAuditEvent[] {
  return [
    ...run.auditLog,
    {
      status,
      message,
      at
    }
  ];
}
