import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { Database } from "bun:sqlite"
import { tool, type ToolDefinition } from "../../opencode/node_modules/@opencode-ai/plugin/src/index"
import { validateKbPipeline, parsePipelineStatus } from "../../packages/research/src/validator"

// ── 常量 ──

const KB_DIR = join(process.cwd(), "kb")
const SOURCES_DIR = join(KB_DIR, "sources")
const CLAIMS_DIR = join(KB_DIR, "claims")
const TOPICS_DIR = join(KB_DIR, "topics")
const ENTITIES_DIR = join(KB_DIR, "entities")

const SOURCE_TYPES = ["webpage", "video", "transcript", "document", "manual"] as const
const SOURCE_STATUSES = ["draft", "active", "reviewed", "stale"] as const
const CLAIM_TYPES = [
  "definition", "mechanism", "constraint", "comparison",
  "conclusion", "open-question", "warning", "procedure",
] as const
const ENTITY_TYPES = ["tool", "project", "concept", "framework", "person", "organization"] as const
const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const
type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number]

type SourceType = typeof SOURCE_TYPES[number]
type ClaimType = typeof CLAIM_TYPES[number]
type EntityType = typeof ENTITY_TYPES[number]

// ── 辅助函数 ──

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoNow(): string {
  return new Date().toISOString()
}

/**
 * 安全写入文件，自动创建父目录。
 */
function safeWrite(filePath: string, content: string): void {
  const dir = filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/")
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, content, "utf8")
}

/**
 * 在 managed-block 区域内注入引用列表。
 * managed-block 格式：
 *   <!-- browsercode:managed:start block-name -->
 *   - 旧内容（将被替换）
 *   <!-- browsercode:managed:end block-name -->
 */
function updateManagedBlocks(
  existingContent: string,
  blockUpdates: Record<string, string[]>,
): string {
  let content = existingContent

  for (const [blockName, items] of Object.entries(blockUpdates)) {
    const startMarker = `<!-- browsercode:managed:start ${blockName} -->`
    const endMarker = `<!-- browsercode:managed:end ${blockName} -->`

    const startIdx = content.indexOf(startMarker)
    const endIdx = content.indexOf(endMarker)

    if (startIdx === -1 || endIdx === -1) {
      // 没有 managed-block → 不修改（避免破坏文件结构）
      continue
    }

    const before = content.slice(0, startIdx + startMarker.length)
    const after = content.slice(endIdx)
    const itemLines = items.length > 0
      ? "\n" + items.map((item) => `- ${item}`).join("\n") + "\n"
      : "\n"

    content = before + itemLines + after
  }

  return content
}

/**
 * 执行 shell 命令并返回 stdout。
 */
async function execCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

// ── Action 参数类型 ──

interface SaveSourceArgs {
  title: string
  source_url: string
  source_type: SourceType
  summary: string
  key_points: string[]
  details?: string
  related_topics?: string[]
  vault_path: string
}

interface SaveClaimsArgs {
  source_file: string
  claims: Array<{
    type: ClaimType
    text: string
    confidence: ConfidenceLevel
    source_ref?: string
  }>
}

interface LinkTopicArgs {
  topic_name: string
  topic_name_zh?: string
  definition?: string
  related_claims?: string[]
  related_sources?: string[]
  related_entities?: string[]
}

interface LinkEntityArgs {
  entity_name: string
  entity_type: EntityType
  description?: string
  related_topics?: string[]
  related_claims?: string[]
  related_sources?: string[]
  aliases?: string[]
}

// ── Write Action Handlers ──

/**
 * 创建 kb/sources/{date}-{slug}.md
 * 格式由代码保证，agent 不需要知道模板细节。
 */
