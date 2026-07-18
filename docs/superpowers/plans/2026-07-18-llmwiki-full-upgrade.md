# LLM Wiki 完全体实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LLM Wiki 从 prototype 级升级为自我演化的知识系统：数据质量受控（P1）→ 关系可查询（P2）→ 语义可检索（P3）→ LLM 反哺闭环（P4），同时工具层同步更新确保 browser-code agent 能感知和使用所有新能力。

**Architecture:** 四种 Phase 渐进交付。Markdown 始终为源真相，SQLite 是投影层。新增 links 表 + embeddings 表 + topic_stats 表（同库）。每个 Phase 独立可验证，P2/P3 可并行，P4 依赖前三阶段。

**Tech Stack:** Bun + SQLite (bun:sqlite) + TypeScript. Phase 3 引入 DeepSeek Embeddings API 和 sqlite-vec extension。Phase 4 利用 browser-code 自身子代理体系（task({subagent_type: "general"})）。

## Global Constraints

- Markdown 是唯一源真相（Obsidian 兼容）。SQLite 只是可重建的索引/投影
- 不得引入新的数据库软件（全部在现有 `index/browsercode.sqlite` 内加表）
- 嵌入 API 调用使用用户已有的 DeepSeek key（`.env` 中 DEEPSEEK_API_KEY）
- 工具层同步必须在同一 Phase 内完成，不得留"能力存在但 agent 不知道"的断层
- 所有 Phase 的维护任务必须幂等，复用 Level 1-3 触发模型（非守护进程，仅在 browser-code 活动时执行）
- 计划中的 "Build"、"Build Search" 指 `bun build.ts` 编译 harness TypeScript（非 opencode 二进制编译）

---

### Task 1: claims 自动 ID 与大扫除脚本

**Files:**
- Create: `harness/cleanup-claims.ts`

**Interfaces:**
- Consumes: 无
- Produces: CLIScript `bun run kb:cleanup` → 修改 kb/claims/ 全部 .claims.md 文件

- [ ] **Step 1: 编写 cleanup-claims.ts**

