/**
 * db.ts — SQLite 数据库共享模块
 *
 * 统一管理 index/browsercode.sqlite 的连接和 Schema。
 * 所有 kb: 系列脚本共享此模块。
 */

import { Database } from "bun:sqlite";
import { resolve, basename } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export const PROJECT_ROOT = resolve(import.meta.dir, "..");
export const INDEX_DIR = resolve(PROJECT_ROOT, "index");
export const DB_PATH = resolve(INDEX_DIR, "browsercode.sqlite");
export const KB_ROOT = resolve(PROJECT_ROOT, "kb");
export const VAULT_ROOT = resolve(PROJECT_ROOT, "vault");

/** 确保目录存在 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 打开连接并创建/迁移所有表 */
export function openDb(): Database {
  ensureDir(INDEX_DIR);

  const db = new Database(DB_PATH);

  // 生产环境用 WAL 模式提高并发性能
  db.run("PRAGMA journal_mode=WAL");

  // documents + FTS（已被 build_index.ts 使用）
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      id UNINDEXED,
      path UNINDEXED,
      kind,
      title,
      content
    )
  `);

  // processing_queue（捕获流程状态机）
  db.run(`
    CREATE TABLE IF NOT EXISTS processing_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_path TEXT NOT NULL UNIQUE,
      vault_title TEXT,
      captured_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','source_done','claims_done','topics_done','done','failed')),
      step INTEGER NOT NULL DEFAULT 0
        CHECK(step BETWEEN 0 AND 4),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 迁移：兼容旧表没有 CHECK constraint 的情况
  db.run(`
    UPDATE processing_queue
    SET status = 'pending', step = 0
    WHERE status NOT IN ('pending','source_done','claims_done','topics_done','done','failed')
  `);

  // links 表（P2 链接同步管线）
  db.run(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('topic','entity','claim','source')),
      target_path TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('topic','entity','claim','source')),
      link_kind TEXT NOT NULL DEFAULT 'ref' CHECK(link_kind IN ('ref','conflict','merged_into','synthesized_from')),
      link_context TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_path, target_path, link_kind)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path)");
  db.run("CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path)");

  return db;
}

/** 从 vault 笔记 frontmatter 解析元数据 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return meta;

  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value: unknown = line.slice(sep + 1).trim();

    if (typeof value === "string") {
      // Strip surrounding quotes: "foo" or 'foo'
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Parse arrays like tags: [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        try { value = JSON.parse(value); } catch { /* keep as string */ }
      }
    }

    meta[key] = value;
  }
  return meta;
}

/** vault 相对路径 → source 文件名（遵循 YYYY-MM-DD-stem 惯例） */
export function sourceFileName(vaultPath: string, capturedDate: string): string {
  const stem = basename(vaultPath, ".md");
  return `${capturedDate}-${stem}`;
}

/** 当前日期 YYYY-MM-DD */
export function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