function handleSaveSource(args: SaveSourceArgs): {
  filePath: string
  created: boolean
} {
  const date = todayStr()
  const slug = slugify(args.title)
  const hash = shortHash(args.title + args.source_url)
  const filename = `${date}-${slug}.md`
  const filePath = join(SOURCES_DIR, filename)

  // 幂等：如果已存在同路径文件，返回现有路径
  if (existsSync(filePath)) {
    return { filePath: `kb/sources/${filename}`, created: false }
  }

  const relatedTopics = (args.related_topics ?? [])
    .map((t) => `- [[kb/topics/${t}]]`)
    .join("\n")

  const keyPoints = args.key_points
    .map((p) => `- ${p}`)
    .join("\n")

  const qualityScore = calcSourceQuality(0, 0, (args.related_topics ?? []).length > 0)
  const qualityStatus = qualityScore < 3 ? "low_value" : "active"

  const content = [
    `# ${args.title}`,
    "",
    "## Metadata",
    `source_type: ${args.source_type}`,
    `source_url: ${args.source_url}`,
    `captured_at: ${isoNow()}`,
    `vault_path: ${args.vault_path}`,
    `status: ${qualityStatus}`,
    `quality_score: ${qualityScore}`,
    "",
    "## Summary",
    args.summary,
    "",
    "## Key Points",
    keyPoints,
    "",
    "## Details",
    args.details || args.summary,
    "",
    "## Related Topics",
    relatedTopics || "(none)",
    "",
    "## Original Reference",
    `- Vault: ${args.vault_path}`,
  ].join("\n")

  safeWrite(filePath, content)
  return { filePath: `kb/sources/${filename}`, created: true }
}

/**
 * Parse existing claims from a .claims.md file content.
 * Returns array of {text} for dedup/ID-continuation purposes.
 */
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

/**
 * Calculate source quality score: claimsCount * 1 + typeDiversity * 2 + (hasLinkedTopic ? 3 : 0)
 * Score < 3 → low_value.
 */
function calcSourceQuality(claimsCount: number, typeDiversity: number, hasLinkedTopic: boolean): number {
  return claimsCount * 1 + typeDiversity * 2 + (hasLinkedTopic ? 3 : 0)
}

/**
 * 创建 kb/claims/{name}.claims.md
 * claim type 由 enum 约束，格式由代码保证。
 */
function handleSaveClaims(args: SaveClaimsArgs): {
  filePath: string
  claimCount: number
  warnings: string[]
  created: boolean
  claims: Array<{ claim_id: string; text: string; type: string }>
} {
  const sourceName = args.source_file
    .replace(/^kb\/sources\//, "")
    .replace(/\.md$/, "")
  const sourceTitle = sourceName
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-/g, " ")

  const filename = `${sourceName}.claims.md`
  const filePath = join(CLAIMS_DIR, filename)

  const warnings: string[] = []

  // ── 验证 claim type + confidence ──
  for (const claim of args.claims) {
    if (!CLAIM_TYPES.includes(claim.type)) {
      throw new Error(
        `无效的 claim type: "${claim.type}"。有效值：${CLAIM_TYPES.join(", ")}`,
      )
    }
    if (!CONFIDENCE_LEVELS.includes(claim.confidence)) {
      throw new Error(
        `claim 缺少有效的 confidence 字段："${claim.text.slice(0, 50)}..."。必须为 high/medium/low。`,
      )
    }
    if (!claim.source_ref) {
      warnings.push(`claim 缺少 source_ref：${claim.text.slice(0, 60)}...`)
    }
  }

  // ── 如果文件已存在：重复检测 + ID 续排 ──
  let existingContent = ""
  let maxClaimId = 0

  if (existsSync(filePath)) {
    existingContent = readFileSync(filePath, "utf8")

    // 精确文本重复检测
    const existingClaims = parseExistingClaims(existingContent)
    const duplicateTexts: string[] = []
    for (const claim of args.claims) {
      const norm = claim.text.toLowerCase().trim()
      for (const ec of existingClaims) {
        if (ec.text.toLowerCase().trim() === norm) {
          duplicateTexts.push(claim.text.slice(0, 60))
        }
      }
    }
    if (duplicateTexts.length > 0) {
      throw new Error(
        `拒绝写入：以下 ${duplicateTexts.length} 条 claim 已存在于该文件中：${duplicateTexts.map(t => `"${t}..."`).join("; ")}`,
      )
    }

    // 解析已有 claims 找最大 C 编号作为续排种子
    for (const line of existingContent.split("\n")) {
      const m = line.match(/\*\*C(\d+)\*\*/)
      if (m) maxClaimId = Math.max(maxClaimId, parseInt(m[1]))
    }
  }

  // 写入 claim 行，自动分配 claim_id
  const claimLines = args.claims
    .map((c, idx) => {
      const cid = `C${maxClaimId + idx + 1}`
      return `- [${c.type}] ${c.text} — **Confidence:** ${c.confidence} — **Source:** ${c.source_ref || "见原文"} — **${cid}**`
    })
    .join("\n")

  // ── 构建输出 claims 数组带回 claim_id ──
  const outputClaims = args.claims.map((c, idx) => ({
    claim_id: `C${maxClaimId + idx + 1}`,
    text: c.text,
    type: c.type,
  }))

  if (existsSync(filePath)) {
    // 文件已存在：在 managed-block 区域的 Claims 部分追加新 claim 行
    // 如果文件末尾有 managed 标记，在其前一节追加；否则直接追加在文件末尾
    const startMarker = "<!-- browsercode:managed:start"
    const endMarker = "<!-- browsercode:managed:end"
    if (existingContent.includes(startMarker)) {
      // 在最后一个 managed block 之前插入新 claims
      const lastEnd = existingContent.lastIndexOf(endMarker)
      if (lastEnd >= 0) {
        const beforeEnd = existingContent.slice(0, lastEnd).trimEnd()
        const afterEnd = existingContent.slice(lastEnd)
        const newContent = beforeEnd + "\n\n新追加 Claims：\n" + claimLines + "\n\n" + afterEnd
        writeFileSync(filePath, newContent, "utf8")
      } else {
        // 无 end marker，追加到文件末尾
        writeFileSync(filePath, existingContent.trimEnd() + "\n\n新追加 Claims：\n" + claimLines + "\n", "utf8")
      }
    } else {
      // 无 managed block，直接追加
      writeFileSync(filePath, existingContent.trimEnd() + "\n\n新追加 Claims：\n" + claimLines + "\n", "utf8")
    }
    return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, warnings, created: false, claims: outputClaims }
  }

  // ── 新文件 ──
  const content = [
    `# Claims: ${sourceTitle}`,
    "",
    "## Metadata",
    `source: [[${args.source_file.replace(/\.md$/, "")}]]`,
    `source_path: ${args.source_file}`,
    "status: active",
    `updated_at: ${isoNow()}`,
    "",
    "## Claims",
    claimLines,
  ].join("\n")

  safeWrite(filePath, content)
  return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, warnings, created: true, claims: outputClaims }
}

