import crypto from "node:crypto";

import type { NoteRecord, SearchVaultResult, VaultContentType } from "@ska/schemas";
import { readIndexFile, readNote, searchVault } from "@ska/tool-vault";

export type NoteSummary = {
  note_id: string;
  title: string;
  path: string;
  source_url: string;
  source_hash: string;
  content_type: VaultContentType;
  tags: string[];
  keywords: string[];
  created_at: string;
  updated_at: string;
};

export type SearchNotesInput = {
  query: string;
  filters?: {
    content_type?: VaultContentType[];
    tags?: string[];
  };
  limit?: number;
};

export type ReadNoteByIdInput = {
  note_id: string;
};

export type ListRecentNotesInput = {
  limit?: number;
};

export type GetNoteBySourceUrlInput = {
  source_url: string;
};

export type FindRelatedNotesInput = {
  note_id: string;
  limit?: number;
};

export class VaultClient {
  constructor(private readonly vaultDir: string) {}

  async searchNotes(input: SearchNotesInput) {
    const results = await searchVault({
      query: input.query,
      vaultDir: this.vaultDir,
      limit: input.limit ?? 10
    });
    const index = await readIndexFile({ vaultDir: this.vaultDir });
    const notesById = new Map(index.notes.map((note) => [note.note_id, note]));

    return results
      .map((result) => {
        const note = notesById.get(result.note_id);
        if (!note) {
          return null;
        }

        if (input.filters?.content_type?.length && !input.filters.content_type.includes(note.content_type)) {
          return null;
        }

        if (input.filters?.tags?.length) {
          const requiredTags = input.filters.tags.map((tag) => tag.toLowerCase());
          const noteTags = note.tags.map((tag) => tag.toLowerCase());
          if (!requiredTags.every((tag) => noteTags.includes(tag))) {
            return null;
          }
        }

        return buildSearchResult(note, result);
      })
      .filter((result): result is SearchVaultResult & { note: NoteSummary } => Boolean(result))
      .slice(0, input.limit ?? 10);
  }

  async readNoteById(input: ReadNoteByIdInput) {
    const note = await this.requireNote(input.note_id);
    const markdown = await readNote(this.vaultDir, note.path);

    return {
      note: toNoteSummary(note),
      markdown
    };
  }

  async listRecentNotes(input: ListRecentNotesInput = {}) {
    const index = await readIndexFile({ vaultDir: this.vaultDir });

    return [...index.notes]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, input.limit ?? 20)
      .map(toNoteSummary);
  }

  async getNoteBySourceUrl(input: GetNoteBySourceUrlInput) {
    const index = await readIndexFile({ vaultDir: this.vaultDir });
    const note = index.notes.find((entry) => entry.source_url === input.source_url);
    return note ? toNoteSummary(note) : null;
  }

  async getNoteBySourceHash(sourceHash: string) {
    const index = await readIndexFile({ vaultDir: this.vaultDir });
    const note = index.notes.find((entry) => computeSourceHash(entry.source_url) === sourceHash);
    return note ? toNoteSummary(note) : null;
  }

  async listNotesByTag(tag: string, limit = 20) {
    const normalizedTag = tag.toLowerCase();
    const index = await readIndexFile({ vaultDir: this.vaultDir });

    return index.notes
      .filter((note) => note.tags.some((entry) => entry.toLowerCase() === normalizedTag))
      .slice(0, limit)
      .map(toNoteSummary);
  }

  async findRelatedNotes(input: FindRelatedNotesInput) {
    const index = await readIndexFile({ vaultDir: this.vaultDir });
    const target = index.notes.find((note) => note.note_id === input.note_id);

    if (!target) {
      throw new Error(`NOTE_NOT_FOUND: ${input.note_id}`);
    }

    const tagSet = new Set(target.tags.map((tag) => tag.toLowerCase()));
    const keywordSet = new Set(target.keywords.map((keyword) => keyword.toLowerCase()));

    return index.notes
      .filter((candidate) => candidate.note_id !== target.note_id)
      .map((candidate) => ({
        note: candidate,
        score:
          candidate.tags.reduce((score, tag) => score + (tagSet.has(tag.toLowerCase()) ? 4 : 0), 0) +
          candidate.keywords.reduce((score, keyword) => score + (keywordSet.has(keyword.toLowerCase()) ? 2 : 0), 0) +
          (candidate.content_type === target.content_type ? 1 : 0)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? 5)
      .map((entry) => ({
        ...toNoteSummary(entry.note),
        score: entry.score
      }));
  }

  private async requireNote(noteId: string) {
    const index = await readIndexFile({ vaultDir: this.vaultDir });
    const note = index.notes.find((entry) => entry.note_id === noteId);

    if (!note) {
      throw new Error(`NOTE_NOT_FOUND: ${noteId}`);
    }

    return note;
  }
}

function buildSearchResult(note: NoteRecord, result: SearchVaultResult) {
  return {
    ...result,
    note: toNoteSummary(note)
  };
}

function toNoteSummary(note: NoteRecord): NoteSummary {
  return {
    note_id: note.note_id,
    title: note.title,
    path: `vault/${note.path}`,
    source_url: note.source_url,
    source_hash: computeSourceHash(note.source_url),
    content_type: note.content_type,
    tags: note.tags,
    keywords: note.keywords,
    created_at: note.created_at,
    updated_at: note.updated_at
  };
}

function computeSourceHash(sourceUrl: string) {
  return crypto.createHash("sha1").update(sourceUrl).digest("hex");
}