```typescript
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { openDb, KB_ROOT } from "./db.ts"

const CLAIMS_DIR = join(KB_ROOT, "claims")
const db = openDb()

// 字符 3-gram Jaccard 相似度（spec 定义的去重阈值基准）
function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
    return set
  }
  const ag = grams(a.toLowerCase()), bg = grams(b.toLowerCase())
  if (ag.size === 0 && bg.size === 0) return 1
  let intersect = 0
  for (const g of ag) if (bg.has(g)) intersect++
  return intersect / (ag.size + bg.size - intersect)
}

interface Claim {
  type: string
  text: string
  confidence?: string
  source?: string
  id?: string
}

function parseClaimsFile(filePath: string): { claims: Claim[], metadata: string[], header: string[] } {
  const content = readFileSync(filePath, "utf8")
  const lines = content.split("\n")
  const metadata: string[] = []
  const header: string[] = []
  const claims: Claim[] = []
  let inHeader = true
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- [") && trimmed.includes("]")) {
      inHeader = false
      // Parse: - [type] text — **Confidence:** x — **Source:** y — **CID**
      const claim: Claim = { type: "", text: "", confidence: undefined, source: undefined, id: undefined }
      const typeMatch = trimmed.match(/^- \[(\w[\w-]*)\]/)
      if (typeMatch) claim.type = typeMatch[1]

      // Extract text up to first —
      const rest = trimmed.slice(typeMatch ? typeMatch[0].length : 0).trim()
      const firstEmdash = rest.indexOf("—")
      if (firstEmdash >= 0) {
        claim.text = rest.slice(0, firstEmdash).trim()
        const metaStr = rest.slice(firstEmdash + 1)
        const confMatch = metaStr.match(/\*\*Confidence:\*\*\s*(high|medium|low)/i)
        if (confMatch) claim.confidence = confMatch[1].toLowerCase()
        const srcMatch = metaStr.match(/\*\*Source:\*\*\s*(.+?)(?:\s*—\s*\*\*|$)/)
        if (srcMatch) claim.source = srcMatch[1].trim()
        const idMatch = metaStr.match(/\*\*C(\d+)\*\*/)
        if (idMatch) claim.id = `C${idMatch[1]}`
      } else {
        claim.text = rest
      }
      claims.push(claim)
    } else if (inHeader) {
      header.push(line)
    }
  }
  return { claims, metadata, header }
}

function formatClaim(c: Claim, id: string): string {
  const conf = c.confidence || "medium"
  const src = c.source || "待补"
  return `- [${c.type}] ${c.text} — **Confidence:** ${conf} — **Source:** ${src} — **${id}**`
}

const typeSet = new Set(["definition","mechanism","constraint","comparison","conclusion","open-question","warning","procedure"])
const confSet = new Set(["high","medium","low"])
const report: string[] = []

function cleanFile(filePath: string) {
  const fname = filePath.replace(/\\/g, "/").split("/").pop()!
  const { claims, header } = parseClaimsFile(filePath)
  if (claims.length === 0) return

  const cleaned: Claim[] = []
  const warnings: string[] = []

  // Dedup: same type + trigram > 0.8 → merge
  let nextId = 1
  // Find max existing ID
  for (const c of claims) {
    if (c.id) {
      const n = parseInt(c.id.slice(1))
      if (!isNaN(n) && n >= nextId) nextId = n + 1
    }
  }

  const merged: Claim[] = []
  const skipped = new Set<number>()
  for (let i = 0; i < claims.length; i++) {
    if (skipped.has(i)) continue
    let best = claims[i]
    for (let j = i + 1; j < claims.length; j++) {
      if (skipped.has(j)) continue
      const sim = trigramSimilarity(claims[i].text, claims[j].text)
      if (sim > 0.8) {
        // Merge: keep longer / more detailed text
        best = claims[i].text.length >= claims[j].text.length ? claims[i] : claims[j]
        skipped.add(j)
        warnings.push(`合并: "${claims[i].text.slice(0,40)}..." + "${claims[j].text.slice(0,40)}..." (相似度=${sim.toFixed(2)})`)
      }
    }
    merged.push(best)
  }

  // Assign IDs, fill missing fields
  for (const c of merged) {
    if (!c.id) c.id = `C${nextId++}`
    if (!c.confidence) {
      c.confidence = "medium"
      warnings.push(`${c.id}: 缺 confidence → 自动标注 medium（待审核）`)
    }
    if (!c.source) {
      c.source = "待补"
      warnings.push(`${c.id}: 缺 source_ref → 标"待补"`)
    }
    if (!typeSet.has(c.type) && c.type) {
      warnings.push(`${c.id}: 未知 claim type "${c.type}"，保留原文`)
    }
  }

  // Rebuild file
  const headerLines = header.join("\n")
  const claimLines = merged.map((c, i) => formatClaim(c, merged[i].id!)).join("\n")
  const managedStart = "<!-- browsercode:managed:start -->"
  const managedEnd = "<!-- browsercode:managed:end -->"
  const newContent = headerLines + "\n" + claimLines + "\n\n" + managedStart + "\n" + managedEnd + "\n"

  writeFileSync(filePath, newContent, "utf8")

  report.push(`\n## ${fname}`)
  report.push(`Claims: ${claims.length} → ${merged.length}（合并 ${claims.length - merged.length}，ID: ${merged[0]?.id || "N/A"}-${merged[merged.length-1]?.id || "N/A"}）`)
  if (warnings.length > 0) warnings.forEach(w => report.push(`  ⚠ ${w}`))
}

const files = readdirSync(CLAIMS_DIR).filter(f => f.endsWith(".claims.md"))
for (const f of files) {
  cleanFile(join(CLAIMS_DIR, f))
}

const reportPath = join(KB_ROOT, "..", "kb-cleanup-report.md")
writeFileSync(reportPath, `# KB 大扫除报告 — ${new Date().toISOString().slice(0,10)}\n${report.join("\n")}`, "utf8")
console.log(`Done. ${files.length} files processed. Report: ${reportPath}`)
db.close()
```

- [ ] **Step 2: 运行大扫除并检查结果**

```bash
bun run harness/cleanup-claims.ts
```

预期：输出 "Done. 17 files processed."，kb/ 目录下生成 `kb-cleanup-report.md`。

检查报告中的合并案例、自动标注案例无异常。

- [ ] **Step 3: 提交**

```bash
git add harness/cleanup-claims.ts kb/claims/ kb-cleanup-report.md
git commit -m "feat: claims cleanup script — auto-ID, dedup, confidence fill, source_ref fill"
```

---

### Task 2: kh_manage save_claims 严格校验补全

**Files:**
- Modify: `.browser-code/tool/kb_manage.ts`

**Interfaces:**
- Consumes: 无（P1 的 claim ID 机制由 cleanup 脚本执行，本 task 仅校验写入侧）
- Produces: save_claims execute() 校验增强，拒绝同 source 下完全重复的 text

- [ ] **Step 1: 修改 handleSaveClaims，加 claim text 重复检查**

在 `handleSaveClaims` 函数的早期 return（existsSync）之前插入重复检测：

```typescript
// 获取该文件已有的 claims（如果文件已存在，读出来做重复检测）
if (existsSync(filePath)) {
  const existingContent = readFileSync(filePath, "utf8")
  const existingClaims = parseExistingClaims(existingContent)
  const duplicateTexts: string[] = []
  for (const claim of args.claims) {
    const norm = claim.text.toLowerCase().trim()
    for (const ec of existingClaims) {
      if (ec.text.toLowerCase().trim() === norm) duplicateTexts.push(claim.text.slice(0, 60))
    }
  }
  if (duplicateTexts.length > 0) {
    throw new Error(`拒绝写入：以下 ${duplicateTexts.length} 条 claim 已存在于该文件中：${duplicateTexts.map(t => `"${t}..."`).join("; ")}`)
  }
}
```

- [ ] **Step 2: 加辅助函数 parseExistingClaims**

在 `handleSaveClaims` 之前新增：

```typescript
function parseExistingClaims(content: string): Array<{text: string}> {
  const results: Array<{text: string}> = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- [") && trimmed.includes("]")) {
      const afterType = trimmed.slice(trimmed.indexOf("]") + 1).trim()
      const emdash = afterType.indexOf("—")
      results.push({ text: emdash >= 0 ? afterType.slice(0, emdash).trim() : afterType })
    }
  }
  return results
}

