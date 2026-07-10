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
