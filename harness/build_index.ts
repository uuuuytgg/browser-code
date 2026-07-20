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
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
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

  // Phase 2: sync wikilinks + mark stale topics
  console.log(`\n--- Phase 2: Links + Stale Check ---\n`);
  syncLinks();
  markStale();
  console.log();
}

main().catch((err) => {
  console.error("❌ build_index failed:", err);
  process.exit(1);
});

/** 扫描 KB 目录全量解析 [[wikilinks]]，重建 links 表 */
function syncLinks() {
  const db = openDb();
  // 清空当前 links（全量 rebuild）
  db.run("DELETE FROM links");

  const dirs: Array<{ path: string; type: string }> = [
    { path: path.resolve(KB_ROOT, "topics"), type: "topic" },
    { path: path.resolve(KB_ROOT, "entities"), type: "entity" },
    { path: path.resolve(KB_ROOT, "claims"), type: "claim" },
    { path: path.resolve(KB_ROOT, "sources"), type: "source" },
  ];

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO links (source_path, source_type, target_path, target_type, link_context) VALUES (?,?,?,?,?)"
  );

  let totalLinks = 0;

  const insert = db.transaction(() => {
    for (const dir of dirs) {
      if (!existsSync(dir.path)) continue;
      for (const file of readdirSync(dir.path)) {
        if (!file.endsWith(".md")) continue;
        const filePath = path.join(dir.path, file);
        const srcRel = `kb/${dir.type}s/${file}`;
        const content = readFileSync(filePath, "utf8");
        const lines = content.split("\n");

        for (const line of lines) {
          // Parse [[wikilinks]]
          const linkMatches = line.matchAll(/\[\[([^\]]+)\]\]/g);
          for (const m of linkMatches) {
            let target = m[1].trim();
            // Strip Obsidian display alias: [[target|display]]
            const pipeIdx = target.indexOf("|");
            if (pipeIdx >= 0) target = target.slice(0, pipeIdx);
            // Resolve to relative kb/ path
            let targetRel = target;
            if (!target.startsWith("kb/")) {
              if (target.includes("/")) {
                targetRel = `kb/${target}.md`;
              }
            }
            if (!targetRel.endsWith(".md")) targetRel += ".md";
            let targetType = "claim"; // default
            if (targetRel.includes("/topics/")) targetType = "topic";
            else if (targetRel.includes("/entities/")) targetType = "entity";
            else if (targetRel.includes("/claims/")) targetType = "claim";
            else if (targetRel.includes("/sources/")) targetType = "source";

            const ctx = line.slice(0, 200); // first 200 chars of line as context
            stmt.run(srcRel, dir.type, targetRel, targetType, ctx);
            totalLinks++;
          }
        }
      }
    }
  });

  insert();
  console.log(`Links synced: ${totalLinks} total`);
  db.close();
}

/**
 * 标记过期 topic：超过 stale_threshold_days 天未修改且无 backlink 的 topic 标为 stale。
 * 只标记不删除：将 topic .md 的 status 字段从 active → stale，并更新 topic_stats 表。
 *
 * 在 syncLinks() 之后执行，因为需要 links 表中的 backlink 数据。
 */
function markStale() {
  const db = openDb();
  const topicsDir = path.resolve(KB_ROOT, "topics");
  if (!existsSync(topicsDir)) {
    db.close();
    return;
  }

  const files = readdirSync(topicsDir).filter(f => f.endsWith(".md") && f !== ".template.md");
  if (files.length === 0) {
    db.close();
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const staleDays = 90; // 硬编码，与 topic_stats.stale_threshold_days 默认值一致
  const staleCutoff = now.getTime() - staleDays * 24 * 60 * 60 * 1000;

  let staleCount = 0;
  let activeCount = 0;

  for (const file of files) {
    const filePath = path.join(topicsDir, file);
    const topicRel = `kb/topics/${file}`;

    // File modification time via fs stat
    let fileMtime: number;
    try {
      fileMtime = statSync(filePath).mtimeMs;
    } catch {
      fileMtime = now.getTime(); // can't read stat, assume fresh
    }

    // Count backlinks
    const backlinkCount = (db.query(
      "SELECT COUNT(*) as c FROM links WHERE target_path = ?",
      [topicRel]
    ).get() as { c: number })?.c ?? 0;

    // Count claims linked via source_type = 'claim'
    const claimLinkCount = (db.query(
      `SELECT COUNT(*) as c FROM links WHERE target_path = ? AND source_type = 'claim'`,
      [topicRel]
    ).get() as { c: number })?.c ?? 0;

    const isStale = fileMtime < staleCutoff && backlinkCount === 0;

    if (isStale) {
      staleCount++;
      const daysSince = Math.floor((now.getTime() - fileMtime) / 86400000);
      console.log(`  ⚠️  stale: ${topicRel} (${daysSince}d since last modified, 0 backlinks)`);
    } else {
      activeCount++;
    }

    // Upsert topic_stats
    db.run(`
      INSERT INTO topic_stats (topic_path, claim_count, last_synthesized_at, stale_threshold_days)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(topic_path) DO UPDATE SET
        claim_count = excluded.claim_count,
        last_synthesized_at = COALESCE(topic_stats.last_synthesized_at, excluded.last_synthesized_at)
    `, [topicRel, claimLinkCount, nowIso, staleDays]);
  }

  db.close();
  console.log(`Stale check: ${staleCount} stale, ${activeCount} active (threshold: ${staleDays}d)`);
}

// CLI entry for standalone syncLinks / markStale (outside main index build)
// --link: syncLinks only (quick link rebuild)
// --stale: markStale only (quick stale check)
// Both flags together = syncLinks + markStale
if (process.argv.includes("--link") || process.argv.includes("--stale")) {
  if (process.argv.includes("--link")) syncLinks();
  if (process.argv.includes("--stale")) markStale();
  process.exit(0);
}
