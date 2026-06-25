import type { VaultClient } from "./vault-client";

export type McpResourceDefinition = {
  uriTemplate: string;
  description: string;
};

export type McpResourceContent = {
  uri: string;
  mimeType: "application/json" | "text/markdown";
  text: string;
};

export const mcpResourceDefinitions: McpResourceDefinition[] = [
  {
    uriTemplate: "knowledge://notes/{note_id}",
    description: "Read a vault note as Markdown by note_id."
  },
  {
    uriTemplate: "knowledge://collections/recent",
    description: "List recent vault notes as JSON."
  },
  {
    uriTemplate: "knowledge://collections/tags/{tag}",
    description: "List notes with a tag as JSON."
  },
  {
    uriTemplate: "knowledge://sources/{source_hash}",
    description: "Resolve a note by hashed source_url."
  }
];

export async function readMcpResource(client: VaultClient, uri: string): Promise<McpResourceContent> {
  const parsed = new URL(uri);

  if (parsed.protocol !== "knowledge:") {
    throw new Error(`UNSUPPORTED_RESOURCE_URI: ${uri}`);
  }

  if (parsed.hostname === "notes") {
    const noteId = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const note = await client.readNoteById({ note_id: noteId });

    return {
      uri,
      mimeType: "text/markdown",
      text: note.markdown
    };
  }

  if (parsed.hostname === "collections" && parsed.pathname === "/recent") {
    const notes = await client.listRecentNotes({
      limit: parsed.searchParams.get("limit") ? Number(parsed.searchParams.get("limit")) : undefined
    });

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(notes, null, 2)
    };
  }

  if (parsed.hostname === "collections" && parsed.pathname.startsWith("/tags/")) {
    const tag = decodeURIComponent(parsed.pathname.replace("/tags/", ""));
    const notes = await client.listNotesByTag(
      tag,
      parsed.searchParams.get("limit") ? Number(parsed.searchParams.get("limit")) : undefined
    );

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(notes, null, 2)
    };
  }

  if (parsed.hostname === "sources") {
    const sourceHash = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const note = await client.getNoteBySourceHash(sourceHash);

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(note, null, 2)
    };
  }

  throw new Error(`UNSUPPORTED_RESOURCE_URI: ${uri}`);
}
