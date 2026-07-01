import { z } from "zod";

export const AgentModeSchema = z.enum([
  "reader",
  "curator",
  "media",
  "resource",
  "librarian"
]);

export type AgentMode = z.infer<typeof AgentModeSchema>;

export const ToolRiskSchema = z.enum(["low", "medium", "high", "critical"]);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const TaskStatusSchema = z.enum([
  "idle",
  "capturing",
  "sending",
  "processing",
  "need_confirmation",
  "done",
  "error"
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const PageLinkSchema = z.object({
  text: z.string(),
  href: z.string().url()
});

export const PageMediaSchema = z.object({
  type: z.string(),
  src: z.string().url()
});

export const CaptureTaskSchema = z.object({
  task_id: z.string().min(1),
  task_type: z.enum([
    "save_page",
    "summarize_video",
    "scan_resources",
    "save_selection",
    "search_vault",
    "chat"
  ]),
  page: z.object({
    url: z.string().url(),
    title: z.string(),
    platform: z.enum(["youtube", "bilibili", "web", "unknown"]).optional(),
    html: z.string().optional(),
    selected_text: z.string().optional(),
    links: z.array(PageLinkSchema).optional(),
    media: z.array(PageMediaSchema).optional(),
    meta: z.record(z.string(), z.string()).optional()
  }),
  user_instruction: z.string().optional(),
  created_at: z.string().datetime({ offset: true })
});
export type CaptureTask = z.infer<typeof CaptureTaskSchema>;

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown()
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  recoverable: z.boolean()
});

export const ToolResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ok: z.boolean(),
  output: z.unknown().optional(),
  error: ToolErrorSchema.optional()
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const WebToMarkdownInputSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  html: z.string(),
  selected_text: z.string().nullable().optional(),
  mode: z.enum(["readability", "selection", "full"]).optional()
});
export type WebToMarkdownInput = z.infer<typeof WebToMarkdownInputSchema>;

export const WebResourceSchema = z.object({
  type: z.enum(["image", "link", "document", "media", "unknown"]),
  url: z.string().url(),
  text: z.string().optional()
});
export type WebResource = z.infer<typeof WebResourceSchema>;

export const WebToMarkdownOutputSchema = z.object({
  markdown: z.string(),
  metadata: z.object({
    title: z.string(),
    source_url: z.string().url(),
    byline: z.string().optional(),
    excerpt: z.string().optional(),
    site_name: z.string().optional(),
    language: z.string().optional()
  }),
  resources: z.array(WebResourceSchema),
  quality: z.object({
    word_count: z.number().int().nonnegative(),
    extraction_method: z.enum(["readability", "selection", "full"]),
    is_probably_article: z.boolean()
  })
});
export type WebToMarkdownOutput = z.infer<typeof WebToMarkdownOutputSchema>;

const RunAgentTaskStatusSchema = z.enum(["done", "error", "need_confirmation"]);

export const RunAgentTaskResultSchema = z.object({
  status: RunAgentTaskStatusSchema,
  answer: z.record(z.string(), z.unknown()).optional(),
  pendingToolCall: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      input: z.unknown()
    })
    .optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1)
    })
    .optional()
});
export type RunAgentTaskResult = z.infer<typeof RunAgentTaskResultSchema>;

export const VaultContentTypeSchema = z.enum([
  "article",
  "video",
  "document",
  "snippet",
  "resource"
]);
export type VaultContentType = z.infer<typeof VaultContentTypeSchema>;

export const SaveMarkdownNoteInputSchema = z.object({
  markdown: z.string(),
  metadata: z.object({
    title: z.string(),
    source_url: z.string().url(),
    source_platform: z.string().optional(),
    tags: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional()
  }),
  content_type: VaultContentTypeSchema,
  source_url: z.string().url()
});
export type SaveMarkdownNoteInput = z.infer<typeof SaveMarkdownNoteInputSchema>;

export const SaveMarkdownNoteOutputSchema = z.object({
  note_id: z.string(),
  file_path: z.string(),
  deduped: z.boolean(),
  index_updated: z.boolean()
});
export type SaveMarkdownNoteOutput = z.infer<typeof SaveMarkdownNoteOutputSchema>;

export const NoteRecordSchema = z.object({
  note_id: z.string(),
  title: z.string(),
  path: z.string(),
  source_url: z.string().url(),
  source_platform: z.string(),
  content_type: VaultContentTypeSchema,
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  content_hash: z.string()
});
export type NoteRecord = z.infer<typeof NoteRecordSchema>;

