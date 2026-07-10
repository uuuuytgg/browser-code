import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
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

  const content = [
    `# ${args.title}`,
    "",
    "## Metadata",
    `source_type: ${args.source_type}`,
    `source_url: ${args.source_url}`,
    `captured_at: ${isoNow()}`,
    `vault_path: ${args.vault_path}`,
    "status: active",
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
 * 创建 kb/claims/{name}.claims.md
 * claim type 由 enum 约束，格式由代码保证。
 */
function handleSaveClaims(args: SaveClaimsArgs): {
  filePath: string
  claimCount: number
  created: boolean
} {
  const sourceName = args.source_file
    .replace(/^kb\/sources\//, "")
    .replace(/\.md$/, "")
  const sourceTitle = sourceName
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-/g, " ")

  const filename = `${sourceName}.claims.md`
  const filePath = join(CLAIMS_DIR, filename)

  if (existsSync(filePath)) {
    return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, created: false }
  }

  // 验证 claim type
  for (const claim of args.claims) {
    if (!CLAIM_TYPES.includes(claim.type)) {
      throw new Error(
        `无效的 claim type: "${claim.type}"。有效值：${CLAIM_TYPES.join(", ")}`,
      )
    }
  }

  const claimLines = args.claims
    .map((c) => `- [${c.type}] ${c.text}`)
    .join("\n")

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
  return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, created: true }
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
