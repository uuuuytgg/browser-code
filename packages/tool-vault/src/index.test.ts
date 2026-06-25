import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildIndex, readIndexFile, saveMarkdownNote, searchVault } from "./index";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

function createVaultRoot() {
  const root = path.join(os.tmpdir(), `ska-vault-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

describe("saveMarkdownNote", () => {
  it("saves a markdown note into the correct vault subdirectory with frontmatter", async () => {
    const vaultDir = createVaultRoot();
    await ensureVaultDirs(vaultDir);

    const result = await saveMarkdownNote(
      {
        markdown: "# Example Article\n\nThis is the article body.",
        metadata: {
          title: "Example Article",
          source_url: "https://example.com/posts/1",
          source_platform: "web",
          tags: ["example"],
          keywords: ["article"]
        },
        content_type: "article",
        source_url: "https://example.com/posts/1"
      },
      { vaultDir }
    );

    expect(result.deduped).toBe(false);
    expect(result.file_path).toMatch(/vault[\\/]+articles[\\/]+/);

    const absolutePath = path.join(vaultDir, result.file_path.replace(/^vault[\\/]/, ""));
    const fileContent = await fs.readFile(absolutePath, "utf8");

    expect(fileContent).toContain('source_url: "https://example.com/posts/1"');
    expect(fileContent).toContain("# Example Article");
  });

  it("dedupes by source_url and returns the existing note path", async () => {
    const vaultDir = createVaultRoot();
    await ensureVaultDirs(vaultDir);

    const first = await saveMarkdownNote(
      {
        markdown: "# Example Article\n\nOriginal body.",
        metadata: {
          title: "Example Article",
          source_url: "https://example.com/posts/dup"
        },
        content_type: "article",
        source_url: "https://example.com/posts/dup"
      },
      { vaultDir }
    );

    const second = await saveMarkdownNote(
      {
        markdown: "# Example Article\n\nUpdated body that should not overwrite.",
        metadata: {
          title: "Example Article",
          source_url: "https://example.com/posts/dup"
        },
        content_type: "article",
        source_url: "https://example.com/posts/dup"
      },
      { vaultDir }
    );

    expect(second.deduped).toBe(true);
    expect(second.file_path).toBe(first.file_path);
  });
});

describe("buildIndex", () => {
  it("rebuilds index.json from notes in the vault", async () => {
    const vaultDir = createVaultRoot();
    await ensureVaultDirs(vaultDir);

    await saveMarkdownNote(
      {
        markdown: "# Indexed Article\n\nSearchable text lives here.",
        metadata: {
          title: "Indexed Article",
          source_url: "https://example.com/indexed",
          tags: ["react"],
          keywords: ["searchable"]
        },
        content_type: "article",
        source_url: "https://example.com/indexed"
      },
      { vaultDir }
    );

    const index = await buildIndex({ vaultDir });

    expect(index.notes).toHaveLength(1);
    expect(index.notes[0]?.title).toBe("Indexed Article");
    expect(index.notes[0]?.tags).toContain("react");

    const savedIndex = await readIndexFile({ vaultDir });
    expect(savedIndex.notes).toHaveLength(1);
  });
});

describe("searchVault", () => {
  it("scores title, tags, keywords, and body matches", async () => {
    const vaultDir = createVaultRoot();
    await ensureVaultDirs(vaultDir);

    await saveMarkdownNote(
      {
        markdown: "# React Server Components\n\nServer components improve rendering performance.",
        metadata: {
          title: "React Server Components",
          source_url: "https://example.com/react",
          tags: ["react"],
          keywords: ["server-components", "performance"]
        },
        content_type: "article",
        source_url: "https://example.com/react"
      },
      { vaultDir }
    );

    await buildIndex({ vaultDir });
    const results = await searchVault({ query: "react performance", vaultDir });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toBe("React Server Components");
    expect(results[0]?.score).toBeGreaterThan(0);
  });
});
