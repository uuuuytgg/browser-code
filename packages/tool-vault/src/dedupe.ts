import fs from "node:fs/promises";

import type { VaultContentType } from "@ska/schemas";
import { readIndexFile } from "./build-index";

export async function findExistingNoteBySourceUrl(
  vaultDir: string,
  sourceUrl: string,
  contentType?: VaultContentType
) {
  const index = await readIndexFile({ vaultDir });
  const match = index.notes.find((note) => (
    note.source_url === sourceUrl
    && (!contentType || note.content_type === contentType)
  ));

  if (match) {
    return match;
  }

  try {
    await fs.access(vaultDir);
  } catch {
    return undefined;
  }

  return undefined;
}