/**
 * 创建或更新 kb/topics/{slug}.md
 * 新 topic：从模板创建
 * 已有 topic：更新 managed-block 区域
 */
function handleLinkTopic(args: LinkTopicArgs): {
  filePath: string
  created: boolean
  updated: boolean
} {
  const slug = slugify(args.topic_name)
  const filename = `${slug}.md`
  const filePath = join(TOPICS_DIR, filename)
  const exists = existsSync(filePath)

  if (!exists) {
    const relatedClaims = (args.related_claims ?? [])
      .map((c) => `- [[${c}]]`)
      .join("\n")
    const relatedSources = (args.related_sources ?? [])
      .map((s) => `- [[${s}]]`)
      .join("\n")
    const relatedEntities = (args.related_entities ?? [])
      .map((e) => `- [[${e}]]`)
      .join("\n")

    const content = [
      `# ${args.topic_name}${args.topic_name_zh ? ` / ${args.topic_name_zh}` : ""}`,
      "",
      "## 当前定义",
      args.definition || "",
      "",
      "## 关键 Claims",
      "<!-- browsercode:managed:start related-claims -->",
      relatedClaims,
      "<!-- browsercode:managed:end related-claims -->",
      "",
      "## 相关来源",
      "<!-- browsercode:managed:start related-sources -->",
      relatedSources,
      "<!-- browsercode:managed:end related-sources -->",
      "",
      "## 相关实体",
      "<!-- browsercode:managed:start related-entities -->",
      relatedEntities,
      "<!-- browsercode:managed:end related-entities -->",
      "",
      "## 相关主题",
      "",
      "## 待确认问题",
      "-",
      "",
      "## 最近更新",
      `- ${todayStr()}：初始创建。`,
    ].join("\n")

    safeWrite(filePath, content)
    return { filePath: `kb/topics/${filename}`, created: true, updated: false }
  }

  // 更新已有 topic 的 managed-block 区域
  const existingContent = readFileSync(filePath, "utf8")
  const blockUpdates: Record<string, string[]> = {}

  if (args.related_claims) {
    blockUpdates["related-claims"] = args.related_claims.map((c) => `[[${c}]]`)
  }
  if (args.related_sources) {
    blockUpdates["related-sources"] = args.related_sources.map((s) => `[[${s}]]`)
  }
  if (args.related_entities) {
    blockUpdates["related-entities"] = args.related_entities.map((e) => `[[${e}]]`)
  }

  if (Object.keys(blockUpdates).length === 0) {
    return { filePath: `kb/topics/${filename}`, created: false, updated: false }
  }

  const updatedContent = updateManagedBlocks(existingContent, blockUpdates)
  writeFileSync(filePath, updatedContent, "utf8")
  return { filePath: `kb/topics/${filename}`, created: false, updated: true }
}

