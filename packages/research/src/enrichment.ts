import type { ApprovedManifest } from "./review";

export type EnrichmentStepKind =
  | "metadata"
  | "transcript"
  | "danmaku"
  | "comments"
  | "page_fetch"
  | "repository_context"
  | "audio_extraction";

export type EnrichmentRisk = "low" | "medium" | "high";

export type EnrichmentStep = {
  id: string;
  candidateId: string;
  kind: EnrichmentStepKind;
  tool: string;
  input: Record<string, unknown>;
  risk: EnrichmentRisk;
  requiresApproval: boolean;
  blockedByDefault: boolean;
  outputDir: string;
};

export type EnrichmentPlan = {
  runId: string;
  query: string;
  steps: EnrichmentStep[];
  sideEffects: {
    writesVault: false;
    writesKnowledgeBase: false;
    downloadsMediaByDefault: false;
  };
};

export type EnrichmentMcpToolConfig = {
  bilibiliVideoInfo?: {
    enabled?: boolean;
    server?: string;
    tools?: {
      getSubtitle?: string;
      getDanmaku?: string;
      getComments?: string;
    };
  };
};

export function planEnrichmentFromApprovedManifest(
  manifest: ApprovedManifest,
  mcpConfig: EnrichmentMcpToolConfig = {}
): EnrichmentPlan {
  assertEnrichmentUsesApprovedManifest(manifest);

  return {
    runId: manifest.runId,
    query: manifest.query,
    steps: manifest.entries.flatMap((entry) => buildStepsForEntry(manifest.runId, entry.candidateId, entry.url, mcpConfig)),
    sideEffects: {
      writesVault: false,
      writesKnowledgeBase: false,
      downloadsMediaByDefault: false
    }
  };
}

export function assertEnrichmentUsesApprovedManifest(manifest: ApprovedManifest): void {
  if (manifest.entries.length === 0) {
    throw new Error("ENRICHMENT_REQUIRES_APPROVED_MANIFEST_ENTRIES");
  }
}

function buildStepsForEntry(
  runId: string,
  candidateId: string,
  url: string,
  mcpConfig: EnrichmentMcpToolConfig
): EnrichmentStep[] {
  const outputDir = `.tmp/discovery/runs/${runId}/enrichment/${candidateId}`;

  if (isVideoUrl(url)) {
    const steps: EnrichmentStep[] = [
      {
        id: `${candidateId}-video-metadata`,
        candidateId,
        kind: "metadata",
        tool: "yt-dlp",
        input: {
          url,
          noDownload: true,
          output: `${outputDir}/metadata.json`
        },
        risk: "medium",
        requiresApproval: true,
        blockedByDefault: false,
        outputDir
      },
      {
        id: `${candidateId}-fetch-transcript`,
        candidateId,
        kind: "transcript",
        tool: "fetch_transcript",
        input: {
          url,
          output: `${outputDir}/transcript.json`
        },
        risk: "medium",
        requiresApproval: true,
        blockedByDefault: false,
        outputDir
      },
      {
        id: `${candidateId}-audio-extraction-fallback`,
        candidateId,
        kind: "audio_extraction",
        tool: "ffmpeg_extract_audio",
        input: {
          url,
          output: `${outputDir}/audio`
        },
        risk: "high",
        requiresApproval: true,
        blockedByDefault: true,
        outputDir
      }
    ];

    if (isBilibiliUrl(url)) {
      const bilibiliTools = mcpConfig.bilibiliVideoInfo?.tools ?? {};
      steps.splice(2, 0,
        {
          id: `${candidateId}-bilibili-subtitles`,
          candidateId,
          kind: "transcript",
          tool: "platform_mcp",
          input: {
            url,
            provider: "bilibili_video_info_mcp",
            capability: "subtitles",
            toolName: bilibiliTools.getSubtitle ?? "get_subtitles",
            output: `${outputDir}/bilibili_subtitles.json`
          },
          risk: "medium",
          requiresApproval: true,
          blockedByDefault: false,
          outputDir
        },
        {
          id: `${candidateId}-bilibili-danmaku`,
          candidateId,
          kind: "danmaku",
          tool: "platform_mcp",
          input: {
            url,
            provider: "bilibili_video_info_mcp",
            capability: "danmaku",
            toolName: bilibiliTools.getDanmaku ?? "get_danmaku",
            output: `${outputDir}/danmaku.json`
          },
          risk: "medium",
          requiresApproval: true,
          blockedByDefault: false,
          outputDir
        },
        {
          id: `${candidateId}-bilibili-comments`,
          candidateId,
          kind: "comments",
          tool: "platform_mcp",
          input: {
            url,
            provider: "bilibili_video_info_mcp",
            capability: "comments",
            toolName: bilibiliTools.getComments ?? "get_comments",
            output: `${outputDir}/comments.json`
          },
          risk: "medium",
          requiresApproval: true,
          blockedByDefault: false,
          outputDir
        }
      );
    }

    return steps;
  }

  if (isGitHubUrl(url)) {
    return [
      {
        id: `${candidateId}-repository-context`,
        candidateId,
        kind: "repository_context",
        tool: "github",
        input: {
          url,
          output: `${outputDir}/repository_context.json`
        },
        risk: "medium",
        requiresApproval: true,
        blockedByDefault: false,
        outputDir
      }
    ];
  }

  return [
    {
      id: `${candidateId}-page-fetch`,
      candidateId,
      kind: "page_fetch",
      tool: "webfetch",
      input: {
        url,
        output: `${outputDir}/page.md`
      },
      risk: "medium",
      requiresApproval: true,
      blockedByDefault: false,
      outputDir
    }
  ];
}

function isVideoUrl(url: string) {
  return /youtube\.com|youtu\.be|bilibili\.com|douyin\.com|xiaohongshu\.com|tiktok\.com/i.test(url);
}

function isBilibiliUrl(url: string) {
  return /bilibili\.com/i.test(url);
}

function isGitHubUrl(url: string) {
  return /github\.com/i.test(url);
}
