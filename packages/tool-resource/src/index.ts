import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentMode,
  DownloadAssetInput,
  DownloadAssetOutput,
  ResourceItem,
  ResourceItemType,
  ScanResourcesInput,
  ScanResourcesOutput,
  ToolRisk
} from "@ska/schemas";
import {
  DownloadAssetInputSchema,
  DownloadAssetOutputSchema,
  ScanResourcesInputSchema,
  ScanResourcesOutputSchema
} from "@ska/schemas";

export const toolResourcePackageInfo = {
  name: "@ska/tool-resource",
  stage: 10,
  placeholderTools: [
    {
      name: "scan_page_resources",
      risk: "low" as ToolRisk,
      agent_modes: ["resource"] as AgentMode[],
      implemented: true
    },
    {
      name: "download_asset",
      risk: "high" as ToolRisk,
      agent_modes: ["resource"] as AgentMode[],
      implemented: true
    }
  ]
} as const;

export const scanPageResourcesToolSpec = {
  name: "scan_page_resources",
  description: "Scan captured page links and media for public resources without downloading them.",
  risk: "low" as ToolRisk,
  agent_modes: ["resource"] as AgentMode[],
  input_schema: ScanResourcesInputSchema,
  output_schema: ScanResourcesOutputSchema
} as const;

export const downloadAssetToolSpec = {
  name: "download_asset",
  description: "Save an already-scanned resource into vault/assets with confirmation for risky items.",
  risk: "high" as ToolRisk,
  agent_modes: ["resource"] as AgentMode[],
  requires_confirmation: true,
  input_schema: DownloadAssetInputSchema,
  output_schema: DownloadAssetOutputSchema
} as const;

export async function runScanPageResources(input: ScanResourcesInput): Promise<ScanResourcesOutput> {
  const parsed = ScanResourcesInputSchema.parse(input);
  const items = dedupeResources([
    ...parsed.links.map((link) => buildResourceItem(link.href, link.text)),
    ...parsed.media.map((media) => buildResourceItem(media.src, media.type))
  ]);

  return ScanResourcesOutputSchema.parse({ items });
}

export async function runDownloadAsset(input: DownloadAssetInput): Promise<DownloadAssetOutput> {
  const parsed = DownloadAssetInputSchema.parse(input);
  const filename = parsed.resource.filename ?? createFilenameFromUrl(parsed.resource.url, parsed.resource.type);
  const targetPath = path.join(parsed.asset_dir, filename);

  await fs.mkdir(parsed.asset_dir, { recursive: true });
  await fs.writeFile(
    targetPath,
    JSON.stringify(
      {
        source_url: parsed.resource.url,
        type: parsed.resource.type,
        risk: parsed.resource.risk,
        downloaded_at: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );

  return DownloadAssetOutputSchema.parse({
    saved_path: targetPath,
    skipped: false
  });
}

function dedupeResources(items: ResourceItem[]) {
  const seen = new Set<string>();
  const unique: ResourceItem[] = [];

  for (const item of items) {
    if (seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    unique.push(item);
  }

  return unique;
}

function buildResourceItem(url: string, text?: string): ResourceItem {
  const type = detectResourceType(url);
  const filename = createFilenameFromUrl(url, type);
  const risk = classifyRisk(url, type);

  return {
    id: crypto.createHash("sha1").update(url).digest("hex").slice(0, 12),
    type,
    url,
    text,
    filename,
    risk,
    downloadable_by_default: risk === "low"
  };
}

function detectResourceType(url: string): ResourceItemType {
  const normalized = url.toLowerCase();

  if (normalized.endsWith(".pdf")) return "pdf";
  if (normalized.endsWith(".docx") || normalized.endsWith(".doc")) return "docx";
  if (normalized.endsWith(".pptx") || normalized.endsWith(".ppt")) return "pptx";
  if (normalized.endsWith(".xlsx") || normalized.endsWith(".xls")) return "xlsx";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(normalized)) return "image";
  if (/\.(mp3|wav|m4a|ogg|flac)$/.test(normalized)) return "audio";
  if (/\.(mp4|webm|mov|mkv)$/.test(normalized)) return "video";
  if (/\.(zip|rar|7z|tar|gz)$/.test(normalized)) return "archive";

  return "unknown";
}

function classifyRisk(url: string, type: ResourceItemType) {
  const normalized = url.toLowerCase();

  if (normalized.endsWith(".m3u8") || normalized.endsWith(".mpd")) {
    return "high" as const;
  }

  if (type === "audio" || type === "video") {
    return "high" as const;
  }

  if (type === "archive" || type === "unknown") {
    return "medium" as const;
  }

  return "low" as const;
}

function createFilenameFromUrl(url: string, type: ResourceItemType) {
  const pathname = new URL(url).pathname;
  const tail = pathname.split("/").filter(Boolean).pop();
  if (tail) {
    return tail;
  }

  return `resource-${type}`;
}