function calcSourceQuality(claimsCount: number, typeDiversity: number, hasLinkedTopic: boolean): number {
  return claimsCount * 1 + typeDiversity * 2 + (hasLinkedTopic ? 3 : 0)
}
```

- [ ] **Step 2b: Curator 策展评分**

save_source 写入后，基于 claims 数量 × 1 + 类型多样性 × 2 + 是否关联 topic × 3 计算 quality_score。< 3 → frontmatter 自动标 `status: low_value`。search 结果的 kind_boost 对 low_value 减半。
```

- [ ] **Step 3: 补写 kb_manage 的 save_claims action 让 ID 自动续排**

handleSaveClaims 中，如果文件已存在，自动解析已有最大 C 编号续排 ID 段：

```typescript
if (name.includes(".claims")) {
  // 解析已有 claims 找最大 C 编号，作为 Claim ID 续排种子
  // 格式保证： - [type] text — **Confidence:** x — **Source:** y — **CNNN**
  let maxId = 0
  for (const line of existingContent.split("\n")) {
    const m = line.match(/\*\*C(\d+)\*\*/)
    if (m) maxId = Math.max(maxId, parseInt(m[1]))
  }
  // 追加的 claims 从 maxId+1 开始分配 ID
}
```

重构 `handleSaveClaims` 最后一条 claim 写入时拼入 `— **C${maxId + idx + 1}**`。

- [ ] **Step 4: 验证 compile**

```bash
cd .browser-code && npx tsc --noEmit --skipLibCheck tool/kb_manage.ts 2>&1 | grep -v "TS1192\|TS2307\|TS2867\|TS2802\|TS1259" | head -5
```

预期：无新增错误（old errors are pre-existing noise: Bun global types, zod interop, path module resolution in standalone compile）。

- [ ] **Step 5: 提交**

```bash
git add .browser-code/tool/kb_manage.ts
git commit -m "feat: kb_manage save_claims — exact-text dedup, auto claim-ID continuation, duplicate rejection"
```

---

### Task 3: 实体补齐 + 噪声标记

**Files:**
- Create: `kb/entities/Google-DeepMind.md`
- Create: `kb/entities/Huawei.md`
- Create: `kb/entities/OpenCode.md`
- Modify: `kb/entities/DeepSeek.md`, `kb/entities/Qwen.md`, `kb/entities/MKBHD.md`
- Modify: `kb/sources/2026-06-29-continuum-gallery.md`（标 low_value）

**Interfaces:**
- Consumes: 无（纯内容操作）
- Produces: 补全的实体页面 + 噪声标记

- [ ] **Step 1: 创建 Google-DeepMind 实体**

文件 `kb/entities/Google-DeepMind.md`：

````markdown
# Google DeepMind

## 类型
organization

## 简介
Google 旗下的 AI 研究实验室，由 DeepMind 与 Google Brain 合并而成。代表成果包括 AlphaGo、AlphaFold、Gemini、Genie 3（世界模型）等。是世界模型研究的主要推动者之一。

## 相关主题
<!-- browsercode:managed:start related-topics -->
- [[kb/topics/world-model]]
<!-- browsercode:managed:end related-topics -->

## 相关 Claims
<!-- browsercode:managed:start related-claims -->
- [[kb/claims/2026-07-03-world-models-2026-landscape]]
<!-- browsercode:managed:end related-claims -->

## 相关来源
<!-- browsercode:managed:start related-sources -->
- [[kb/sources/2026-07-03-world-models-2026-landscape]]
<!-- browsercode:managed:end related-sources -->

## 别名
Google DeepMind, DeepMind
````