export const VaultIndexSchema = z.object({
  version: z.literal(1),
  updated_at: z.string(),
  notes: z.array(NoteRecordSchema)
});
export type VaultIndex = z.infer<typeof VaultIndexSchema>;

export const SearchVaultInputSchema = z.object({
  query: z.string().min(1),
  vaultDir: z.string().min(1),
  limit: z.number().int().positive().max(50).optional()
});
export type SearchVaultInput = z.infer<typeof SearchVaultInputSchema>;

export const SearchVaultResultSchema = z.object({
  note_id: z.string(),
  title: z.string(),
  path: z.string(),
  score: z.number(),
  snippet: z.string()
});
export type SearchVaultResult = z.infer<typeof SearchVaultResultSchema>;

export const ReadNoteInputSchema = z.object({
  vaultDir: z.string().min(1),
  relativePath: z.string().min(1)
});
export type ReadNoteInput = z.infer<typeof ReadNoteInputSchema>;

export const ReadNoteOutputSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});
export type ReadNoteOutput = z.infer<typeof ReadNoteOutputSchema>;

export const TranscriptLineSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative().optional(),
  text: z.string().min(1)
});
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const VideoPlatformSchema = z.enum([
  "youtube",
  "bilibili",
  "douyin",
  "xiaohongshu",
  "tiktok",
  "unknown"
]);
export type VideoPlatform = z.infer<typeof VideoPlatformSchema>;

export const FetchTranscriptInputSchema = z.object({
  url: z.string().url(),
  platform: VideoPlatformSchema.optional(),
  html: z.string().optional(),
  preferred_languages: z.array(z.string()).optional()
});
export type FetchTranscriptInput = z.infer<typeof FetchTranscriptInputSchema>;

export const FetchTranscriptOutputSchema = z.object({
  ok: z.boolean(),
  platform: VideoPlatformSchema,
  transcript: z.array(TranscriptLineSchema).optional(),
  metadata: z.object({
    title: z.string().optional(),
    uploader: z.string().optional(),
    duration_seconds: z.number().nonnegative().optional()
  }).optional(),
  error: z.string().optional(),
  next_action: z.enum(["summarize", "need_audio_transcription", "unsupported"])
});
export type FetchTranscriptOutput = z.infer<typeof FetchTranscriptOutputSchema>;

export const FfmpegExtractAudioInputSchema = z.object({
  input_path: z.string().min(1),
  output_format: z.enum(["wav", "mp3", "m4a"])
});
export type FfmpegExtractAudioInput = z.infer<typeof FfmpegExtractAudioInputSchema>;

export const FfmpegExtractAudioOutputSchema = z.object({
  audio_path: z.string().min(1)
});
export type FfmpegExtractAudioOutput = z.infer<typeof FfmpegExtractAudioOutputSchema>;

export const ResourceItemTypeSchema = z.enum([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "image",
  "audio",
  "video",
  "archive",
  "unknown"
]);
export type ResourceItemType = z.infer<typeof ResourceItemTypeSchema>;

export const ResourceItemSchema = z.object({
  id: z.string().min(1),
  type: ResourceItemTypeSchema,
  url: z.string().url(),
  text: z.string().optional(),
  filename: z.string().optional(),
  risk: z.enum(["low", "medium", "high"]),
  downloadable_by_default: z.boolean()
});
export type ResourceItem = z.infer<typeof ResourceItemSchema>;

export const ScanResourcesInputSchema = z.object({
  page_url: z.string().url(),
  links: z.array(
    z.object({
      text: z.string().optional(),
      href: z.string().url()
    })
  ),
  media: z.array(
    z.object({
      type: z.string(),
      src: z.string().url()
    })
  ),
  html: z.string().optional()
});
export type ScanResourcesInput = z.infer<typeof ScanResourcesInputSchema>;

export const ScanResourcesOutputSchema = z.object({
  items: z.array(ResourceItemSchema)
});
export type ScanResourcesOutput = z.infer<typeof ScanResourcesOutputSchema>;

export const DownloadAssetInputSchema = z.object({
  resource: ResourceItemSchema,
  asset_dir: z.string().min(1)
});
export type DownloadAssetInput = z.infer<typeof DownloadAssetInputSchema>;

export const DownloadAssetOutputSchema = z.object({
  saved_path: z.string().min(1),
  skipped: z.boolean(),
  reason: z.string().optional()
});
export type DownloadAssetOutput = z.infer<typeof DownloadAssetOutputSchema>;
