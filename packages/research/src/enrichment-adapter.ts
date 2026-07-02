import type { EnrichmentPlan, EnrichmentStep } from "./enrichment";

export type EnrichmentExecutionTool =
  | "fetch_transcript"
  | "ffmpeg_extract_audio"
  | "webfetch"
  | "github"
  | "platform_mcp"
  | "yt-dlp";

export type EnrichmentExecutionCapability =
  | "video_metadata_probe"
  | "transcript_fetch"
  | "audio_extract_fallback"
  | "web_page_fetch"
  | "github_repository_context"
  | "platform_danmaku"
  | "platform_comments";

export type EnrichmentExecutionRequest = {
  id: string;
  runId: string;
  stepId: string;
  candidateId: string;
  source: "approved_enrichment_plan";
  tool: EnrichmentExecutionTool;
  capability: EnrichmentExecutionCapability;
  input: Record<string, unknown>;
  outputDir: string;
  requiresApproval: boolean;
  blockedByDefault: boolean;
  writesVault: false;
  writesKnowledgeBase: false;
  noDownload: boolean;
};

const APPROVED_ENRICHMENT_TOOLS = new Set<EnrichmentExecutionTool>([
  "fetch_transcript",
  "ffmpeg_extract_audio",
  "webfetch",
  "github",
  "platform_mcp",
  "yt-dlp"
]);

const FORBIDDEN_EXECUTION_TOOLS = new Set([
  "run_shell",
  "execute_command",
  "eval_js",
  "run_python"
]);

export function buildEnrichmentExecutionRequests(plan: EnrichmentPlan): EnrichmentExecutionRequest[] {
  assertApprovedEnrichmentPlan(plan);

  return plan.steps.map((step) => buildRequestForStep(plan.runId, step));
}

export const prepareEnrichmentExecution = buildEnrichmentExecutionRequests;

function buildRequestForStep(runId: string, step: EnrichmentStep): EnrichmentExecutionRequest {
  assertApprovedStep(runId, step);

  return {
    id: `${step.id}-execution`,
    runId,
    stepId: step.id,
    candidateId: step.candidateId,
    source: "approved_enrichment_plan",
    tool: step.tool as EnrichmentExecutionTool,
    capability: inferCapability(step),
    input: normalizeInput(step),
    outputDir: step.outputDir,
    requiresApproval: step.requiresApproval,
    blockedByDefault: step.blockedByDefault,
    writesVault: false,
    writesKnowledgeBase: false,
    noDownload: step.tool === "yt-dlp"
  };
}

function assertApprovedEnrichmentPlan(plan: EnrichmentPlan): void {
  if (plan.sideEffects.writesVault || plan.sideEffects.writesKnowledgeBase) {
    throw new Error("ENRICHMENT_EXECUTION_REQUIRES_DRY_RUN_PLAN");
  }

  if (plan.sideEffects.downloadsMediaByDefault) {
    throw new Error("ENRICHMENT_EXECUTION_REFUSES_DEFAULT_MEDIA_DOWNLOADS");
  }
}

function assertApprovedStep(runId: string, step: EnrichmentStep): void {
  if (FORBIDDEN_EXECUTION_TOOLS.has(step.tool)) {
    throw new Error(`ENRICHMENT_EXECUTION_FORBIDDEN_TOOL: ${step.tool}`);
  }

  if (!APPROVED_ENRICHMENT_TOOLS.has(step.tool as EnrichmentExecutionTool)) {
    throw new Error(`ENRICHMENT_EXECUTION_UNKNOWN_TOOL: ${step.tool}`);
  }

  if (!step.requiresApproval) {
    throw new Error(`ENRICHMENT_EXECUTION_REQUIRES_APPROVAL: ${step.id}`);
  }

  const expectedPrefix = `.tmp/discovery/runs/${runId}/enrichment/`;
  if (!step.outputDir.startsWith(expectedPrefix)) {
    throw new Error(`ENRICHMENT_EXECUTION_OUTPUT_OUTSIDE_RUN_TMP: ${step.id}`);
  }

  if (step.tool === "ffmpeg_extract_audio" && (!step.blockedByDefault || !step.requiresApproval)) {
    throw new Error(`ENRICHMENT_EXECUTION_AUDIO_EXTRACTION_MUST_BE_BLOCKED: ${step.id}`);
  }

  if (step.tool === "yt-dlp" && step.input.noDownload !== true) {
    throw new Error(`ENRICHMENT_EXECUTION_YTDLP_MUST_BE_METADATA_ONLY: ${step.id}`);
  }
}

function inferCapability(step: EnrichmentStep): EnrichmentExecutionCapability {
  if (step.tool === "yt-dlp") return "video_metadata_probe";
  if (step.tool === "fetch_transcript") return "transcript_fetch";
  if (step.tool === "ffmpeg_extract_audio") return "audio_extract_fallback";
  if (step.tool === "webfetch") return "web_page_fetch";
  if (step.tool === "github") return "github_repository_context";

  if (step.tool === "platform_mcp") {
    if (step.kind === "transcript") return "transcript_fetch";
    if (step.kind === "danmaku") return "platform_danmaku";
    if (step.kind === "comments") return "platform_comments";
  }

  throw new Error(`ENRICHMENT_EXECUTION_UNMAPPED_STEP: ${step.id}`);
}

function normalizeInput(step: EnrichmentStep): Record<string, unknown> {
  if (step.tool === "yt-dlp") {
    return {
      ...step.input,
      noDownload: true
    };
  }

  return { ...step.input };
}
