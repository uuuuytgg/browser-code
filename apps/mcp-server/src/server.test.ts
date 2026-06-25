import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { saveMarkdownNote } from "@ska/tool-vault";

import { resolveMcpServerConfig } from "./config";
import { createMcpKnowledgeServer } from "./server";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

function createTempRoot() {
  const root = path.join(os.tmpdir(), `ska-mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tempRoots.push(root);
  return root;
}

async function ensureVaultDirs(vaultDir: string) {
  await Promise.all(
    [
      "articles",
      "videos",
      "documents",
      "snippets",
      "resources",
      "assets",
      "index"
    ].map((dir) => fs.mkdir(path.join(vaultDir, dir), { recursive: true }))
  );
}

describe("resolveMcpServerConfig", () => {
  it("defaults to a read-only local vault path", () => {
    const config = resolveMcpServerConfig({}, "D:/repo");

    expect(config.vaultDir).toBe(path.resolve("D:/repo", "./vault"));
    expect(config.allowWrite).toBe(false);
  });
});

describe("McpKnowledgeServer", () => {
  it("exposes only read-only tools", async () => {
    const root = createTempRoot();
    const vaultDir = path.join(root, "vault");
    await ensureVaultDirs(vaultDir);

    const server = createMcpKnowledgeServer({ vaultDir, allowWrite: false });
    expect(server.listTools().map((tool) => tool.name)).toEqual([
      "search_notes",
      "read_note",
      "list_recent_notes",
      "get_note_by_source_url",
      "find_related_notes"
    ]);

    await expect(server.callTool("delete_note", {})).rejects.toThrow("TOOL_NOT_ALLOWED");
  });

  it("searches and reads notes through the MCP tool surface", async () => {
    const root = createTempRoot();
    const vaultDir = path.join(root, "vault");
    await ensureVaultDirs(vaultDir);

    await saveMarkdownNote(
      {
        markdown: "# MCP Knowledge Base\n\nThis note explains browser knowledge retrieval.",
        metadata: {
          title: "MCP Knowledge Base",
          source_url: "https://example.com/mcp",
          source_platform: "web",
          tags: ["mcp", "browser"],
          keywords: ["knowledge", "retrieval"]
        },
        content_type: "article",
        source_url: "https://example.com/mcp"
      },
      { vaultDir }
    );

    const server = createMcpKnowledgeServer({ vaultDir, allowWrite: false });
    const results = await server.callTool("search_notes", {
      query: "browser knowledge",
      filters: {
        content_type: ["article"],
        tags: ["mcp"]
      },
      limit: 5
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);

    const first = (results as Array<{ note: { note_id: string } }>)[0];
    const note = await server.callTool("read_note", { note_id: first.note.note_id });

    expect(note).toMatchObject({
      note: {
        title: "MCP Knowledge Base"
      }
    });
    expect((note as { markdown: string }).markdown).toContain("browser knowledge retrieval");
  });

  it("lists recent notes, related notes, and resource URIs", async () => {
    const root = createTempRoot();
    const vaultDir = path.join(root, "vault");
    await ensureVaultDirs(vaultDir);

    await saveMarkdownNote(
      {
        markdown: "# First MCP Note\n\nShared tags make this related.",
        metadata: {
          title: "First MCP Note",
          source_url: "https://example.com/first",
          tags: ["mcp", "shared"],
          keywords: ["vault"]
        },
        content_type: "article",
        source_url: "https://example.com/first"
      },
      { vaultDir }
    );

    await saveMarkdownNote(
      {
        markdown: "# Second MCP Note\n\nAlso about a shared vault topic.",
        metadata: {
          title: "Second MCP Note",
          source_url: "https://example.com/second",
          tags: ["mcp", "shared"],
          keywords: ["vault", "related"]
        },
        content_type: "article",
        source_url: "https://example.com/second"
      },
      { vaultDir }
    );

    const server = createMcpKnowledgeServer({ vaultDir, allowWrite: false });
    const recent = await server.callTool("list_recent_notes", { limit: 2 });

    expect(recent).toHaveLength(2);
    expect((recent as Array<{ title: string }>)[0]?.title).toBe("Second MCP Note");

    const sourceUrlMatch = await server.callTool("get_note_by_source_url", {
      source_url: "https://example.com/first"
    });
    expect(sourceUrlMatch).toMatchObject({
      title: "First MCP Note"
    });

    const related = await server.callTool("find_related_notes", {
      note_id: (sourceUrlMatch as { note_id: string }).note_id,
      limit: 5
    });
    expect((related as Array<{ title: string }>)[0]?.title).toBe("Second MCP Note");

    const resource = await server.readResource(
      `knowledge://sources/${(sourceUrlMatch as { source_hash: string }).source_hash}`
    );
    expect(resource.mimeType).toBe("application/json");
    expect(resource.text).toContain("First MCP Note");
  });
});
