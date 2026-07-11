/**
 * enqueue.ts — 将 vault 笔记加入处理队列
 *
 * 用法: bun run harness/enqueue.ts vault/articles/<note>.md [--force]
 *
 * 功能：
 *   - 读取 vault 笔记 frontmatter
 *   - 写入 processing_queue 表（幂等，重复执行不会创建重复条目）
 *   - 自动检测 kb/sources 和 kb/claims 是否已存在，设定初始 step
 *   - --force 强制重置为 pending
 *
 * 配合:
 *   bun run harness/process-queue.ts — 处理队列
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, basename } from "node:path";
import { openDb, PROJECT_ROOT, VAULT_ROOT, KB_ROOT, parseFrontmatter, sourceFileName, currentDate } from "./db.ts";

function main() {
  const args = process.argv.slice(2);
  const notePath = args[0];
  const force = args.includes("--force");

  if (!notePath || args.includes("--help")) {
    console.log(`
Usage: bun run harness/enqueue.ts <vault-note-path> [--force]

Add a vault note to the processing queue for Wiki Lite management.

Steps tracked:
  0. pending          — enqueued, waiting
  1. source_done      — kb/sources entry exists
  2. claims_done      — kb/claims entry exists
  3. topics_done      — topics/entities checked
  4. done             — index rebuilt, complete

Options:
  --force   Reset to pending (re-process from scratch)
  --help    Show this help
`);
    process.exit(0);
  }

  const absNotePath = resolve(PROJECT_ROOT, notePath);

  if (!existsSync(absNotePath)) {
    console.error(`❌ 文件不存在: ${absNotePath}`);
    process.exit(1);
  }

  const content = readFileSync(absNotePath, "utf-8");
  const frontmatter = parseFrontmatter(content);
  const title = String(frontmatter.title || basename(notePath, ".md"));
  const date = String(frontmatter.date || currentDate());

  const relPath = relative(PROJECT_ROOT, absNotePath).replace(/\\/g, "/");

  // 推断当前进度
  const sourceName = sourceFileName(relPath, date);
  const sourcePath = resolve(KB_ROOT, "sources", `${sourceName}.md`);
  const claimsPath = resolve(KB_ROOT, "claims", `${sourceName}.claims.md`);

  let step = 0;
  let status = "pending";

  if (existsSync(sourcePath)) {
    step = 1;
    status = "source_done";
  }
  if (existsSync(claimsPath)) {
    step = 2;
    status = "claims_done";
  }

  if (force) {
    step = 0;
    status = "pending";
  }

  const now = currentDate();

  const db = openDb();

  // UPSERT
  db.run(
    `INSERT INTO processing_queue (vault_path, vault_title, captured_date, status, step, created_at, updated_at)
     VALUES ($path, $title, $date, $status, $step, $now, $now)
     ON CONFLICT(vault_path) DO UPDATE SET
       vault_title = excluded.vault_title,
       captured_date = excluded.captured_date,
       status = CASE WHEN $force THEN excluded.status ELSE processing_queue.status END,
       step = CASE WHEN $force THEN excluded.step ELSE processing_queue.step END,
       error = CASE WHEN $force THEN NULL ELSE processing_queue.error END,
       updated_at = excluded.updated_at`,
    {
      $path: relPath,
      $title: title,
      $date: date,
      $status: status,
      $step: step,
      $now: now,
      $force: force ? 1 : 0,
    }
  );

  db.close();

  const stepLabels = ["pending", "source_done", "claims_done", "topics_done", "done"];
  console.log(`\n📥 已入队: ${relPath}`);
  console.log(`   Title:  ${title}`);
  console.log(`   Date:   ${date}`);
  console.log(`   Status: ${status} (step ${step}/4 — ${stepLabels[step]})`);
  console.log(`   Source: ${existsSync(sourcePath) ? "✅ 已存在" : "⏳ 待创建"}`);
  console.log(`   Claims: ${existsSync(claimsPath) ? "✅ 已存在" : "⏳ 待提取"}`);
  console.log(`\n   下一步: bun run harness/process-queue.ts`);
  console.log();
}

main();
