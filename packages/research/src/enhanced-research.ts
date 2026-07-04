import type { ProReaderActionBatch, ProviderId, QueryComplexity } from "./index";

export type ProReaderExecutionProfile = "normal" | "enhanced_research";
export type ProReaderWorkflowPolicy = "disabled" | "explicit_opt_in";
export type ProReaderSubagentRole =
  | "search_worker"
  | "kb_worker"
  | "source_reviewer"
  | "synthesis_reviewer";

export type ProReaderSubagentBatch = {
  batchId: string;
  role: ProReaderSubagentRole;
  providers: ProviderId[];
  stepIds: string[];
  independent: boolean;
  dependsOn: string[];
  prompt: string;
};

export type ProReaderReviewerPlan = {
  role: Extract<ProReaderSubagentRole, "source_reviewer" | "synthesis_reviewer">;
  dependsOn: string[];
  prompt: string;
};

export type ProReaderSubagentPlan = {
  roles: ProReaderSubagentRole[];
  batches: ProReaderSubagentBatch[];
  reviewers: ProReaderReviewerPlan[];
  reviewRequired: true;
  instructions: string[];
};

export function isEnhancedResearchRequested(query: string) {
  return /火力全开|增強模式|增强模式|深度研究|deep research|enhanced research|full power/i.test(query);
}

export function chooseExecutionProfile(input: {
  query: string;
  complexity: QueryComplexity;
  batches: ProReaderActionBatch[];
}): ProReaderExecutionProfile {
  if (!isEnhancedResearchRequested(input.query)) return "normal";
  if (input.complexity === "no_search" || input.complexity === "single_external_search") return "normal";
  return input.batches.some((batch) => batch.independent) ? "enhanced_research" : "normal";
}

export function buildSubagentPlan(input: {
  query: string;
  batches: ProReaderActionBatch[];
}): ProReaderSubagentPlan | undefined {
  const executableBatches = input.batches.filter((batch) => batch.independent);
  if (executableBatches.length === 0) return undefined;

  const batches = executableBatches.map((batch): ProReaderSubagentBatch => ({
    batchId: batch.id,
    role: chooseWorkerRole(batch.providers),
    providers: batch.providers,
    stepIds: batch.stepIds,
    independent: batch.independent,
    dependsOn: batch.dependsOn,
    prompt: buildWorkerPrompt(input.query, batch),
  }));

  return {
    roles: ["search_worker", "kb_worker", "source_reviewer", "synthesis_reviewer"],
    batches,
    reviewers: [
      {
        role: "source_reviewer",
        dependsOn: batches.map((batch) => batch.batchId),
        prompt: buildSourceReviewerPrompt(input.query, batches),
      },
      {
        role: "synthesis_reviewer",
        dependsOn: ["source_reviewer"],
        prompt: buildSynthesisReviewerPrompt(input.query, batches),
      },
    ],
    reviewRequired: true,
    instructions: [
      "Subagents execute only the assigned ProReader batch; they must not change the route.",
      "Subagents must not write vault, kb, sqlite, or other formal knowledge stores.",
      "Worker output must include structured evidence, candidates, uncertainty, and source notes.",
      "Reviewer roles must inspect source authority, duplication, contamination, coverage, and over-searching before final synthesis.",
    ],
  };
}

function chooseWorkerRole(providers: ProviderId[]): ProReaderSubagentRole {
  if (providers.every((provider) => provider === "llm_wiki_lite")) return "kb_worker";
  return "search_worker";
}

function buildWorkerPrompt(query: string, batch: ProReaderActionBatch) {
  return [
    "You are a Browser Code ProReader enhanced-research subagent.",
    `Original query: ${query}`,
    `Assigned batch: ${batch.id} (${batch.label})`,
    `Allowed providers: ${batch.providers.join(", ")}`,
    `Allowed step ids: ${batch.stepIds.join(", ")}`,
    "Do not change the ProReader route or introduce unselected providers.",
    "Do not write vault, kb, sqlite, or any formal knowledge store.",
    "Return structured sections: evidence, candidates, uncertainty, source_notes.",
    `Evaluation criteria: ${batch.evaluationCriteria.join(" | ")}`,
  ].join("\n");
}

function buildSourceReviewerPrompt(query: string, batches: ProReaderSubagentBatch[]) {
  return [
    "You are the Browser Code ProReader source_reviewer.",
    `Original query: ${query}`,
    `Review worker batches: ${batches.map((batch) => batch.batchId).join(", ")}`,
    "Check source authority, duplication, platform/content contamination, evidence strength, and whether the sources match the ProReader route.",
    "Do not change the route, fetch unrelated sources, or write vault/kb/sqlite.",
    "Return structured sections: accepted_sources, rejected_sources, duplicate_clusters, uncertainty, review_notes.",
  ].join("\n");
}

function buildSynthesisReviewerPrompt(query: string, batches: ProReaderSubagentBatch[]) {
  return [
    "You are the Browser Code ProReader synthesis_reviewer.",
    `Original query: ${query}`,
    `Review worker batches: ${batches.map((batch) => batch.batchId).join(", ")}`,
    "Check whether the draft answer covers the user question, stays inside the ProReader route, avoids over-searching, and cites evidence clearly.",
    "Do not change the route, fetch unrelated sources, or write vault/kb/sqlite.",
    "Return structured sections: coverage_gaps, over_search_risk, citation_issues, final_synthesis_notes.",
  ].join("\n");
}
