import fs from "node:fs/promises";

import { readIndexFile } from "./build-index";

export async function findExistingNoteBySourceUrl(vaultDir: string, sourceUrl: string) {
  const index = await readIndexFile({ vaultDir });
  const match = index.notes.find((note) => note.source_url === sourceUrl);

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
