import fs from "node:fs/promises";
import path from "node:path";

import type { SaveMarkdownNoteInput, SaveMarkdownNoteOutput } from "@ska/schemas";
import { SaveMarkdownNoteInputSchema, SaveMarkdownNoteOutputSchema } from "@ska/schemas";

import { buildIndex } from "./build-index";
import { findExistingNoteBySourceUrl } from "./dedupe";
import { createNoteFilename, createNoteId } from "./filename";
import { buildFrontmatter } from "./frontmatter";
import { getContentDirectory } from "./paths";
import { normalizeTags, updateTagVocabulary } from "./tag-policy";

type SaveOptions = {
  vaultDir: string;
};

export async function saveMarkdownNote(input: SaveMarkdownNoteInput, options: SaveOptions): Promise<SaveMarkdownNoteOutput> {
  const parsed = SaveMarkdownNoteInputSchema.parse(input);
  const existing = await findExistingNoteBySourceUrl(options.vaultDir, parsed.source_url, parsed.content_type);

  if (existing) {
    return SaveMarkdownNoteOutputSchema.parse({
      note_id: existing.note_id,
      file_path: `vault/${existing.path.replace(/\//g, path.sep)}`.replace(/\\/g, "/"),
      deduped: true,
      index_updated: false
    });
  }

  const timestamp = new Date().toISOString();
  const noteId = createNoteId(parsed.source_url, timestamp);
  const filename = createNoteFilename(parsed.metadata.title, parsed.source_url, timestamp);
  const directory = getContentDirectory(options.vaultDir, parsed.content_type);
  const absolutePath = path.join(directory, filename);
  const normalizedTags = await normalizeTags(parsed.metadata.tags ?? [], {
    vaultDir: options.vaultDir,
    contentType: parsed.content_type,
    maxTags: 5
  });

  const markdownWithFrontmatter = buildFrontmatter(parsed.markdown, {
    id: noteId,
    title: parsed.metadata.title,
    source_url: parsed.source_url,
    source_platform: parsed.metadata.source_platform ?? "web",
    content_type: parsed.content_type,
    created_at: timestamp,
    captured_at: timestamp,
    tags: normalizedTags.canonical,
    keywords: parsed.metadata.keywords ?? [],
    status: "processed",
    assets: [],
    related_notes: []
  });

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(absolutePath, markdownWithFrontmatter, "utf8");
  await updateTagVocabulary(normalizedTags.canonical, options.vaultDir, timestamp);
  await buildIndex({ vaultDir: options.vaultDir });

  return SaveMarkdownNoteOutputSchema.parse({
    note_id: noteId,
    file_path: `vault/${path.relative(options.vaultDir, absolutePath).replace(/\\/g, "/")}`,
    deduped: false,
    index_updated: true
  });
}
