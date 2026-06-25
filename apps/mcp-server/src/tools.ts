import type { VaultContentType } from "@ska/schemas";

import type { VaultClient } from "./vault-client";

export type McpToolDefinition = {
  name: string;
  description: string;
  readOnly: true;
};

export type SearchNotesToolInput = {
  query: string;
  filters?: {
    content_type?: VaultContentType[];
    tags?: string[];
  };
  limit?: number;
};

export type ReadNoteToolInput = {
  note_id: string;
};

export type ListRecentNotesToolInput = {
  limit?: number;
};

export type GetNoteBySourceUrlToolInput = {
  source_url: string;
};

export type FindRelatedNotesToolInput = {
  note_id: string;
  limit?: number;
};

export const readOnlyToolNames = [
  "search_notes",
  "read_note",
  "list_recent_notes",
  "get_note_by_source_url",
  "find_related_notes"
] as const;

export type ReadOnlyToolName = (typeof readOnlyToolNames)[number];

export const mcpToolDefinitions: McpToolDefinition[] = [
  {
    name: "search_notes",
    description: "Search vault notes using text query and optional metadata filters.",
    readOnly: true
  },
  {
    name: "read_note",
    description: "Read a single vault note by note_id and return Markdown content.",
    readOnly: true
  },
  {
    name: "list_recent_notes",
    description: "List the most recent vault notes.",
    readOnly: true
  },
  {
    name: "get_note_by_source_url",
    description: "Find a vault note that matches an exact source_url.",
    readOnly: true
  },
  {
    name: "find_related_notes",
    description: "Find related notes by shared tags, keywords, and content type.",
    readOnly: true
  }
];

export async function callReadOnlyTool(
  client: VaultClient,
  toolName: ReadOnlyToolName,
  input: unknown
) {
  switch (toolName) {
    case "search_notes":
      return client.searchNotes(input as SearchNotesToolInput);
    case "read_note":
      return client.readNoteById(input as ReadNoteToolInput);
    case "list_recent_notes":
      return client.listRecentNotes((input as ListRecentNotesToolInput | undefined) ?? {});
    case "get_note_by_source_url":
      return client.getNoteBySourceUrl(input as GetNoteBySourceUrlToolInput);
    case "find_related_notes":
      return client.findRelatedNotes(input as FindRelatedNotesToolInput);
  }
}
