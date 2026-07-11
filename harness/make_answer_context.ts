/**
 * make_answer_context.ts - LLM Wiki Lite Answer Context Builder
 *
 * Searches the knowledge base for a question, then builds a structured
 * answer context file at .tmp/answer_context.md for the LLM to answer from.
 *
 * Usage: bun run harness/make_answer_context.ts "你的问题"
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = path.resolve(import.meta.dir, "..", "index", "browsercode.sqlite");
const OUTPUT_DIR = path.resolve(import.meta.dir, "..", ".tmp");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "answer_context.md");

const KIND_BOOST: Record<string, number> = {
  claim: 3,
  topic: 2,
  entity: 1,
  source: 0,
  query: 0,
};

// Context limits per section
const MAX_CLAIMS = 6;
const MAX_TOPICS = 3;
const MAX_ENTITIES = 3;
const MAX_SOURCES = 3;
const MAX_EXCERPT_CHARS = 1200;
const MAX_TOTAL_CHARS = 12000;

type SearchRow = {
  id: string;
  path: string;
  kind: string;
  title: string;
  content: string;
  score: number;
};

function excerpt(text: string, max = MAX_EXCERPT_CHARS): string {
  if (text.length <= max) return text;
  // Try to find a good breaking point
  const truncated = text.slice(0, max);
  const lastNewline = truncated.lastIndexOf("\n");
  const lastPeriod = truncated.lastIndexOf("。");
  const breakAt = Math.max(lastNewline, lastPeriod);
  if (breakAt > max / 2) {
    return text.slice(0, breakAt) + "\n\n...[truncated]";
  }
  return truncated + "\n\n...[truncated]";
}

function buildFtsQuery(input: string): string {
  const cleaned = input.replace(/[^\w\s\u4e00-\u9fff]/g, " ").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return tokens[0];
  // For Chinese text, OR works better than AND since FTS5 doesn't segment CJK well
  return tokens.map((t) => (t.length > 1 ? `"${t}"` : t)).join(" OR ");
}

function escapeLike(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function searchFts(db: Database, ftsQuery: string): SearchRow[] {
  if (!ftsQuery) return [];
  try {
    const rows = db
      .query(
        `
        SELECT d.id, d.path, d.kind, d.title, d.content
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        WHERE documents_fts MATCH $query
        LIMIT 30
      `
      )
      .all({ $query: ftsQuery }) as Array<{
      id: string;
      path: string;
      kind: string;
      title: string;
      content: string;
    }>;

    return rows.map((row) => {
      const boost = KIND_BOOST[row.kind] ?? 0;
      return { ...row, score: 100 + boost };
    });
  } catch {
    return [];
  }
}

function searchLike(db: Database, query: string): SearchRow[] {
  const likePattern = `%${escapeLike(query)}%`;
  const rows = db
    .query(
      `
      SELECT id, path, kind, title, content
      FROM documents
      WHERE content LIKE $query OR title LIKE $query
      LIMIT 30
    `
    )
    .all({ $query: likePattern }) as Array<{
    id: string;
    path: string;
    kind: string;
    title: string;
    content: string;
  }>;

  return rows.map((row) => {
    const boost = KIND_BOOST[row.kind] ?? 0;
    const lowerContent = row.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let occurrences = 0;
    let idx = 0;
    while ((idx = lowerContent.indexOf(lowerQuery, idx)) !== -1) {
      occurrences++;
      idx += lowerQuery.length;
    }
    return { ...row, score: occurrences * 10 + boost };
  });
}

function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: bun run harness/make_answer_context.ts "your question"');
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error("❌ Index not found. Run 'bun run kb:index' first.");
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  // Search
  const ftsQuery = buildFtsQuery(question);
  let results = searchFts(db, ftsQuery);

  if (results.length < 3) {
    const likeResults = searchLike(db, question);
    const seen = new Set(results.map((r) => r.id));
    for (const r of likeResults) {
      if (!seen.has(r.id)) {
        results.push(r);
        seen.add(r.id);
      }
    }
  }

  db.close();

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Categorize
  const claims = results.filter((r) => r.kind === "claim").slice(0, MAX_CLAIMS);
  const topics = results.filter((r) => r.kind === "topic").slice(0, MAX_TOPICS);
  const entities = results.filter((r) => r.kind === "entity").slice(0, MAX_ENTITIES);
  const sources = results.filter((r) => r.kind === "source").slice(0, MAX_SOURCES);

  // Build the context markdown
  const lines: string[] = [];
  let totalChars = 0;

  function addSection(title: string, items: SearchRow[], prefix: string) {
    if (items.length === 0) return;

    lines.push(`## ${title}`);
    lines.push("");

    items.forEach((item, i) => {
      const excerptText = excerpt(item.content);

      lines.push(`### ${prefix} ${i + 1}: ${item.title}`);
      lines.push("");
      lines.push(`path: ${item.path}`);
      lines.push("");
      lines.push(excerptText);
      lines.push("");

      totalChars += excerptText.length;
    });
  }

  // Header
  lines.push("# Answer Context");
  lines.push("");
  lines.push(`## Question`);
  lines.push("");
  lines.push(question);
  lines.push("");

  // Sections in priority order
  addSection("Retrieved Claims", claims, "Claim");
  addSection("Retrieved Topics", topics, "Topic");
  addSection("Retrieved Entities", entities, "Entity");
  addSection("Retrieved Sources", sources, "Source");

  // Answer Instructions
  lines.push("## Answer Instructions");
  lines.push("");
  lines.push("基于以上内容回答用户问题。");
  lines.push("不要编造未出现在上下文中的事实。");
  lines.push("如果上下文不足，明确指出缺口。");
  lines.push("回答时优先引用 claims，其次引用 topics/entities，最后引用 sources。");
  lines.push("");

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf-8");

  // Summary
  const stats = [
    claims.length > 0 ? `claims: ${claims.length}` : null,
    topics.length > 0 ? `topics: ${topics.length}` : null,
    entities.length > 0 ? `entities: ${entities.length}` : null,
    sources.length > 0 ? `sources: ${sources.length}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  console.log(`✅ Answer context generated: ${OUTPUT_PATH}`);
  console.log(`   Retrieved: ${stats || "(none)"}`);
  console.log(`   Total size: ~${totalChars} chars`);

  if (totalChars > MAX_TOTAL_CHARS) {
    console.log(`   ⚠️  Context exceeds ${MAX_TOTAL_CHARS} chars (${totalChars}), consider narrowing the question.`);
  }
}

main();
