/**
 * search.ts - LLM Wiki Lite Search
 *
 * Searches knowledge base using keyword (FTS5), semantic (embeddings), or hybrid (RRF fusion) mode.
 *
 * Usage:
 *   bun run harness/search.ts "query"           (keyword-only, default for backward compat)
 *   bun run harness/search.ts "query" --keyword (keyword-only)
 *   bun run harness/search.ts "query" --semantic (semantic-only)
 *   bun run harness/search.ts "query" --hybrid   (hybrid RRF fusion)
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import process from "node:process";

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
const RRF_K = 60;
const SEMANTIC_TOP_K = 20;
const FTS_TOP_K = 20;

type SearchResult = {
  id: string;
  path: string;
  kind: string;
  title: string;
  snippet: string;
  score: number;
};

type RankedItem = {
  id: string;
  path: string;
  kind: string;
  title: string;
  rank: number;
};

// ── Float32 BLOB helpers ──

function decodeEmbedding(buf: Buffer): number[] {
  const arr: number[] = [];
  for (let i = 0; i < buf.length; i += 4) arr.push(buf.readFloatLE(i));
  return arr;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

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
  const cleaned = input.replace(/[^\w\s一-鿿]/g, " ").trim();
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

// ── Ranked FTS5 search (for RRF fusion) ──

function searchFtsRanked(db: Database, ftsQuery: string): RankedItem[] {
  if (!ftsQuery) return [];
  try {
    const rows = db
      .query(
        `
        SELECT d.id, d.path, d.kind, d.title
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        WHERE documents_fts MATCH $query
        ORDER BY rank
        LIMIT ${FTS_TOP_K}
      `
      )
      .all({ $query: ftsQuery }) as Array<{
      id: string;
      path: string;
      kind: string;
      title: string;
    }>;

    return rows.map((row, i) => ({
      id: row.id,
      path: row.path,
      kind: row.kind,
      title: row.title,
      rank: i + 1,
    }));
  } catch {
    return [];
  }
}

// ── Semantic search via DeepSeek embeddings API ──

async function searchSemantic(db: Database, query: string): Promise<RankedItem[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("DEEPSEEK_API_KEY not set; semantic search unavailable");
    return [];
  }

  // Call DeepSeek embeddings API
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-chat", input: query }),
    });
  } catch {
    console.error("Embeddings API call failed (network error)");
    return [];
  }

  if (!response.ok) {
    console.error(`Embeddings API error: ${response.status} ${response.statusText}`);
    return [];
  }

  const json = (await response.json()) as any;
  const queryEmbedding: number[] = json.data?.[0]?.embedding;
  if (!queryEmbedding) {
    console.error("Empty embedding response from API");
    return [];
  }

  // Fetch all claim embeddings from DB
  const embeddings = db
    .query(
      `SELECT ce.claim_id, ce.source_path, ce.embedding, d.id, d.kind, d.title
       FROM claim_embeddings ce
       JOIN documents d ON d.path = ce.source_path`
    )
    .all() as Array<{
    claim_id: string;
    source_path: string;
    embedding: Buffer;
    id: string;
    kind: string;
    title: string;
  }>;

  if (embeddings.length === 0) return [];

  // Compute cosine similarity for each claim embedding
  const scored = embeddings.map((row) => ({
    source_path: row.source_path,
    id: row.id,
    kind: row.kind,
    title: row.title,
    sim: cosineSimilarity(queryEmbedding, decodeEmbedding(row.embedding)),
  }));

  // Sort descending by similarity
  scored.sort((a, b) => b.sim - a.sim);

  // Deduplicate: keep best score per document (source_path)
  const seen = new Set<string>();
  const deduped: typeof scored = [];
  for (const item of scored) {
    if (!seen.has(item.source_path)) {
      seen.add(item.source_path);
      deduped.push(item);
    }
    if (deduped.length >= SEMANTIC_TOP_K) break;
  }

  // Assign ranks 1..N
  return deduped.map((item, i) => ({
    id: item.id,
    path: item.source_path,
    kind: item.kind,
    title: item.title,
    rank: i + 1,
  }));
}

// ── RRF(60) fusion ──
// score(doc) = sum(1 / (RRF_K + rank_i)) over all ranked lists

function fuseRrf(semantic: RankedItem[], keyword: RankedItem[]): SearchResult[] {
  const scoreMap = new Map<string, number>();
  const itemMap = new Map<string, Omit<RankedItem, "rank">>();

  for (const item of semantic) {
    scoreMap.set(item.id, 1 / (RRF_K + item.rank));
    itemMap.set(item.id, { id: item.id, path: item.path, kind: item.kind, title: item.title });
  }

  for (const item of keyword) {
    const existing = scoreMap.get(item.id);
    if (existing !== undefined) {
      scoreMap.set(item.id, existing + 1 / (RRF_K + item.rank));
    } else {
      scoreMap.set(item.id, 1 / (RRF_K + item.rank));
      itemMap.set(item.id, { id: item.id, path: item.path, kind: item.kind, title: item.title });
    }
  }

  return Array.from(scoreMap.entries())
    .map(([id, score]) => ({
      id,
      path: itemMap.get(id)!.path,
      kind: itemMap.get(id)!.kind,
      title: itemMap.get(id)!.title,
      snippet: "",
      score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

function getSnippets(db: Database, results: SearchResult[]): void {
  for (const r of results) {
    if (r.snippet) continue;
    try {
      const row = db
        .query("SELECT content FROM documents WHERE id = ?", [r.id])
        .get() as { content: string } | null;
      r.snippet = row ? excerpt(row.content) : "";
    } catch {
      r.snippet = "";
    }
  }
}

async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: bun run harness/search.ts "your question" [--keyword|--semantic|--hybrid]');
    process.exit(1);
  }

  // Detect search mode from CLI flags
  const cliArgs = process.argv.slice(3);
  const isHybrid = cliArgs.includes("--hybrid");
  const isSemantic = cliArgs.includes("--semantic");
  const isKeyword = cliArgs.includes("--keyword");
  const mode = isHybrid ? "hybrid" : isSemantic ? "semantic" : "keyword";

  const dbPath = DB_PATH;
  const dbExists = require("fs").existsSync(dbPath);
  if (!dbExists) {
    console.error("❌ Index not found. Run 'bun run kb:index' first.");
    process.exit(1);
  }

  const db = new Database(dbPath);

  let results: SearchResult[] = [];

  if (mode === "semantic") {
    // ── Semantic-only mode ──
    const semanticItems = await searchSemantic(db, question);
    results = semanticItems.map((item, i) => ({
      id: item.id,
      path: item.path,
      kind: item.kind,
      title: item.title,
      snippet: "",
      score: TOP_K - i,
    }));
    results = results.slice(0, TOP_K);
  } else if (mode === "hybrid") {
    // ── Hybrid mode: RRF(60) fusion of FTS5 + semantic ──
    const ftsQuery = buildFtsQuery(question);
    const [semanticItems, ftsItems] = await Promise.all([
      searchSemantic(db, question),
      Promise.resolve(searchFtsRanked(db, ftsQuery)),
    ]);
    results = fuseRrf(semanticItems, ftsItems);
  } else {
    // ── Keyword-only mode (existing behavior) ──
    const ftsQuery = buildFtsQuery(question);
    results = searchFts(db, ftsQuery);

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
  }

  // Fetch snippets for RRF/semantic results without content
  getSnippets(db, results);

  db.close();

  // Output
  if (results.length === 0) {
    console.log("No matching results found.\n");
    console.log("Try rephrasing your question or run 'bun run kb:index' to rebuild the index.");
    process.exit(0);
  }

  const modeLabel = mode === "hybrid" ? "Hybrid" : mode === "semantic" ? "Semantic" : "Keyword";
  console.log(`Top matches for: "${question}" (${modeLabel})\n`);

  results.forEach((r, i) => {
    const kindTag = r.kind.padEnd(7);
    console.log(`${i + 1}. [${kindTag}] ${r.path}`);
    console.log(`   ${r.title}`);
    console.log(`   ${r.snippet.replace(/\n/g, "\n   ")}`);
    console.log();
  });
}

main();
