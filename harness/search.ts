/**
 * search.ts - LLM Wiki Lite Search
 *
 * Searches the FTS5 index for relevant documents.
 * Falls back to LIKE search when FTS returns < 3 results (for Chinese text).
 *
 * Usage: bun run harness/search.ts "你的问题"
 */

import { Database } from "bun:sqlite";
import path from "node:path";

const DB_PATH = path.resolve(import.meta.dir, "..", "index", "browsercode.sqlite");

// Kind boost: claims > topics > entities > sources
const KIND_BOOST: Record<string, number> = {
  claim: 3,
  topic: 2,
  entity: 1,
  source: 0,
  query: 0,
};

const TOP_K = 8;
const MIN_FTS_RESULTS = 3;
const SNIPPET_MAX = 200;

type SearchResult = {
  id: string;
  path: string;
  kind: string;
  title: string;
  snippet: string;
  score: number;
};

function excerpt(text: string, max = SNIPPET_MAX): string {
  // Try to find a natural break point
  if (text.length <= max) return text;
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
  // Split input into meaningful tokens, join with OR
  // Remove special FTS5 characters
  const cleaned = input.replace(/[^\w\s\u4e00-\u9fff]/g, " ").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return "";

  // For single token, just use it directly
  if (tokens.length === 1) return tokens[0];

  // For multiple tokens, use OR
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

function escapeLike(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function searchFts(db: Database, ftsQuery: string): SearchResult[] {
  if (!ftsQuery) return [];

  try {
    const rows = db
      .query(
        `
        SELECT d.id, d.path, d.kind, d.title, d.content
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        WHERE documents_fts MATCH $query
        LIMIT ${TOP_K * 2}
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
      // FTS5 rank is lower = better; we invert it and add boost
      // Since we can't easily get rank from simple query, use position-based score
      return {
        id: row.id,
        path: row.path,
        kind: row.kind,
        title: row.title,
        snippet: excerpt(row.content),
        score: 100 + boost, // Base 100 + kind boost
      };
    });
  } catch {
    // FTS query might fail on certain characters
    return [];
  }
}

function searchLike(db: Database, query: string): SearchResult[] {
  const likePattern = `%${escapeLike(query)}%`;

  const rows = db
    .query(
      `
      SELECT id, path, kind, title, content
      FROM documents
      WHERE content LIKE $query OR title LIKE $query
      LIMIT 20
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
    // Count occurrences for simple relevance
    const lowerContent = row.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let occurrences = 0;
    let idx = 0;
    while ((idx = lowerContent.indexOf(lowerQuery, idx)) !== -1) {
      occurrences++;
      idx += lowerQuery.length;
    }

    return {
      id: row.id,
      path: row.path,
      kind: row.kind,
      title: row.title,
      snippet: excerpt(row.content),
      score: occurrences * 10 + boost,
    };
  });
}

function main() {
  const question = process.argv[2];
  if (!question) {
    console.error("Usage: bun run harness/search.ts \"your question\"");
    process.exit(1);
  }

  const dbPath = DB_PATH;
  const dbExists = require("fs").existsSync(dbPath);
  if (!dbExists) {
    console.error("❌ Index not found. Run 'bun run kb:index' first.");
    process.exit(1);
  }

  const db = new Database(dbPath);

  // Phase 1: FTS search
  const ftsQuery = buildFtsQuery(question);
  let results = searchFts(db, ftsQuery);

  // Phase 2: LIKE fallback if FTS returned too few results
  if (results.length < MIN_FTS_RESULTS) {
    const likeResults = searchLike(db, question);

    // Merge: deduplicate by id, prefer FTS results for already-found items
    const seen = new Set(results.map((r) => r.id));
    for (const r of likeResults) {
      if (!seen.has(r.id)) {
        results.push(r);
        seen.add(r.id);
      }
    }
  }

  // Sort: by score descending, then kind boost
  results.sort((a, b) => b.score - a.score || (KIND_BOOST[b.kind] ?? 0) - (KIND_BOOST[a.kind] ?? 0));

  // Take top K
  results = results.slice(0, TOP_K);

  db.close();

  // Output
  if (results.length === 0) {
    console.log("No matching results found.\n");
    console.log("Try rephrasing your question or run 'bun run kb:index' to rebuild the index.");
    process.exit(0);
  }

  console.log(`Top matches for: "${question}"\n`);

  results.forEach((r, i) => {
    const kindTag = r.kind.padEnd(7);
    console.log(`${i + 1}. [${kindTag}] ${r.path}`);
    console.log(`   ${r.title}`);
    console.log(`   ${r.snippet.replace(/\n/g, "\n   ")}`);
    console.log();
  });
}

main();