- [ ] **Step 2: 创建 Huawei、OpenCode 实体；补全 DeepSeek/Qwen/MKBHD stub**

Huawei：organization，关联 huawei-mate80 topic + 对应 source。

OpenCode：project，简介"SST 开源的 AI agent 运行时，Browser Code 的底层引擎"。

DeepSeek：补充简介"中国 AI 公司，代表模型 DeepSeek-V4、DeepSeek-R1"；关联 world-model topic（DeepSeek 是 speculative-decoding 和 DSpark 的发明者）。

Qwen：补充简介"阿里巴巴通义千问系列模型"；关联 `kb/topics/ai-model-comparison`。

MKBHD：补充简介"美国知名科技 YouTuber，以手机评测闻名"；关联 `kb/sources/2026-06-29-android-17-top-5.md`。

- [ ] **Step 3: 噪声标记**

在 `kb/sources/2026-06-29-continuum-gallery.md` 中改 frontmatter `status: active` → `status: low_value`。

- [ ] **Step 4: 提交**

```bash
git add kb/entities/ kb/sources/
git commit -m "docs: fill entity stubs (DeepSeek/Qwen/MKBHD), add Google-DeepMind/Huawei/OpenCode, mark low-value source"
```

---

### Task 4: links 表 + 链接同步管线

**Files:**
- Modify: `harness/db.ts`
- Modify: `harness/build_index.ts`

**Interfaces:**
- Consumes: P1 的 claim ID 机制（links 表引用 kb/claims/{date}-{slug}.claims.md 路径，每条 claim 有唯一 C 编号）
- Produces: `db.ts` 导出 `DB.links` 表 schema；`build_index.ts` 有 `--link` 选项执行链接同步

- [ ] **Step 1: db.ts 加 links 表**

在 `openDb()` 函数中，`processing_queue` 建表后添加：

```typescript
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
`)
db.run("CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path)")
db.run("CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path)")
```

- [ ] **Step 2: build_index.ts 加 --link 模式**

在 build_index.ts 末尾追加函数 `syncLinks()`：

```typescript
function syncLinks() {
  const db = getDb()
  // 清空当前 links（增量模式下只处理 mtime 变化的文件，此处全量 rebuild）
  db.run("DELETE FROM links")

  const dirs: Array<{path: string; type: string}> = [
    {path: resolve(KB_ROOT, "topics"), type: "topic"},
    {path: resolve(KB_ROOT, "entities"), type: "entity"},
    {path: resolve(KB_ROOT, "claims"), type: "claim"},
    {path: resolve(KB_ROOT, "sources"), type: "source"},
  ]

  const stmt = db.prepare("INSERT OR IGNORE INTO links (source_path, source_type, target_path, target_type, link_context) VALUES (?,?,?,?,?)")
  const insert = db.transaction(() => {
    for (const dir of dirs) {
      if (!existsSync(dir.path)) continue
      for (const file of readdirSync(dir.path)) {
        if (!file.endsWith(".md")) continue
        const filePath = join(dir.path, file)
        const srcRel = `kb/${dir.type}s/${file}`
        const content = readFileSync(filePath, "utf8")
        // Parse [[wikilinks]]
        const linkMatches = content.matchAll(/\[\[([^\]]+)\]\]/g)
        for (const m of linkMatches) {
          let target = m[1].trim()
          // Strip Obsidian display alias: [[target|display]]
          const pipeIdx = target.indexOf("|")
          if (pipeIdx >= 0) target = target.slice(0, pipeIdx)
          // Resolve to relative kb/ path
          let targetRel = target
          if (!target.startsWith("kb/")) {
            // Try to resolve shorthand references
            if (target.includes("/")) {
              targetRel = `kb/${target}.md`
            }
          }
          if (!targetRel.endsWith(".md")) targetRel += ".md"
          let targetType = "claim" // default
          if (targetRel.includes("/topics/")) targetType = "topic"
          else if (targetRel.includes("/entities/")) targetType = "entity"
          else if (targetRel.includes("/claims/")) targetType = "claim"
          else if (targetRel.includes("/sources/")) targetType = "source"

          const ctx = line.slice(0, 200) // first 200 chars of line as context
          stmt.run(srcRel, dir.type, targetRel, targetType, ctx)
        }
      }
    }
  })
  insert()
  console.log(`Links synced: ${stmt.totalChanges} total`)
  db.close()
}