/**
 * 创建或更新 kb/entities/{slug}.md
 */
function handleLinkEntity(args: LinkEntityArgs): {
  filePath: string
  created: boolean
  updated: boolean
} {
  const slug = slugify(args.entity_name)
  const filename = `${slug}.md`
  const filePath = join(ENTITIES_DIR, filename)
  const exists = existsSync(filePath)

  if (!exists) {
    const relatedTopics = (args.related_topics ?? [])
      .map((t) => `- [[${t}]]`)
      .join("\n")
    const relatedClaims = (args.related_claims ?? [])
      .map((c) => `- [[${c}]]`)
      .join("\n")
    const relatedSources = (args.related_sources ?? [])
      .map((s) => `- [[${s}]]`)
      .join("\n")
    const aliases = (args.aliases ?? []).length > 0
      ? args.aliases!.join(", ")
      : "-"

    const content = [
      `# ${args.entity_name}`,
      "",
      "## 类型",
      args.entity_type,
      "",
      "## 简介",
      args.description || "",
      "",
      "## 相关主题",
      "<!-- browsercode:managed:start related-topics -->",
      relatedTopics,
      "<!-- browsercode:managed:end related-topics -->",
      "",
      "## 相关 Claims",
      "<!-- browsercode:managed:start related-claims -->",
      relatedClaims,
      "<!-- browsercode:managed:end related-claims -->",
      "",
      "## 相关来源",
      "<!-- browsercode:managed:start related-sources -->",
      relatedSources,
      "<!-- browsercode:managed:end related-sources -->",
      "",
      "## 别名",
      aliases,
    ].join("\n")

    safeWrite(filePath, content)
    return { filePath: `kb/entities/${filename}`, created: true, updated: false }
  }

  // 更新已有 entity
  const existingContent = readFileSync(filePath, "utf8")
  const blockUpdates: Record<string, string[]> = {}

  if (args.related_topics) {
    blockUpdates["related-topics"] = args.related_topics.map((t) => `[[${t}]]`)
  }
  if (args.related_claims) {
    blockUpdates["related-claims"] = args.related_claims.map((c) => `[[${c}]]`)
  }
  if (args.related_sources) {
    blockUpdates["related-sources"] = args.related_sources.map((s) => `[[${s}]]`)
  }

  if (Object.keys(blockUpdates).length === 0) {
    return { filePath: `kb/entities/${filename}`, created: false, updated: false }
  }

  const updatedContent = updateManagedBlocks(existingContent, blockUpdates)
  writeFileSync(filePath, updatedContent, "utf8")
  return { filePath: `kb/entities/${filename}`, created: false, updated: true }
}

/**
 * 执行 KB 管线：enqueue → process-queue → rebuild FTS5
 * 内部调用 `bun run kb:after-capture`，透传 stdout/stderr。
 * 执行完毕后运行 Validator。
 */
async function handleAfterCapture(vaultPath: string): Promise<{
  pipeline: {
    enqueued: boolean
    step: number
    status: string
    output: string
    errors: string[]
  }
  validation: {
    passed: boolean
    hardBlocks: Array<{ code: string; message: string; detail: string }>
    softWarnings: Array<{ code: string; message: string; detail: string }>
  }
}> {
  // 1. enqueue
  const enqueueResult = await execCommand("bun", [
    "run", "harness/enqueue.ts", vaultPath,
  ])

  // 2. process-queue（可能多次执行直到 stable）
  let processOutput = ""
  let lastOutput = ""
  let attempts = 0
  const maxAttempts = 5

  do {
    lastOutput = processOutput
    const result = await execCommand("bun", [
      "run", "harness/process-queue.ts",
    ])
    processOutput = result.stdout + result.stderr
    attempts++
  } while (processOutput !== lastOutput && attempts < maxAttempts)

  // 3. 解析管线状态
  const pipelineStatus = parsePipelineStatus(processOutput)

  // 4. 运行 Validator
  const validation = validateKbPipeline(pipelineStatus)

  return {
    pipeline: {
      enqueued: enqueueResult.exitCode === 0,
      step: pipelineStatus.step,
      status: pipelineStatus.status,
      output: processOutput.slice(0, 2000),
      errors: pipelineStatus.errors.slice(0, 10),
    },
    validation: {
      passed: validation.passed,
      hardBlocks: validation.hardBlocks,
      softWarnings: validation.softWarnings,
    },
  }
}

