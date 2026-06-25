import fs from "node:fs/promises";
import path from "node:path";

import type { SearchVaultInput, SearchVaultResult } from "@ska/schemas";
import { SearchVaultInputSchema, SearchVaultResultSchema } from "@ska/schemas";

import { parseMarkdownNote } from "./frontmatter";
import { readIndexFile } from "./build-index";
import { normalizeTags, sanitizeTag } from "./tag-policy";

function tokenize(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreMatches(tokens: string[], haystack: string[], weight: number) {
  return tokens.reduce((score, token) => score + (haystack.some((value) => value.includes(token)) ? weight : 0), 0);
}

export async function searchVault(input: SearchVaultInput): Promise<SearchVaultResult[]> {
  const parsed = SearchVaultInputSchema.parse(input);
  const tokens = tokenize(parsed.query);
  const normalizedQueryTags = await normalizeTags(
    tokens.map((token) => sanitizeTag(token)),
    {
      vaultDir: parsed.vaultDir,
      contentType: "search-query",
      maxTags: 10
    }
  );
  const index = await readIndexFile({ vaultDir: parsed.vaultDir });

  const results: SearchVaultResult[] = [];

  for (const note of index.notes) {
    const absolutePath = path.join(parsed.vaultDir, note.path);
    const markdown = await fs.readFile(absolutePath, "utf8");
    const parsedNote = parseMarkdownNote(markdown);
    const body = parsedNote.content.toLowerCase();

    const score =
      scoreMatches(tokens, [note.title.toLowerCase()], 5) +
      scoreMatches(normalizedQueryTags.canonical, note.tags.map((tag) => tag.toLowerCase()), 4) +
      scoreMatches(tokens, note.keywords.map((keyword) => keyword.toLowerCase()), 3) +
      scoreMatches(tokens, [body], 1);

    if (score <= 0) continue;

    const snippet = parsedNote.content.slice(0, 160);
    results.push(
      SearchVaultResultSchema.parse({
        note_id: note.note_id,
        title: note.title,
        path: `vault/${note.path}`,
        score,
        snippet
      })
    );
  }

  return results.sort((left, right) => right.score - left.score).slice(0, parsed.limit ?? 10);
}