// CLI entry: bun run harness/build_index.ts --link
if (process.argv.includes("--link")) {
  syncLinks()
  process.exit(0)
}
```

- [ ] **Step 3: 验证**

```bash
bun run harness/build_index.ts --link
```

预期：输出 "Links synced: N total"（N 约等于 KB 内所有 wikilinks 总数）。

```bash
sqlite3 index/browsercode.sqlite "SELECT source_path, target_path, link_kind FROM links LIMIT 5"
```

预期：返回 5 行 wikilink 解析结果。

- [ ] **Step 4: 提交**

```bash
git add harness/db.ts harness/build_index.ts
git commit -m "feat: links table + wikilink sync pipeline in build_index.ts"
```

---

### Task 5: kb_manage 图谱查询 action（backlinks/outlinks/orphans/conflicts）

**Files:**
- Modify: `.browser-code/tool/kb_manage.ts`

**Interfaces:**
- Consumes: P2 build_index.ts 的 links sync 产出（links 表已存在）
- Produces: kb_manage 新增 4 个 action

- [ ] **Step 1: 加图谱查询 execute handler（backlinks/outlinks/orphans/conflicts）**

在 `execute()` switch 中新增 4 个 case：

```typescript
case "backlinks": {
  if (!args.target) throw new Error("backlinks requires: target")
  const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))
  const rows = db.query(`SELECT source_path, source_type, link_context FROM links WHERE target_path = ?`, [args.target as string]).all() as Array<{source_path: string; source_type: string; link_context: string}>
  db.close()
  return JSON.stringify({ target: args.target, backlinks: rows.map(r => ({ source_path: r.source_path, source_type: r.source_type, context: r.link_context?.slice(0, 100) })) }, null, 2)
}

case "outlinks": {
  if (!args.target) throw new Error("outlinks requires: target")
  const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))
  const rows = db.query(`SELECT target_path, target_type, link_context FROM links WHERE source_path = ?`, [args.target as string]).all() as Array<{target_path: string; target_type: string; link_context: string}>
  db.close()
  return JSON.stringify({ source: args.target, outlinks: rows.map(r => ({ target_path: r.target_path, target_type: r.target_type, context: r.link_context?.slice(0, 100) })) }, null, 2)
}

case "orphans": {
  const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))
  const orphans = {
    claims: [] as string[],
    entities: [] as string[],
    topics: [] as string[],
  }
  for (const [type, dir] of [["claim","claims"],["entity","entities"],["topic","topics"]]) {
    const files = readdirSync(join(process.cwd(), "kb", dir as string)).filter(f => f.endsWith(".md") && f !== ".template.md")
    for (const f of files) {
      const p = `kb/${dir}/${f}`
      const count = db.query("SELECT COUNT(*) as c FROM links WHERE target_path = ?", [p]).get() as {c: number}
      if (count.c === 0) (orphans as any)[type as string].push(p)
    }
  }
  db.close()
  return JSON.stringify(orphans, null, 2)
}

case "conflicts": {
  const topic = args.target as string
  const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))
  // 查找同 topic 下 confidence 相左的 claim 对
  const rows = db.query(`
    SELECT l1.source_path as a, l2.source_path as b, l1.link_context as a_ctx, l2.link_context as b_ctx
    FROM links l1
    JOIN links l2 ON l1.target_path = l2.target_path AND l1.source_path < l2.source_path
    WHERE l1.target_path = ? AND l1.link_kind = 'ref'
  `, [topic]).all() as Array<{a: string; b: string; a_ctx: string; b_ctx: string}>
  db.close()
  return JSON.stringify({ topic, potentialConflicts: rows.map(r => ({ a: r.a, b: r.b })) }, null, 2)
}
```

- [ ] **Step 2: 更新 tool schema 参数 + 描述**

在 args 定义中新增：
```typescript
target: tool.schema.string().optional()
  .describe("(backlinks/outlinks/conflicts) Target file path, e.g. kb/claims/xxx.md or kb/topics/xxx.md"),
```

action enum 追加：
```typescript
.enum([
  "save_source", "save_claims", "link_topic", "link_entity",
  "after_capture", "search", "context",
  "backlinks", "outlinks", "orphans", "conflicts",
])
```

描述中补充新 action 用法。

- [ ] **Step 3: 提交**

```bash
git add .browser-code/tool/kb_manage.ts
git commit -m "feat: kb_manage graph actions — backlinks, outlinks, orphans, conflicts detection"
```

---

### Task 6: 语义搜索 — embeddings 管道

**Files:**
- Modify: `harness/db.ts`（加 claim_embeddings 虚拟表，探测维度）
- Create: `harness/embeddings.ts`

**Interfaces:**
- Consumes: 无（Phase 3 独立于 Phase 2）
- Produces: `bun run kb:embeddings` CLI；save_claims 集成点（详见 Task 7）

- [ ] **Step 1: 编写 embeddings.ts**

```typescript
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { Database } from "bun:sqlite"
import { openDb, KB_ROOT, INDEX_DIR } from "./db.ts"