/**
 * FTS5 搜索 kb/claims + kb/topics + kb/entities + kb/sources
 * 支持 keyword / semantic / hybrid 模式（默认 hybrid）。
 */
async function handleSearch(query: string, mode: string = "hybrid"): Promise<{
  results: string
  resultCount: number
}> {
  const modeFlag = mode === "keyword" ? "" : `--${mode}`
  const args = modeFlag ? [query, modeFlag] : [query]
  const result = await execCommand("bun", [
    "run", "harness/search.ts", ...args,
  ])
  const lines = result.stdout.split("\n").filter((l) => l.trim())
  return {
    results: result.stdout.slice(0, 3000),
    resultCount: lines.length,
  }
}

/**
 * 生成结构化回答上下文
 */
async function handleContext(query: string): Promise<{
  outputPath: string
  output: string
}> {
  const result = await execCommand("bun", [
    "run", "harness/make_answer_context.ts", query,
  ])

  const contextPath = join(process.cwd(), ".tmp", "answer_context.md")
  let contextContent = ""
  if (existsSync(contextPath)) {
    contextContent = readFileSync(contextPath, "utf8").slice(0, 5000)
  }

  return {
    outputPath: ".tmp/answer_context.md",
    output: contextContent || result.stdout.slice(0, 3000),
  }
}

/**
 * 检查 topic 合成状态：加载同 topic 全部 claims，对比 topic_stats 判断是否需合成。
 * 返回结构化结果供主 Agent 决定是否 spawn general 子代理执行 LLM 合成。
 */
function handleSynthesize(target: string): {
  needsSynthesis: boolean
  newClaimsCount: number
  totalClaimCount: number
  synthesisPrompt: string
} {
  const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))

  // 查找所有指向该 topic 的 claim links
  const claimLinks = db.query(`
    SELECT source_path FROM links
    WHERE target_path = ? AND source_type = 'claim' AND link_kind = 'ref'
  `, [target]).all() as Array<{source_path: string}>

  // 读取每个 claim 文件内容提取文本
  const claimTexts: string[] = []
  for (const link of claimLinks) {
    const fullPath = resolve(process.cwd(), link.source_path)
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf8")
      const lines = content.split("\n").filter(l => l.trim().startsWith("- [") && l.includes("]"))
      for (const line of lines) {
        const afterBracket = line.slice(line.indexOf("]") + 1).trim()
        const emdash = afterBracket.indexOf("—")
        const text = emdash >= 0 ? afterBracket.slice(0, emdash).trim() : afterBracket
        claimTexts.push(text)
      }
    }
  }

  // 查询 topic_stats 表
  const stat = db.query(`SELECT claim_count, last_synthesized_at FROM topic_stats WHERE topic_path = ?`, [target]).get() as {claim_count: number; last_synthesized_at: string} | undefined
  db.close()

  const totalClaimCount = claimTexts.length
  let newClaimsCount = totalClaimCount
  if (stat) {
    newClaimsCount = Math.max(0, totalClaimCount - stat.claim_count)
  }

  const needsSynthesis = newClaimsCount > 0 && totalClaimCount > 0

  const synthesisPrompt = `You are a knowledge synthesis assistant. Given the following claims about topic "${target}", produce a consolidated synthesis.

Rules:
1. Merge duplicate or overlapping claims into concise statements
2. Preserve contradictory claims with appropriate caveats
3. Assign each synthesized claim a type from: definition, mechanism, constraint, comparison, conclusion, open-question, warning, procedure
4. Source each synthesized claim as "synthesized from [C001][C002]..." using the original claim IDs
5. Status must be "synthesized"
6. Confidence is the lowest confidence among participating claims, demoted by one level

Claims to synthesize (${totalClaimCount} total, ${newClaimsCount} new since last synthesis):
${claimTexts.map((t, i) => `[C${i + 1}] ${t}`).join("\n")}`

  return { needsSynthesis, newClaimsCount, totalClaimCount, synthesisPrompt }
}

