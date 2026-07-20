import { join } from "node:path"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { tool, type ToolDefinition } from "@opencode-ai/plugin"

const vaultDir = join(process.cwd(), "vault")

const CONTENT_DIR: Record<string, string> = {
  article: "articles",
  video: "videos",
  document: "documents",
  snippet: "snippets",
  resource: "resources",
}

function tokenize(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
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
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    }
    if (typeof value === "string" && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

const searchVaultTool: ToolDefinition = tool({
  description: `[Fallback search] Search raw vault notes via the tag index.

Retrieval priority — use the primary path first:
  Primary: kb_manage action="search" query="..."
    → SQLite FTS5 over kb/claims + kb/topics + kb/entities + kb/sources
    → Pyramid-weighted ranking: claims(w3) > topics(w2) > entities(w1) > sources(w0)
    → Searches refined structured knowledge, not raw markdown

  Fallback (this tool): search_vault query="..."
    → Tag-indexed keyword search over vault/ raw markdown notes
    → Only use when kb_manage search returns nothing
    → Use cases: orphan notes not yet in the KB pipeline, just-saved notes

Scoring: title(w5) > tags(w4) > keywords(w3) > body text(w1).`,
  args: {
    query: tool.schema.string().describe("Search keywords."),
    limit: tool.schema.number().optional().describe("Max results. Default 10."),
    content_type: tool.schema
      .enum(["article", "video", "document", "snippet", "resource"])
      .optional()
      .describe("Filter by content type."),
  },
  async execute(args) {
    const tokens = tokenize(args.query || "")
    if (tokens.length === 0) return { total: 0, results: [] }

    const results: { noteId: string; title: string; path: string; score: number; snippet: string }[] = []
    const dirsToScan = args.content_type
      ? [CONTENT_DIR[args.content_type as string] || "articles"]
      : Object.values(CONTENT_DIR)

    for (const dirName of dirsToScan) {
      const dir = join(vaultDir, dirName)
      if (!existsSync(dir)) continue
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".md")) continue
        const fullPath = join(dir, file)
        const content = readFileSync(fullPath, "utf8")
        const fm = parseSimpleFrontmatter(content)
        const body = content.slice(content.indexOf("---", 3) + 3 || 0).toLowerCase()
        const title = (fm.title as string) || file.replace(/\.md$/, "")

        // Scoring
        let score = 0
        const titleLower = title.toLowerCase()
        for (const t of tokens) {
          if (titleLower.includes(t)) score += 5
          const tagArr = (fm.tags as string[]) || []
          for (const tag of tagArr) {
            if (tag.toLowerCase().includes(t)) score += 4
          }
          if (body.includes(t)) score += 1
        }

        if (score <= 0) continue

        const snippet = body.slice(0, 160)
        results.push({
          noteId: `${dirName}/${file}`,
          title,
          path: `vault/${dirName}/${file}`,
          score,
          snippet,
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return {
      total: results.length,
      results: results.slice(0, args.limit ?? 10),
    }
  },
})

export default searchVaultTool