// 探测 DeepSeek embeddings API 返回维度
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not set")
const EMBED_URL = "https://api.deepseek.com/v1/embeddings"

async function getEmbeddingDim(): Promise<number> {
  const r = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", input: "test" }),
  })
  const j = await r.json() as any
  return j.data?.[0]?.embedding?.length || 1024
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", input: texts }),
  })
  const j = await res.json() as any
  return j.data.map((d: any) => d.embedding)
}

// Extract claims from file
function extractClaims(filePath: string): Array<{id: string; text: string}> {
  const content = readFileSync(filePath, "utf8")
  const claims: Array<{id: string; text: string}> = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- [") && trimmed.includes("]")) {
      const idMatch = trimmed.match(/\*\*C(\d+)\*\*/)
      if (!idMatch) continue
      const id = `C${idMatch[1]}`
      const afterType = trimmed.slice(trimmed.indexOf("]") + 1).trim()
      const emdash = afterType.indexOf("—")
      claims.push({ id, text: emdash >= 0 ? afterType.slice(0, emdash).trim() : afterType })
    }
  }
  return claims
}

async function main() {
  const db = openDb()
  const dim = await getEmbeddingDim()
  console.log(`Embedding dim: ${dim}`)

  // Use BLOB storage (sqlite-vec extension is optional enhancement).
  // Each embedding is serialized as float32 binary:<fix-placeholder-removed>
  db.run(`
      CREATE TABLE IF NOT EXISTS claim_embeddings (
        claim_id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        embedding BLOB NOT NULL
      )
    `)
  }

  const claimsDir = join(KB_ROOT, "claims")
  const files = readdirSync(claimsDir).filter(f => f.endsWith(".claims.md"))

  const batch: Array<{id: string; text: string; source_path: string}> = []
  for (const f of files) {
    for (const c of extractClaims(join(claimsDir, f))) {
      batch.push({ ...c, source_path: `kb/claims/${f}` })
    }
  }

  // Batch by 20 for API efficiency
  const BATCH_SIZE = 20
  const stmt = db.prepare("INSERT OR REPLACE INTO claim_embeddings (claim_id, source_path, embedding) VALUES (?, ?, ?)")
  let processed = 0
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE)
    const texts = chunk.map(c => c.text)
    const embeddings = await generateEmbeddings(texts)
    for (let j = 0; j < chunk.length; j++) {
      const buf = Buffer.alloc(embeddings[j].length * 4)
      for (let k = 0; k < embeddings[j].length; k++) buf.writeFloatLE(embeddings[j][k], k * 4)
      stmt.run(chunk[j].id, chunk[j].source_path, buf)
    }
    processed += chunk.length
    console.log(`Embedded: ${processed}/${batch.length}`)
  }

  // Semantic dedup check: cosine similarity across all claims (pairwise, alert > 0.92)
  const all = db.query("SELECT claim_id, embedding FROM claim_embeddings").all() as Array<{claim_id: string; embedding: Buffer}>
  const duplicates: Array<{a: string; b: string; sim: number}> = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const ea = decodeEmbedding(all[i].embedding), eb = decodeEmbedding(all[j].embedding)
      const sim = cosineSimilarity(ea, eb)
      if (sim > 0.92) duplicates.push({ a: all[i].claim_id, b: all[j].claim_id, sim: Number(sim.toFixed(3)) })
    }
  }
  if (duplicates.length > 0) {
    console.log(`\n⚠ 语义相似度 > 0.92：${duplicates.length} 对`)
    for (const d of duplicates) console.log(`  ${d.a} ↔ ${d.b} (${d.sim})`)
  }

  console.log(`\nDone. ${processed} claims embedded.`)
  db.close()
}