/**
 * 检查 topic 推演可能性：需至少 3 条 related claims，返回 speculation prompt。
 * 所有产物强制 confidence=low，写入 topic 页 LLM 推演 managed block。
 */
function handleSpeculate(target: string): {
  canSpeculate: boolean
  claimCount: number
  speculationPrompt: string
} {
  const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))

  const claimLinks = db.query(`
    SELECT source_path FROM links
    WHERE target_path = ? AND source_type = 'claim' AND link_kind = 'ref'
  `, [target]).all() as Array<{source_path: string}>
  db.close()

  // 读取 claim 文本
  const claimTexts: string[] = []
  for (const link of claimLinks) {
    const fullPath = resolve(process.cwd(), link.source_path)
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf8")
      const lines = content.split("\n").filter(l => l.trim().startsWith("- [") && l.includes("]"))
      for (const line of lines) {
        const afterBracket = line.slice(line.indexOf("]") + 1).trim()
        const emdash = afterBracket.indexOf("—")
        const text = emdash >= 0 ? afterBracket.slice(0, emdash).trim() : afterBracket
        claimTexts.push(text)
      }
    }
  }

  const claimCount = claimTexts.length
  const canSpeculate = claimCount >= 3

  const speculationPrompt = `You are a knowledge speculation assistant. Based on the following claims about topic "${target}", generate plausible extrapolations or hypotheses.

CRITICAL BOUNDARIES:
1. All output must have confidence=low — these are speculations, not facts
2. At least 3 related claims are required (${claimCount} available)
3. Output must be formatted for the "LLM 推演" managed block in the topic page
4. Never intermix speculations with factual claims
5. Clearly label each speculation with "推演：" prefix

Claims to reason from:
${claimTexts.map((t, i) => `[C${i + 1}] ${t}`).join("\n")}`

  return { canSpeculate, claimCount, speculationPrompt }
}

