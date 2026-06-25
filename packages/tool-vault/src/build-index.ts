import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { NoteRecord, VaultIndex } from "@ska/schemas";
import { VaultIndexSchema } from "@ska/schemas";

import { parseMarkdownNote } from "./frontmatter";
import { getIndexPath } from "./paths";

type VaultOptions = {
  vaultDir: string;
};

const noteDirectories = ["articles", "videos", "documents", "snippets", "resources"] as const;

export async function buildIndex({ vaultDir }: VaultOptions): Promise<VaultIndex> {
  const notes: NoteRecord[] = [];

  for (const directory of noteDirectories) {
    const directoryPath = path.join(vaultDir, directory);
    let entries: string[] = [];

    try {
      entries = await fs.readdir(directoryPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;

      const absolutePath = path.join(directoryPath, entry);
      const markdown = await fs.readFile(absolutePath, "utf8");
      const parsed = parseMarkdownNote(markdown);
      const contentHash = crypto.createHash("sha1").update(parsed.content).digest("hex");

      notes.push({
        note_id: parsed.data.id,
        title: parsed.data.title,
        path: path.relative(vaultDir, absolutePath).replace(/\\/g, "/"),
        source_url: parsed.data.source_url,
        source_platform: parsed.data.source_platform,
        content_type: parsed.data.content_type,
        tags: parsed.data.tags,
        keywords: parsed.data.keywords,
        created_at: parsed.data.created_at,
        updated_at: parsed.data.captured_at,
        content_hash: contentHash
      });
    }
  }

  notes.sort((left, right) => left.created_at.localeCompare(right.created_at));

  const index = VaultIndexSchema.parse({
    version: 1,
    updated_at: new Date().toISOString(),
    notes
  });

  const indexPath = getIndexPath(vaultDir);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return index;
}

export async function readIndexFile({ vaultDir }: VaultOptions): Promise<VaultIndex> {
  const indexPath = getIndexPath(vaultDir);

  try {
    const raw = await fs.readFile(indexPath, "utf8");
    return VaultIndexSchema.parse(JSON.parse(raw));
  } catch {
    return VaultIndexSchema.parse({
      version: 1,
      updated_at: new Date(0).toISOString(),
      notes: []
    });
  }
}