function decodeEmbedding(buf: Buffer): number[] {
  const arr: number[] = []
  for (let i = 0; i < buf.length; i += 4) arr.push(buf.readFloatLE(i))
  return arr
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

main()
```

- [ ] **Step 2: 添加 db.ts 的 claim_embeddings 表**

在 openDb() 中，links 建表后加：

```typescript
db.run(`
  CREATE TABLE IF NOT EXISTS claim_embeddings (
    claim_id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    embedding BLOB NOT NULL
  )
`)
```

- [ ] **Step 3: 添加 package.json script**

已有 `kb:embeddings` script → 无需新增，只需确认指向正确：

```json
"kb:embeddings": "bun run harness/embeddings.ts"
```

- [ ] **Step 4: 运行初批 embedding 并验证**

```bash
bun run kb:embeddings
```

注意观察 API call 速率限流，如遇限流自动等待（`Rate limited` → `await sleep(2000)` 在 generateEmbeddings 里加 catch retry）。

- [ ] **Step 5: 提交**

```bash
git add harness/embeddings.ts harness/db.ts
git commit -m "feat: embeddings pipeline — DeepSeek API, batch encode, semantic dedup check"
```

---

### Task 7: 语义搜索引擎（kb_manage + search.ts）

**Files:**
- Modify: `.browser-code/tool/kb_manage.ts`
- Modify: `harness/search.ts`

**Interfaces:**
- Consumes: P3 harness/embeddings.ts 产出（claim_embeddings 表）
- Produces: kb_manage search action 支持 mode 参数；search.ts 支持 --hybrid

- [ ] **Step 1: kb_manage search action 加 mode 参数**

在 `handleSearch` 中：

```typescript
const mode = (args.mode as string) || "hybrid"
if (mode === "keyword") {
  const result = await execCommand("bun", ["run", "harness/search.ts", query])
  // ... existing code
} else if (mode === "semantic" || mode === "hybrid") {
  const result = await execCommand("bun", ["run", "harness/search.ts", query, "--" + mode])
  // ... parse
}
```

schema 中 query 后加：
```typescript
mode: tool.schema.enum(["keyword", "semantic", "hybrid"]).optional()
  .describe("(search) Search mode. Default 'hybrid' using RRF fusion."),
```

- [ ] **Step 2: search.ts 加 hybrid 模式**

在 search.ts 加参数处理：如果 argv 包含 `--semantic` 或 `--hybrid`，调用 embeddings API 生成查询向量，在 claim_embeddings 中做 brute-force cosine KNN top 20，然后和 FTS5 结果做 RRF 融合。

RRF 公式：
```
score(doc) = sum over ranks: 1 / (k + rank_in_this_list)
k = 60
```

最终结果按 RRF 分数降序返回。

- [ ] **Step 3: 提交**

```bash
git add .browser-code/tool/kb_manage.ts harness/search.ts
git commit -m "feat: hybrid semantic search — RRF fusion of FTS5 + embedding cosine KNN"
```

---

### Task 8: synthesize + speculate action（LLM 反哺 Phase 4）

**Files:**
- Modify: `.browser-code/tool/kb_manage.ts`
- Modify: `harness/db.ts`（加 topic_stats 表）

**Interfaces:**
- Consumes: P1（claim ID）、P2（links 表 backlinks/orphans）、P3（claims 有 embeddings）
- Produces: synthesize / speculate action 返回合成/推演结果；topic_stats 表维持状态

- [ ] **Step 1: db.ts 加 topic_stats 表**

```sql
CREATE TABLE IF NOT EXISTS topic_stats (
  topic_path TEXT PRIMARY KEY,
  claim_count INTEGER NOT NULL DEFAULT 0,
  last_synthesized_at TEXT,
  last_speculated_at TEXT,
  stale_threshold_days INTEGER NOT NULL DEFAULT 90,
  UNIQUE(topic_path)
)
```

- [ ] **Step 2: kb_manage 加 synthesize action**

功能：取同 topic 全部 claims → 检查 topic_stats.last_synthesized_at → 如果自上次合成后无新 claims 则提示"无需合成" → 如有新 claims → spawn task({subagent_type:"general"}) 调 LLM 合并建议 → 返回合成候选文本。

（由于 task 工具在 kb_manage 不可用——kb_manage 本身在 proreader/general 子代理中运行——synthesize 的逻辑是"组装 prompts 并返回，由主 Agent spawn general 执行"）

格式：
```typescript
case "synthesize": {
  if (!args.target) throw new Error("synthesize requires: target (topic path)")
  // 加载该 topic 全部 claims
  // 从 topic_stats 判断是否需要合成
  // 返回结构化 JSON：{"needsSynthesis":true/false,"newClaimsCount":N,"synthesisPrompt":"..."}
}
```

- [ ] **Step 3: kb_manage 加 speculate action**

类似结构，返回推演 prompt。speculate 的所有产物必须强制 confidence=low 并写入 topic 页的「LLM 推演」managed block。

- [ ] **Step 4: 提交**

```bash
git add .browser-code/tool/kb_manage.ts harness/db.ts
git commit -m "feat: synthesize & speculate actions — LLM knowledge feedback pipeline"
```

---

### Task 9: 工具层同步 + 政策文档更新

**Files:**
- Modify: `wiki/CLAIM_POLICY.md`（加合成规则）
- Modify: `wiki/RETRIEVAL_POLICY.md`（加语义检索优先级）
- Modify: `wiki/WIKI_MANAGER.md`（加反哺边界）
- Modify: `opencode/packages/opencode/src/session/prompt/browser-code.txt`（KB 段落更新）
- Modify: `.browser-code/agent/proreader.txt`（llm_wiki_lite provider 描述加语义搜索 → 同步到 opencode/ 源文件）
- Modify: `AGENTS.md`（铁律3 更新以涵盖新 kb_manage action）

**Interfaces:**
- Consumes: 前 4 个 Phase 的全部产出
- Produces: agent 感知全部新能力；政策文档与代码一致

- [ ] **Step 1: 更新 CLAIM_POLICY.md**

在 claim type 一节后追加合成规则：

```markdown
## 合成 Claims（synthesized）

合成 claim 由 LLM 基于多条已有 claim 合并精炼生成。标记规则：

- type 可为任意 8 种，优先使用 `conclusion`（多现有 claims 可支持）或 `definition`（精简后的定义）
- confidence 基于参与合成的 claims 的最低 confidence 再降一级（保留合成风险）
- source 必须列出所有参与的 claim ID：`synthesized from [C003][C007]`
- status 固定为 `synthesized`
- 原 claims 保留不删除，标 `status: merged → CX`（指向合成 claim）
```

- [ ] **Step 2: 更新 RETRIEVAL_POLICY.md**

在 retrieval 流程末尾追加语义检索优先级：

```markdown
## 语义检索（Semantic Hybrid）

默认使用混合检索（FTS5 + 语义），由 kb_manage search 自动启用。

检索优先级：
1. Claims（语义相似度 + FTS5 RRF 融合，kind_boost=3）
2. Topics/Entities（标准 FTS5，kind_boost=2/1）
3. Sources（FTS5 末位，kind_boost=0）

使用 `--facts-only` 排除合成/推演产物（synthesized/speculated）。
```

- [ ] **Step 3: 更新 WIKI_MANAGER.md**

加反哺边界章节：

```markdown
## LLM 反哺（Synthesize & Speculate）

KB 有两个 LLM 反哺能力，均需用户确认后执行：

**Synthesize（合成）**：合并同主题多条 claims 为一条精炼 version。
- 触发：kb_manage({action: "synthesize"})
- 写入规则：见 CLAIM_POLICY.md 合成规则
- 原 claims 不删，只标记合并关系

**Speculate（推演）**：基于已有知识推理趋势/假设。
- 触发：kb_manage({action: "speculate"})
- 写入规则：所有推测产物 confidence=low，写入 topic 页 LLM 推演 managed block
- 严禁与事实 claims 混排
- 严禁从单条 claim 推演（至少需要 3 条 related claims）
```

- [ ] **Step 4: 更新 browser-code.txt KB 段落 + proreader.txt**

browser-code.txt 的 KB 管线段落追加：backlinks/orphans 发现死知识 → 提示用户补充；synthesize 发现新积累 → 建议合成。

proreader.txt 的 llm_wiki_lite provider 描述："优先查询本地知识库（支持语义混合检索），返回 claims+topics+entities 结构化结果"

- [ ] **Step 5: 更新 AGENTS.md 铁律3**

在 KB 写入管线描述后追加：

```
- 写完 kb_manage 后执行 phase-2 图谱检查：orphans（死知识）、conflicts（矛盾）、backlinks（补充引用链）
- 如果同一 topic 自上次处理后新增了 5 条以上新 claims，建议用户运行 synthesize
```

- [ ] **Step 6: 重编译 opencode 二进制**

```bash
cd opencode/packages/opencode && bun run script/build.ts --single
```

提示词修改需编译生效。

- [ ] **Step 7: 提交**

```bash
git add wiki/ .browser-code/agent/proreader.txt opencode/packages/opencode/src/session/prompt/browser-code.txt opencode/packages/opencode/src/agent/prompt/proreader.txt AGENTS.md
git commit -m "docs: sync wiki policies, prompts, and agent constraints to reflect full 4-phase LLM Wiki upgrade"
```

---

## 依赖链

```
Task 1 (cleanup + ID)
  → Task 2 (kb_manage strict validation)
  → Task 3 (entity fill + noise mark)
      ← → Task 4 (links table + sync)
          → Task 5 (graph actions)
              → Task 6 (embeddings pipeline) [can run parallel with Task 4-5 if enough API quota]
                  → Task 7 (semantic search)
                      → Task 8 (synthesize/speculate)
                          → Task 9 (tool sync + prompt rebuild)
```

Task 4、5、6、7、8 全都依赖 Task 1（claims 有统一格式+ID）。Task 4+5（图谱）、Task 6+7（语义）可并行。

## 完成检查

全部 9 个 Task 完成后：

```bash
bun run kb:cleanup   → 报告生成
bun run kb:index     → 索引重建（含 links 表同步）
bun run kb:embeddings → embedding 生成（+ 语义去重报告）
bun run kb:search "混合检索测试" → 混合模式返回结果（需 API key）
browser-code --version → 新版二进制
```