const kbManageTool: ToolDefinition = tool({
  description: `Knowledge base manager. Full pipeline: write → index → search.

## Actions

### Write side
- **save_source**: Create kb/sources/{date}-{slug}.md with standard template.
  Params: title, source_url, source_type (webpage|video|transcript|document|manual),
          summary, key_points[], details?, related_topics[]?, vault_path
- **save_claims**: Create kb/claims/{name}.claims.md with standard claim format.
  Params: source_file ("kb/sources/xxx.md"), claims[{type, text, confidence, source_ref?}] — confidence (high|medium|low) is REQUIRED per claim
  Claim types: definition, mechanism, constraint, comparison, conclusion, open-question, warning, procedure
- **link_topic**: Create or update kb/topics/{slug}.md. New topics created from template;
  existing topics updated via managed-block regions.
  Params: topic_name, topic_name_zh?, definition?, related_claims[]?, related_sources[]?, related_entities[]?
- **link_entity**: Create or update kb/entities/{slug}.md.
  Params: entity_name, entity_type (tool|project|concept|framework|person|organization),
          description?, related_topics[]?, related_claims[]?, related_sources[]?, aliases[]?

### Pipeline side
- **after_capture**: Enqueue → process-queue → rebuild FTS5 index.
  Params: vault_path ("vault/articles/xxx.md")
  Returns validation result (hard blocks + soft warnings).

### Read side
- **search**: Search across kb/claims+topics+entities+sources. Supports keyword, semantic, hybrid (default).
  Params: query, mode? ("keyword"|"semantic"|"hybrid", default "hybrid")
- **context**: Generate structured answer context (Claims→Topics→Entities→Sources).
  Params: query

### Graph side
- **backlinks**: Query pages linking to a given target path. Requires: target.
  Example: kb_manage({action: "backlinks", target: "kb/claims/2026-07-10-foo.claims.md"})
- **outlinks**: Query pages a given source links to. Requires: target.
  Example: kb_manage({action: "outlinks", target: "kb/topics/world-model.md"})
- **orphans**: List kb files with zero inbound links (dead knowledge). No target needed.
- **conflicts**: Find conflicting claims pointing to the same topic. Requires: target (topic path).
  Example: kb_manage({action: "conflicts", target: "kb/topics/world-model.md"})

### LLM Feedback side
- **synthesize**: Check if topic has new claims since last synthesis. Returns needsSynthesis boolean + synthesisPrompt with claim text for caller to pass to general subagent.
  Requires: target (topic path).
  Example: kb_manage({action: "synthesize", target: "kb/topics/world-model.md"})
- **speculate**: Check if topic has enough claims (>=3) for LLM speculation. Returns canSpeculate boolean + speculationPrompt.
  All output confidence=low, writes only to "LLM 推演" managed block.
  Requires: target (topic path).
  Example: kb_manage({action: "speculate", target: "kb/topics/world-model.md"})

Format reference: docs/superpowers/specs/VAULT_FORMAT.md`,
  args: {
    action: tool.schema
      .enum([
        "save_source", "save_claims", "link_topic", "link_entity",
        "after_capture", "search", "context",
        "backlinks", "outlinks", "orphans", "conflicts",
        "synthesize", "speculate",
      ])
      .describe("KB action to execute."),

    title: tool.schema.string().optional()
      .describe("(save_source) Source title."),
    source_url: tool.schema.string().optional()
      .describe("(save_source) Original source URL."),
    source_type: tool.schema
      .enum(["webpage", "video", "transcript", "document", "manual"])
      .optional()
      .describe("(save_source) Source type."),
    summary: tool.schema.string().optional()
      .describe("(save_source) One-paragraph summary (max ~200 chars)."),
    key_points: tool.schema.array(tool.schema.string()).optional()
      .describe("(save_source) Key points list."),
    details: tool.schema.string().optional()
      .describe("(save_source) Detailed content (optional)."),
    related_topics: tool.schema.array(tool.schema.string()).optional()
      .describe("(save_source / link_topic / link_entity) Related topic slugs."),
    vault_path: tool.schema.string().optional()
      .describe("(save_source / after_capture) Vault note path, e.g. vault/articles/xxx.md."),

    source_file: tool.schema.string().optional()
      .describe("(save_claims) Path to kb/sources file, e.g. kb/sources/2026-07-10-title.md."),
    claims: tool.schema
      .array(tool.schema.object({
        type: tool.schema.enum([
          "definition", "mechanism", "constraint", "comparison",
          "conclusion", "open-question", "warning", "procedure",
        ]),
        text: tool.schema.string(),
        confidence: tool.schema.enum(["high", "medium", "low"]),
        source_ref: tool.schema.string().optional(),
      }))
      .optional()
      .describe("(save_claims) Array of {type, text, confidence, source_ref?} claim objects. Output includes auto-generated claim_id (C{num})."),

    topic_name: tool.schema.string().optional()
      .describe("(link_topic) Topic name in English."),
    topic_name_zh: tool.schema.string().optional()
      .describe("(link_topic) Topic name in Chinese."),
    definition: tool.schema.string().optional()
      .describe("(link_topic) Topic definition (for new topics)."),

    entity_name: tool.schema.string().optional()
      .describe("(link_entity) Entity name."),
    entity_type: tool.schema
      .enum(["tool", "project", "concept", "framework", "person", "organization"])
      .optional()
      .describe("(link_entity) Entity type."),
    description: tool.schema.string().optional()
      .describe("(link_entity) Entity description."),
    aliases: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_entity) Alternative names."),

    related_claims: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_topic / link_entity) Related claim paths, e.g. kb/claims/xxx.claims."),
    related_sources: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_topic / link_entity) Related source paths, e.g. kb/sources/xxx."),
    related_entities: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_topic) Related entity paths, e.g. kb/entities/xxx."),

    query: tool.schema.string().optional()
      .describe("(search / context) Search query string."),

    target: tool.schema.string().optional()
      .describe("(backlinks/outlinks/conflicts) Target file path, e.g. kb/claims/xxx.md or kb/topics/xxx.md"),
  },
  async execute(args) {
    const action = args.action as string

    switch (action) {
      case "save_source": {
        if (!args.title || !args.source_url || !args.source_type || !args.summary || !args.key_points || !args.vault_path) {
          throw new Error("save_source requires: title, source_url, source_type, summary, key_points, vault_path")
        }
        const result = handleSaveSource({
          title: args.title as string,
          source_url: args.source_url as string,
          source_type: args.source_type as SourceType,
          summary: args.summary as string,
          key_points: args.key_points as string[],
          details: args.details as string | undefined,
          related_topics: args.related_topics as string[] | undefined,
          vault_path: args.vault_path as string,
        })
        return JSON.stringify(result, null, 2)
      }

      case "save_claims": {
        if (!args.source_file || !args.claims) {
          throw new Error("save_claims requires: source_file, claims")
        }
        const result = handleSaveClaims({
          source_file: args.source_file as string,
          claims: args.claims as Array<{ type: ClaimType; text: string; confidence: ConfidenceLevel; source_ref?: string }>,
        })
        return JSON.stringify(result, null, 2)
      }

      case "link_topic": {
        if (!args.topic_name) {
          throw new Error("link_topic requires: topic_name")
        }
        const result = handleLinkTopic({
          topic_name: args.topic_name as string,
          topic_name_zh: args.topic_name_zh as string | undefined,
          definition: args.definition as string | undefined,
          related_claims: args.related_claims as string[] | undefined,
          related_sources: args.related_sources as string[] | undefined,
          related_entities: args.related_entities as string[] | undefined,
        })
        return JSON.stringify(result, null, 2)
      }

      case "link_entity": {
        if (!args.entity_name || !args.entity_type) {
          throw new Error("link_entity requires: entity_name, entity_type")
        }
        const result = handleLinkEntity({
          entity_name: args.entity_name as string,
          entity_type: args.entity_type as EntityType,
          description: args.description as string | undefined,
          related_topics: args.related_topics as string[] | undefined,
          related_claims: args.related_claims as string[] | undefined,
          related_sources: args.related_sources as string[] | undefined,
          aliases: args.aliases as string[] | undefined,
        })
        return JSON.stringify(result, null, 2)
      }

      case "after_capture": {
        if (!args.vault_path) {
          throw new Error("after_capture requires: vault_path")
        }
        const result = await handleAfterCapture(args.vault_path as string)
        return JSON.stringify(result, null, 2)
      }

      case "search": {
        if (!args.query) {
          throw new Error("search requires: query")
        }
        const result = await handleSearch(args.query as string)
        return JSON.stringify(result, null, 2)
      }

      case "context": {
        if (!args.query) {
          throw new Error("context requires: query")
        }
        const result = await handleContext(args.query as string)
        return JSON.stringify(result, null, 2)
      }

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
        const orphans: Record<string, string[]> = {
          claims: [],
          entities: [],
          topics: [],
        }
        const typeDirMap: Array<[string, string]> = [["claim", "claims"], ["entity", "entities"], ["topic", "topics"]]
        for (const [type, dir] of typeDirMap) {
          const dirPath = join(process.cwd(), "kb", dir)
          if (!existsSync(dirPath)) continue
          const files = readdirSync(dirPath).filter(f => f.endsWith(".md") && f !== ".template.md")
          for (const f of files) {
            const p = `kb/${dir}/${f}`
            const count = db.query("SELECT COUNT(*) as c FROM links WHERE target_path = ?", [p]).get() as {c: number}
            if (count.c === 0) orphans[type].push(p)
          }
        }
        db.close()
        return JSON.stringify(orphans, null, 2)
      }

      case "conflicts": {
        if (!args.target) throw new Error("conflicts requires: target (topic path)")
        const topic = args.target as string
        const db = new Database(resolve(process.cwd(), "index/browsercode.sqlite"))
        const rows = db.query(`
          SELECT l1.source_path as a, l2.source_path as b, l1.link_context as a_ctx, l2.link_context as b_ctx
          FROM links l1
          JOIN links l2 ON l1.target_path = l2.target_path AND l1.source_path < l2.source_path
          WHERE l1.target_path = ? AND l1.link_kind = 'ref'
        `, [topic]).all() as Array<{a: string; b: string; a_ctx: string; b_ctx: string}>
        db.close()
        return JSON.stringify({ topic, potentialConflicts: rows.map(r => ({ a: r.a, b: r.b })) }, null, 2)
      }

      case "synthesize": {
        if (!args.target) throw new Error("synthesize requires: target (topic path)")
        const result = handleSynthesize(args.target as string)
        return JSON.stringify(result, null, 2)
      }

      case "speculate": {
        if (!args.target) throw new Error("speculate requires: target (topic path)")
        const result = handleSpeculate(args.target as string)
        return JSON.stringify(result, null, 2)
      }

      default:
        throw new Error(`Unknown kb_manage action: ${action}`)
    }
  },
})

export default kbManageTool
