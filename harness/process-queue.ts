/**
 * process-queue.ts — 处理捕获队列的自动化状态机
 *
 * Usage:
 *   bun run harness/process-queue.ts             处理队列
 *   bun run harness/process-queue.ts --scan      扫描 vault/ 找出未入队笔记
 *   bun run harness/process-queue.ts --scan --enqueue-missing  扫描并自动入队
 *   bun run harness/process-queue.ts --dry-run   预览不执行
 *
 * 状态机递进逻辑：
 *   pending(0)
 *     │  检查 kb/sources/YYYY-MM-DD-title.md 是否存在
 *     │  存在 → source_done(1)  │ 不存在 → 打印待办
 *     ▼
 *   source_done(1)
 *     │  检查 kb/claims/YYYY-MM-DD-title.claims.md 是否存在
 *     │  存在 → claims_done(2)  │ 不存在 → 打印待办
 *     ▼
 *   claims_done(2)
 *     │  ★ topics/entities 补充引用 = LLM 判断，自动化只标记警示
 *     │  自动推进到 topics_done(3)
 *     ▼
 *   topics_done(3)
 *     │  自动执行 bun run kb:index
 *     │  成功 → done(4)  │ 失败 → failed
 *     ▼
 *   done(4) ✅
 *
 * --scan 模式：
 *   从 vault/ 反向扫描，对比 kb/sources/，找出从未入队的"孤儿"笔记。
 *   解决了"状态机只处理被人手动 enqueue 的条目，看不见 vault 全貌"的设计缺陷。
 *
 * 设计原则：
 *   - 幂等：重复执行不会破坏状态
 *   - 人类在环：source 和 claims 必须手动创建，自动化只检不写
 *   - 透明：每一步输出详细状态
 *   - 扫描是只读的（除非加 --enqueue-missing）
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, basename, relative, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import {
  openDb,
  PROJECT_ROOT,
  KB_ROOT,
  VAULT_ROOT,
  sourceFileName,
  parseFrontmatter,
  currentDate,
} from "./db.ts";

interface QueueEntry {
  id: number;
  vault_path: string;
  vault_title: string | null;
  captured_date: string | null;
  status: string;
  step: number;
  error: string | null;
}

const STEP_LABELS = ["pending", "source_done", "claims_done", "topics_done", "done"];

/**
 * scanVaultForOrphans — 从 vault/ 反向扫描，发现未入队的笔记
 *
 * 设计原因：队列模式只能处理被人 enqueue 的条目。
 * 但状态机诞生之前就存在的笔记、git hook 失败没入队的笔记、
 * 或者 agent 忘记入队的笔记，都永久处于队列盲区。
 *
 * 这个函数从 vault/ 出发，对比 kb/sources/，找出所有"孤儿"。
 */
