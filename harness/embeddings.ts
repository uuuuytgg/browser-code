/**
 * embeddings.ts — LLM Wiki 语义嵌入管道
 *
 * 调用 DeepSeek Embeddings API，将 kb/claims/ 下所有 claim 编码为
 * float32 BLOB 存入 claim_embeddings 表，并做余弦相似度去重检查。
 *
 * Usage: bun run kb:embeddings
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb, KB_ROOT } from "./db.ts";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not set");
const EMBED_URL = "https://api.deepseek.com/v1/embeddings";

/** 探测 embedding 维度 */
async function getEmbeddingDim(): Promise<number> {
  const r = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "deepseek-chat", input: "test" }),
  });
  const j = (await r.json()) as any;
  return j.data?.[0]?.embedding?.length || 1024;
}

/**
 * 批量生成 embedding 向量
 * 内置 429 限流重试：最多 3 次，每次间隔 2 秒
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "deepseek-chat", input: texts }),
    });

    if (res.status === 429) {
      if (attempt < 2) {
        console.warn(`  Rate limited (429), retrying in 2s... (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error("Embedding API rate-limited after 3 retries");
    }

    if (!res.ok) {
      throw new Error(`Embedding API error ${res.status}: ${await res.text()}`);
    }

    const j = (await res.json()) as any;
    return j.data.map((d: any) => d.embedding);
  }
  throw new Error("Embedding API failed after 3 retries");
}

/** 从 .claims.md 文件中提取 claim ID + 文本 */
function extractClaims(
  filePath: string,
): Array<{ id: string; text: string }> {
  const content = readFileSync(filePath, "utf8");
  const claims: Array<{ id: string; text: string }> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- [") && trimmed.includes("]")) {
      const idMatch = trimmed.match(/\*\*C(\d+)\*\*/);
      if (!idMatch) continue;
      const id = `C${idMatch[1]}`;
      const afterType = trimmed.slice(trimmed.indexOf("]") + 1).trim();
      const emdash = afterType.indexOf("—");
      claims.push({
        id,
        text: emdash >= 0 ? afterType.slice(0, emdash).trim() : afterType,
      });
    }
  }
  return claims;
}

/** float64[] ← float32 BLOB */
function decodeEmbedding(buf: Buffer): number[] {
  const arr: number[] = [];
  for (let i = 0; i < buf.length; i += 4) arr.push(buf.readFloatLE(i));
  return arr;
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const db = openDb();

  // 探测 API embedding 维度
  const dim = await getEmbeddingDim();
  console.log(`Embedding dim: ${dim}`);

  // claim_embeddings 表（also defined in db.ts openDb()）
  db.run(`
    CREATE TABLE IF NOT EXISTS claim_embeddings (
      claim_id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      embedding BLOB NOT NULL
    )
  `);

  // 扫描所有 claims 文件
  const claimsDir = join(KB_ROOT, "claims");
  const files = readdirSync(claimsDir).filter((f) => f.endsWith(".claims.md"));

  const batch: Array<{ id: string; text: string; source_path: string }> = [];
  for (const f of files) {
    for (const c of extractClaims(join(claimsDir, f))) {
      batch.push({ ...c, source_path: `kb/claims/${f}` });
    }
  }
  console.log(`Found ${batch.length} claims in ${files.length} files`);

  // 分批编码（每批 20 条）
  const BATCH_SIZE = 20;
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO claim_embeddings (claim_id, source_path, embedding) VALUES (?, ?, ?)",
  );
  let processed = 0;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    const texts = chunk.map((c) => c.text);
    const embeddings = await generateEmbeddings(texts);
    for (let j = 0; j < chunk.length; j++) {
      const buf = Buffer.alloc(embeddings[j].length * 4);
      for (let k = 0; k < embeddings[j].length; k++)
        buf.writeFloatLE(embeddings[j][k], k * 4);
      stmt.run(chunk[j].id, chunk[j].source_path, buf);
    }
    processed += chunk.length;
    console.log(`Embedded: ${processed}/${batch.length}`);
  }

  // 语义去重检查：两两余弦相似度 > 0.92 报警
  const all = db
    .query("SELECT claim_id, embedding FROM claim_embeddings")
    .all() as Array<{ claim_id: string; embedding: Buffer }>;
  const duplicates: Array<{ a: string; b: string; sim: number }> = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const ea = decodeEmbedding(all[i].embedding);
      const eb = decodeEmbedding(all[j].embedding);
      const sim = cosineSimilarity(ea, eb);
      if (sim > 0.92) {
        duplicates.push({
          a: all[i].claim_id,
          b: all[j].claim_id,
          sim: Number(sim.toFixed(3)),
        });
      }
    }
  }
  if (duplicates.length > 0) {
    console.log(`\nSemantic similarity > 0.92: ${duplicates.length} pairs`);
    for (const d of duplicates)
      console.log(`  ${d.a} ↔ ${d.b} (${d.sim})`);
  } else {
    console.log(`\nNo semantic duplicates found (threshold 0.92)`);
  }

  console.log(`\nDone. ${processed} claims embedded.`);
  db.close();
}

main();
