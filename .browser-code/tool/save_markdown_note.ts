import { join, extname } from "node:path"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tool, type ToolDefinition } from "../../opencode/node_modules/@opencode-ai/plugin/src/index"

const vaultDir = join(process.cwd(), "vault")

const CONTENT_DIR: Record<string, string> = {
  article: "articles",
  video: "videos",
  document: "documents",
  snippet: "snippets",
  resource: "resources",
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function shortHash(text: string) {
  return createHash("sha1").update(text).digest("hex").slice(0, 8)
}

function buildFrontmatter(meta: Record<string, unknown>) {
  const lines = ["---"]
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (Array.isArray(value)) lines.push(`${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`)
    else if (typeof value === "string") lines.push(`${key}: ${JSON.stringify(value)}`)
    else if (typeof value === "number" || typeof value === "boolean") lines.push(`${key}: ${value}`)
  }
  lines.push("---", "")
  return lines.join("\n")
}

const saveMarkdownNoteTool: ToolDefinition = tool({
  description: `Save a Markdown note into the local vault with automatic dedup, canonical filename, and index rebuild.

Unlike the generic 'write' tool:
- Auto-dedup: checks source_url to avoid saving the same page twice
- Canonical filename: YYYY-MM-DD__slugified-title__8-char-hash.md
- Auto-routing: saves to vault/articles/, vault/videos/, vault/documents/, vault/snippets/, or vault/resources/ based on content_type
- Auto-index: rebuilds vault/index/index.json after saving
- Local mode: when source_url is absent or not http(s), uses local://<hash> as source_url, dedup by content hash, filename from title+date. Use this for non-web content (PDF via Read, OCR output, manual notes).

After saving, complete the KB pipeline:
1. kb_manage({ action: "save_source", title, source_url, source_type, summary, key_points, vault_path })
2. kb_manage({ action: "save_claims", source_file: "kb/sources/xxx.md", claims: [...] })
3. kb_manage({ action: "link_topic", topic_name, ... }) / kb_manage({ action: "link_entity", entity_name, ... }) (optional)
4. kb_manage({ action: "after_capture", vault_path: "vault/.../xxx.md" })

Format reference: docs/superpowers/specs/VAULT_FORMAT.md`,
  args: {
    content: tool.schema.string().describe("Full Markdown content of the note."),
    title: tool.schema.string().describe("Note title (used in filename and frontmatter)."),
    source_url: tool.schema.string().optional().describe("Source URL for dedup and frontmatter."),
    content_type: tool.schema
      .enum(["article", "video", "document", "snippet", "resource"])
      .optional()
      .describe("Content type. Determines vault subdirectory. Default 'article'."),
    tags: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Tags for the note."),
  },
  async execute(args) {
    const contentType = (args.content_type as string) || "article"
    const dirName = CONTENT_DIR[contentType] || "articles"
    const subDir = join(vaultDir, dirName)
    mkdirSync(subDir, { recursive: true })

    // Phase 6: Detect mode — URL-based or local-file shortcut
    const isLocalMode = !args.source_url || !/^https?:\/\//i.test(args.source_url as string)

    if (isLocalMode) {
      // ── Local file shortcut mode ──
      const contentHash = shortHash(args.content as string)
      const localSourceUrl = `local://${contentHash}`
      const today = new Date().toISOString().slice(0, 10)
      const slug = slugify(args.title || "untitled")
      const filename = `${today}__${slug}__${contentHash.slice(0, 8)}.md`

      // Dedup by content hash (not URL)
      let existingPath: string | null = null
      if (existsSync(subDir)) {
        const { readdirSync } = await import("node:fs")
        const files = readdirSync(subDir).filter((f) => f.endsWith(".md"))
        for (const file of files) {
          if (file.includes(contentHash.slice(0, 8))) {
            existingPath = `vault/${dirName}/${file}`
            break
          }
        }
      }
      if (existingPath) {
        return { filePath: existingPath, deduped: true, mode: "local", indexUpdated: false }
      }

      const frontmatter = buildFrontmatter({
        title: args.title || "Untitled",
        source_url: localSourceUrl,
        date: today,
        content_type: contentType,
        tags: args.tags ?? [],
        captured_at: new Date().toISOString(),
      })

      const fullContent = frontmatter + (args.content as string)
      const filePath = join(subDir, filename)
      writeFileSync(filePath, fullContent, "utf8")
      rebuildVaultIndex()

      return {
        filePath: `vault/${dirName}/${filename}`,
        deduped: false,
        mode: "local",
        indexUpdated: true,
      }
    }

    // ── Standard web-URL mode ──
    // Dedup: check for existing note with same source_url
    let existingPath: string | null = null
    if (args.source_url && existsSync(subDir)) {
      const { readdirSync } = await import("node:fs")
      const files = readdirSync(subDir).filter((f) => f.endsWith(".md"))
      for (const file of files) {
        const content = readFileSync(join(subDir, file), "utf8")
        if (content.includes(args.source_url)) {
          existingPath = `vault/${dirName}/${file}`
          break
        }
      }
    }
    if (existingPath) {
      return { filePath: existingPath, deduped: true, mode: "web", indexUpdated: false }
    }

    // Generate filename
    const today = new Date().toISOString().slice(0, 10)
    const slug = slugify(args.title || "untitled")
    const hash = shortHash(args.content + (args.source_url || ""))
    const filename = `${today}__${slug}__${hash}.md`

    // Build frontmatter
    const frontmatter = buildFrontmatter({
      title: args.title || "Untitled",
      source_url: args.source_url,
      date: today,
      content_type: contentType,
      tags: args.tags ?? [],
      captured_at: new Date().toISOString(),
    })

    const fullContent = frontmatter + args.content
    const filePath = join(subDir, filename)
    writeFileSync(filePath, fullContent, "utf8")

    // Rebuild vault index
    rebuildVaultIndex()

    return {
      filePath: `vault/${dirName}/${filename}`,
      deduped: false,
      mode: "web",
      indexUpdated: true,
    }
  },
})

function rebuildVaultIndex() {
  const { readdirSync: rd, existsSync: es, writeFileSync: wf } = require("node:fs") as typeof import("node:fs")
  const idxDir = join(vaultDir, "index")
  mkdirSync(idxDir, { recursive: true })

  const notes: Record<string, unknown>[] = []
  for (const dirName of Object.values(CONTENT_DIR)) {
    const dir = join(vaultDir, dirName)
    if (!es(dir)) continue
    for (const file of rd(dir)) {
      if (!file.endsWith(".md")) continue
      const content = readFileSync(join(dir, file), "utf8")
      const fm = parseSimpleFrontmatter(content)
      notes.push({
        note_id: fm.id || shortHash(content),
        title: fm.title || file.replace(/\.md$/, ""),
        path: `${dirName}/${file}`,
        tags: fm.tags || [],
        keywords: fm.keywords || [],
        content_type: fm.content_type || "article",
        source_url: fm.source_url || null,
        created_at: fm.date || fm.captured_at || "",
        content_hash: shortHash(content),
      })
    }
  }

  wf(join(idxDir, "index.json"), JSON.stringify({ notes, updated_at: new Date().toISOString() }, null, 2), "utf8")
}

function parseSimpleFrontmatter(md: string) {
  const result: Record<string, unknown> = {}
  if (!md.startsWith("---")) return result
  const end = md.indexOf("---", 3)
  if (end === -1) return result
  const yaml = md.slice(3, end)
  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()
    // Parse arrays
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    }
    // Unquote strings
    if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export default saveMarkdownNoteTool
