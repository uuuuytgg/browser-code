import type { VaultContentType, VideoPlatform } from "@ska/schemas";
import { scanPageResourcesToolSpec } from "@ska/tool-resource";
import { saveMarkdownNoteToolSpec } from "@ska/tool-vault";
import {
  detectVideoPlatform,
  fetchTranscriptToolSpec,
  ffmpegExtractAudioToolSpec
} from "@ska/tool-video";
import { webToMarkdownToolSpec } from "@ska/tool-web";

export type ResearchRoute =
  | "local_answer"
  | "direct_url_ingest"
  | "external_discovery"
  | "github_research"
  | "video_discovery";

export type ProviderKind =
  | "llm_wiki_lite"
  | "direct_url_existing_ingest"
  | "github_database"
  | "official_docs"
  | "web_discovery"
  | "video_discovery";

export type DirectUrlAdapterKind = "video" | "web" | "resource";

export type ResearchRequest = {
  query: string;
  url?: string;
  intent?: "answer" | "discover" | "ingest";
};

export type ProviderPlan = {
  route: ResearchRoute;
  providers: ProviderKind[];
  reviewRequired: boolean;
  writesVaultDirectly: false;
  directUrlAdapter?: DirectUrlAdapterPlan;
  notes: string[];
};

export type DirectUrlAdapterPlan = {
  kind: DirectUrlAdapterKind;
  url: string;
  platform?: VideoPlatform;
  contentType: VaultContentType;
  usesExistingTools: string[];
  handoff: "existing_ingest_pipeline";
};

export type ResearchCandidate = {
  id: string;
  provider: ProviderKind;
  title: string;
  url: string;
  summary?: string;
  needsReview: boolean;
};

export type EvidencePack = {
  candidate: ResearchCandidate;
  evidenceMarkdown: string;
  sourceUrls: string[];
  preparedContentType?: VaultContentType;
};

export function planResearch(request: ResearchRequest): ProviderPlan {
  if (request.url) {
    return planDirectUrl(request.url);
  }

  const query = request.query.trim();
  if (isGithubResearchQuery(query)) {
    return {
      route: "github_research",
      providers: ["github_database", "official_docs", "web_discovery"],
      reviewRequired: true,
      writesVaultDirectly: false,
      notes: [
        "Use GitHub API/gh/cache as the primary discovery source.",
        "Do not write vault until a candidate is approved."
      ]
    };
  }

  if (isVideoDiscoveryQuery(query)) {
    return {
      route: "video_discovery",
      providers: ["video_discovery", "web_discovery"],
      reviewRequired: true,
      writesVaultDirectly: false,
      notes: [
        "Discovery only returns candidate video URLs.",
        "Approved URLs must hand off to the existing direct video ingest path."
      ]
    };
  }

  if (request.intent === "discover") {
    return {
      route: "external_discovery",
      providers: ["official_docs", "web_discovery", "github_database"],
      reviewRequired: true,
      writesVaultDirectly: false,
      notes: [
        "External discovery prepares candidates for human review.",
        "Formal knowledge enters through the existing classified vault ingest flow."
      ]
    };
  }

  return {
    route: "local_answer",
    providers: ["llm_wiki_lite"],
    reviewRequired: false,
    writesVaultDirectly: false,
    notes: [
      "Answer from LLM Wiki Lite answer_context.",
      "Do not scan raw vault files as the default local answer path."
    ]
  };
}

export function planDirectUrl(url: string): ProviderPlan {
  const parsed = new URL(url);
  const platform = detectVideoPlatform(url);

  if (platform !== "unknown") {
    return {
      route: "direct_url_ingest",
      providers: ["direct_url_existing_ingest"],
      reviewRequired: true,
      writesVaultDirectly: false,
      directUrlAdapter: {
        kind: "video",
        url,
        platform,
        contentType: "video",
        usesExistingTools: [
          fetchTranscriptToolSpec.name,
          ffmpegExtractAudioToolSpec.name,
          saveMarkdownNoteToolSpec.name
        ],
        handoff: "existing_ingest_pipeline"
      },
      notes: [
        "Do not implement a new video downloader or transcript fetcher here.",
        "Route approved direct video URLs to the existing video and vault tools."
      ]
    };
  }

  if (looksLikeDirectResource(parsed)) {
    return {
      route: "direct_url_ingest",
      providers: ["direct_url_existing_ingest"],
      reviewRequired: true,
      writesVaultDirectly: false,
      directUrlAdapter: {
        kind: "resource",
        url,
        contentType: "resource",
        usesExistingTools: [
          scanPageResourcesToolSpec.name,
          saveMarkdownNoteToolSpec.name
        ],
        handoff: "existing_ingest_pipeline"
      },
      notes: [
        "Treat direct resource URLs as existing resource/vault tool handoffs.",
        "Do not download high-risk media from the research provider layer."
      ]
    };
  }

  return {
    route: "direct_url_ingest",
    providers: ["direct_url_existing_ingest"],
    reviewRequired: false,
    writesVaultDirectly: false,
    directUrlAdapter: {
      kind: "web",
      url,
      contentType: "article",
      usesExistingTools: [
        webToMarkdownToolSpec.name,
        saveMarkdownNoteToolSpec.name
      ],
      handoff: "existing_ingest_pipeline"
    },
    notes: [
      "Use the existing web_to_markdown and save_markdown_note tools.",
      "The research layer only plans the handoff; it does not fetch or persist by itself."
    ]
  };
}

function isGithubResearchQuery(query: string) {
  return /\b(github|repo|repository|issue|pull request|pr|code search|release)\b/i.test(query);
}

function isVideoDiscoveryQuery(query: string) {
  return /\b(youtube|bilibili|video|字幕|视频|b站)\b/i.test(query);
}

function looksLikeDirectResource(url: URL) {
  return /\.(pdf|docx?|pptx?|xlsx?|zip|rar|7z|tar|gz)$/i.test(url.pathname);
}