async function scanVaultForOrphans(enqueueMissing: boolean) {
  console.log(`\n🔍 扫描 vault/ 对比 kb/sources/...\n`);

  // 收集所有已有的 source 信息
  // 现有 source 文件没有 YAML frontmatter，metadata 写在 ## Metadata 节，
  // 但每条都引用了 vault 路径（在 ## Original Reference 节）。
  // 所以我们反过来：全文搜索每个 source 文件，找出它引用了哪个 vault 文件。
  const sourceDir = resolve(KB_ROOT, "sources");
  const vaultRefIndex = new Map<string, string>(); // vault_rel_path → source_filename
  let knownSourceFiles = new Set<string>();
  try {
    const files = await readdir(sourceDir);
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      knownSourceFiles.add(f.replace(/\.md$/, ""));
      try {
        const srcContent = readFileSync(resolve(sourceDir, f), "utf-8");
        // 搜索 vault/ 路径引用（在 ## Original Reference 节或内容中）
        const vaultRefs = srcContent.match(/vault\/[^\s)]+/g);
        if (vaultRefs) {
          for (const ref of vaultRefs) {
            vaultRefIndex.set(ref, f.replace(/\.md$/, ""));
          }
        }
      } catch {
        // 跳过无法读取的 source 文件
      }
    }
  } catch {
    // kb/sources/ 可能还不存在
  }

  // 遍历 vault/ 下所有 .md 文件
  const vaultFiles: string[] = [];
  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
          vaultFiles.push(full);
        }
      }
    } catch {
      // 跳过无法访问的目录
    }
  }
  await walk(VAULT_ROOT);

  // 逐文件检查
  const orphans: Array<{ path: string; title: string; expectedSource: string; hasDate: boolean }> = [];
  const matched: Array<{ path: string; source: string }> = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const absPath of vaultFiles) {
    const relPath = relative(PROJECT_ROOT, absPath).replace(/\\/g, "/");

    // 跳过不在常规 vault 目录下的文件（如 resources/design-style 是设计参考，不需要 source）
    if (relPath.includes("resources/design-style")) {
      skipped.push({ path: relPath, reason: "design-style 不需要 source" });
      continue;
    }

    const content = readFileSync(absPath, "utf-8");
    const fm = parseFrontmatter(content);
    const title = String(fm.title || basename(relPath, ".md"));
    // date 可能来自 date 字段或 captured_at 字段
    const date = String(fm.date || fm.captured_at || "");
    const sourceUrl = String(fm.source_url || "").trim();

    if (!date) {
      skipped.push({ path: relPath, reason: "frontmatter 缺少 date/captured_at" });
      continue;
    }

    const expectedSource = sourceFileName(relPath, date);
    const nameMatch = knownSourceFiles.has(expectedSource);

    // 除了文件名匹配，还尝试按 vault 路径引用匹配（兼容旧 source 文件）
    const refMatch = vaultRefIndex.has(relPath);

    if (nameMatch || refMatch) {
      const how = nameMatch ? `文件名 ${expectedSource}` : `vault 路径引用 (→${vaultRefIndex.get(relPath)})`;
      matched.push({ path: relPath, source: how });
    } else {
      orphans.push({ path: relPath, title, expectedSource, hasDate: !!date });
    }
  }

  // ── 输出报告 ──────────────────────────────────────────────────────────

  console.log(`  vault/ 笔记总数:     ${vaultFiles.length}`);
  console.log(`  已有 kb/sources:     ${matched.length}`);
  console.log(`  未入队 (orphan):     ${orphans.length}`);
  console.log(`  已跳过:              ${skipped.length}`);

  if (orphans.length > 0) {
    console.log(`\n${"─".repeat(56)}`);
    console.log(`  📋 孤儿笔记列表`);
    for (const o of orphans) {
      const inQueue = false; // will check below
      console.log(`\n  ${o.path}`);
      console.log(`     Title:  ${o.title}`);
      console.log(`     → 期望: kb/sources/${o.expectedSource}.md`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n${"─".repeat(56)}`);
    console.log(`  ⏭️  已跳过`);
    for (const s of skipped) {
      console.log(`     ${s.path}  (${s.reason})`);
    }
  }

  // ── 自动入队 ───────────────────────────────────────────────────────────
  if (orphans.length > 0 && enqueueMissing) {
    console.log(`\n${"─".repeat(56)}`);
    console.log(`  📥 自动入队 ${orphans.length} 个孤儿笔记...`);

    const db = openDb();
    const now = currentDate();
    let enqueued = 0;

    for (const o of orphans) {
      const relPath = o.path;
      const content = readFileSync(resolve(PROJECT_ROOT, relPath), "utf-8");
      const fm = parseFrontmatter(content);
      const title = String(fm.title || basename(relPath, ".md"));
      const date = String(fm.date || currentDate());

      // 检查是否已在队列中
      const existing = db
        .query<{ cnt: number }, [string]>(
          `SELECT COUNT(*) as cnt FROM processing_queue WHERE vault_path = $path`
        )
        .get(relPath);

      if (existing && existing.cnt > 0) {
        console.log(`     ⏭️  ${relPath} — 已在队列中`);
        continue;
      }

      db.run(
        `INSERT INTO processing_queue (vault_path, vault_title, captured_date, status, step, created_at, updated_at)
         VALUES ($path, $title, $date, 'pending', 0, $now, $now)`,
        { $path: relPath, $title: title, $date: date, $now: now }
      );
      console.log(`     📥 ${relPath}`);
      enqueued++;
    }

    db.close();
    console.log(`\n  ✅ 已入队 ${enqueued} 个笔记`);
  }

  // ── 总结 ───────────────────────────────────────────────────────────────
  if (orphans.length > 0) {
    console.log(`\n${"═".repeat(56)}`);
    console.log(`  💡 发现 ${orphans.length} 个孤儿笔记！`);
    if (!enqueueMissing) {
      console.log(`     重新运行加 --enqueue-missing 自动入队`);
    }
    console.log(`     然后: bun run harness/process-queue.ts`);
  } else {
    console.log(`\n✅ vault/ 与 kb/sources/ 一致，无孤儿笔记。`);
  }
  console.log();
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (args.includes("--help")) {
    console.log(`
Usage: bun run harness/process-queue.ts [options]

Process the capture queue — advance each entry through its workflow steps.

Options:
  --scan              Scan vault/ for notes missing from kb/sources/ (orphan detection)
  --enqueue-missing   (with --scan) Auto-enqueue orphans found by scan
  --dry-run           Preview what would be done without making changes
  --help              Show this help

Examples:
  bun run harness/process-queue.ts                         process queue
  bun run harness/process-queue.ts --scan                   find orphan vault notes
  bun run harness/process-queue.ts --scan --enqueue-missing find + enqueue orphans
`);
    process.exit(0);
  }

  // ── Scan mode: vault/ → kb/sources/ gap analysis ──────────────────────
  if (args.includes("--scan")) {
    const enqueueMissing = args.includes("--enqueue-missing");
    scanVaultForOrphans(enqueueMissing);
    return;
  }

  const db = openDb();

  // 读取所有未完成的队列条目
  const entries = db
    .query<QueueEntry, []>(
      `SELECT * FROM processing_queue
       WHERE status NOT IN ('done', 'failed')
       ORDER BY created_at ASC`
    )
    .all();

  if (entries.length === 0) {
    console.log("\n✅ 队列为空，所有笔记已完成处理。\n");
    db.close();
    return;
  }

  const now = new Date().toISOString();
  let processed = 0;
  let advanced = 0;
  let blocked = 0;
  let failed = 0;

  for (const entry of entries) {
    console.log(`\n${"─".repeat(56)}`);
    console.log(`  📄 ${entry.vault_path}`);
    console.log(`  Title: ${entry.vault_title || "(no title)"}`);
    console.log(`  Step:  ${entry.step}/4 — ${STEP_LABELS[entry.step] || "unknown"}`);

    const sourceName = sourceFileName(
      entry.vault_path,
      entry.captured_date || new Date().toISOString().slice(0, 10)
    );

    const sourcePath = resolve(KB_ROOT, "sources", `${sourceName}.md`);
    const claimsPath = resolve(KB_ROOT, "claims", `${sourceName}.claims.md`);

    // ── Step 0 → 1: Check source ────────────────────────────────────────
    if (entry.step === 0) {
      if (existsSync(sourcePath)) {
        console.log(`     ✅ kb/sources/${sourceName}.md 已存在 → 推进到 source_done`);
        if (!dryRun) {
          db.run(
            `UPDATE processing_queue SET status = 'source_done', step = 1, updated_at = $now WHERE id = $id`,
            { $now: now, $id: entry.id }
          );
        }
        advanced++;
      } else {
        console.log(`     ⏳ kb/sources/${sourceName}.md 不存在`);
        console.log(`        需要: 创建 kb/sources/${sourceName}.md`);
        console.log(`        模板: wiki/CAPTURE_WORKFLOW.md`);
        blocked++;
      }
      processed++;
      continue;
    }

    // ── Step 1 → 2: Check claims ────────────────────────────────────────
    if (entry.step === 1) {
      if (existsSync(claimsPath)) {
        console.log(`     ✅ kb/claims/${sourceName}.claims.md 已存在 → 推进到 claims_done`);
        if (!dryRun) {
          db.run(
            `UPDATE processing_queue SET status = 'claims_done', step = 2, updated_at = $now WHERE id = $id`,
            { $now: now, $id: entry.id }
          );
        }
        advanced++;
      } else {
        console.log(`     ⏳ kb/claims/${sourceName}.claims.md 不存在`);
        console.log(`        需要: 创建 kb/claims/${sourceName}.claims.md`);
        console.log(`        策略: wiki/CLAIM_POLICY.md`);
        blocked++;
      }
      processed++;
      continue;
    }

    // ── Step 2 → 3: Topics/entities (always advance, print reminder) ────
    if (entry.step === 2) {
      console.log(`     ℹ️  Topics/entities: 自动化无法判断，标记警示后推进`);
      if (!dryRun) {
        db.run(
          `UPDATE processing_queue SET status = 'topics_done', step = 3, updated_at = $now WHERE id = $id`,
          { $now: now, $id: entry.id }
        );
      }
      console.log(`        提醒: 如涉及已有主题/实体，补充引用到 kb/topics/ 或 kb/entities/.md`);
      advanced++;
      processed++;
      continue;
    }

    // ── Step 3 → 4: Rebuild index ───────────────────────────────────────
    if (entry.step === 3) {
      console.log(`     🔄  重建 FTS 索引...`);
      if (!dryRun) {
        try {
          execSync("bun run harness/build_index.ts", {
            cwd: PROJECT_ROOT,
            stdio: "inherit",
          });
          db.run(
            `UPDATE processing_queue SET status = 'done', step = 4, updated_at = $now WHERE id = $id`,
            { $now: now, $id: entry.id }
          );
          console.log(`     ✅ 索引重建完成 → 标记为 done`);
          advanced++;
        } catch (err) {
          const errMsg = String(err);
          db.run(
            `UPDATE processing_queue SET status = 'failed', error = $err, updated_at = $now WHERE id = $id`,
            { $now: now, $id: entry.id, $err: errMsg }
          );
          console.error(`     ❌ 索引重建失败: ${errMsg}`);
          failed++;
        }
      } else {
        console.log(`     (dry-run) 将重建索引并标记为 done`);
        advanced++;
      }
      processed++;
      continue;
    }
  }

  db.close();

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(56)}`);
  console.log(`  处理摘要`);
  console.log(`${"─".repeat(56)}`);
  console.log(`  总条目:    ${entries.length}`);
  console.log(`  推进:      ${advanced}`);
  console.log(`  阻塞:      ${blocked}`);
  console.log(`  失败:      ${failed}`);

  if (!dryRun) {
    // 再次查询当前状态
    const remaining = openDb()
      .query<QueueEntry, []>(
        `SELECT * FROM processing_queue WHERE status NOT IN ('done', 'failed') ORDER BY created_at ASC`
      )
      .all();
    if (remaining.length > 0) {
      console.log(`\n  剩余未完成: ${remaining.length}`);
      for (const r of remaining) {
        const sName = sourceFileName(
          r.vault_path,
          r.captured_date || new Date().toISOString().slice(0, 10)
        );
        const stepName = STEP_LABELS[r.step] || "?";
        const blocker =
          r.step === 0
            ? `缺少 kb/sources/${sName}.md`
            : r.step === 1
            ? `缺少 kb/claims/${sName}.claims.md`
            : r.step === 2
            ? `需要手动检查 topics/entities`
            : r.step === 3
            ? `索引重建失败`
            : "";
        console.log(`     ${r.vault_path}  (step ${r.step}: ${stepName}) — ${blocker}`);
      }
      console.log(`\n  完成上述待办后，重新运行: bun run harness/process-queue.ts`);
    }
  }
  console.log();
}

main();
