/**
 * build_index.ts - LLM Wiki Lite Index Builder
 *
 * Scans kb/sources, kb/claims, kb/topics, kb/entities
 * and builds SQLite FTS5 index at index/browsercode.sqlite
 *
 * Also creates the processing_queue table used by the capture workflow.
 *
 * Usage: bun run harness/build_index.ts
 */

import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { openDb, DB_PATH, KB_ROOT } from "./db.ts";

const SCAN_DIRS = ["sources", "claims", "topics", "entities"];

async function findMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const current = path.join(dir, entry.name);
        if (entry.isDirectory()) return findMarkdown(current);
        if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
          return [current];
        }
        return [];
      })
    );
    return nested.flat();
  } catch {
    return [];
  }
}

function extractTitle(content: string, fallback: string): string {
  return content.split("\n").find((line) => line.startsWith("# "))?.replace(/^# /, "").trim() || fallback;
}

function inferKind(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  if (normalized.includes("/claims/")) return "claim";
  if (normalized.includes("/topics/")) return "topic";
  if (normalized.includes("/entities/")) return "entity";
  if (normalized.includes("/sources/")) return "source";
  if (normalized.includes("/queries/")) return "query";
  return "document";
}

function stableHash(file: string): string {
  return crypto.createHash("sha1").update(file.replace(/\\/g, "/")).digest("hex").slice(0, 12);
}

function relativePath(absPath: string): string {
  const root = path.resolve(import.meta.dir, "..");
  const rel = path.relative(root, absPath).replace(/\\/g, "/");
  return rel.startsWith("../") ? rel : rel;
}

async function main() {
  console.log("🔍 Scanning kb/ for markdown files...\n");

  const allFiles: string[] = [];
  for (const subdir of SCAN_DIRS) {
    const dirPath = path.join(KB_ROOT, subdir);
    const files = await findMarkdown(dirPath);
    allFiles.push(...files);
    console.log(`  ${subdir}: ${files.length} files`);
  }

  console.log(`\n  Total: ${allFiles.length} files\n`);

  if (allFiles.length === 0) {
    console.log("⚠️  No markdown files found. Nothing to index.");
    console.log("   Place source/claim/topic/entity files under kb/ and re-run.");
    process.exit(0);
  }

  // Initialize database (creates all tables via db.ts, including processing_queue)
  const db = openDb();

  // Clear existing data before rebuild
  db.run("DELETE FROM documents_fts");
  db.run("DELETE FROM documents");

  // Insert documents
  const insertDoc = db.prepare(`
    INSERT INTO documents (id, path, kind, title, content, updated_at)
    VALUES ($id, $path, $kind, $title, $content, $updated_at)
  `);

  const insertFts = db.prepare(`
    INSERT INTO documents_fts (id, path, kind, title, content)
    VALUES ($id, $path, $kind, $title, $content)
  `);

  const now = new Date().toISOString();
  let indexed = 0;

  const insertAll = db.transaction(() => {
    for (const file of allFiles) {
      const content = Bun.file(file).text();
      // We need to do this synchronously inside the transaction
      // So read all files first
    }
  });

  // Bun's SQLite transactions don't work well with async file reads
  // Read all files first, then insert
  const docs: Array<{
    id: string;
    path: string;
    kind: string;
    title: string;
    content: string;
  }> = [];

  for (const file of allFiles) {
    const content = await Bun.file(file).text();
    const title = extractTitle(content, path.basename(file, ".md"));
    const kind = inferKind(file);
    docs.push({
      id: stableHash(file),
      path: relativePath(file),
      kind,
      title,
      content,
    });
  }

  // Insert in a transaction for performance
  const insertBatch = db.transaction(() => {
    for (const doc of docs) {
      insertDoc.run({
        $id: doc.id,
        $path: doc.path,
        $kind: doc.kind,
        $title: doc.title,
        $content: doc.content,
        $updated_at: now,
      });
      insertFts.run({
        $id: doc.id,
        $path: doc.path,
        $kind: doc.kind,
        $title: doc.title,
        $content: doc.content,
      });
      indexed++;
    }
  });

  insertBatch();

  db.close();

  console.log("✅ Index built successfully!\n");
  console.log(`  Database: ${DB_PATH}`);
  console.log(`  Documents indexed: ${indexed}`);
  console.log(`\n  Breakdown:`);
  for (const subdir of SCAN_DIRS) {
    const count = docs.filter((d) => d.kind === (subdir === "sources" ? "source" : subdir === "claims" ? "claim" : subdir === "topics" ? "topic" : "entity")).length;
    if (count > 0) {
      console.log(`    ${subdir}: ${count}`);
    }
  }
}

main().catch((err) => {
  console.error("❌ build_index failed:", err);
  process.exit(1);
});
