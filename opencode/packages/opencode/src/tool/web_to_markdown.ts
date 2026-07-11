import { Effect, Schema } from "effect"
import { JSDOM } from "jsdom"
import { Readability, isProbablyReaderable } from "@mozilla/readability"
import TurndownService from "turndown"
import * as Tool from "./tool"
import DESCRIPTION from "./web_to_markdown.txt"
import path from "path"
import fs from "fs"
import crypto from "crypto"

/* ------------------------------------------------------------------ */
/*  GFM plugin helper                                                  */
/* ------------------------------------------------------------------ */

function useGfm(turndownService: TurndownService): void {
  // turndown-plugin-gfm has no type declarations; require() avoids the TS error
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gfm } = require("turndown-plugin-gfm") as { gfm: (service: TurndownService) => void }
  turndownService.use(gfm)
}

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "The source URL of the HTML content" }),
  html: Schema.optional(Schema.String).annotate({
    description: "Raw HTML to convert (if not provided, use url to fetch)",
  }),
  mode: Schema.optional(
    Schema.Literals(["readability", "full", "selection"]).pipe(
      Schema.withDecodingDefault(Effect.succeed("readability" as const)),
    ),
  ).annotate({ description: "Extraction mode: readability (default), full, or selection" }),
  selected_text: Schema.optional(Schema.String).annotate({
    description: "Pre-selected text to use when mode is 'selection' or readability falls back",
  }),
  // [BROWSER-CODE-CHANGE] Obsidian-level enhancements
  localize_images: Schema.optional(
    Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false as const))),
  ).annotate({
    description:
      "If true, download images into assets_dir and rewrite markdown image links to local relative paths. Requires assets_dir.",
  }),
  assets_dir: Schema.optional(Schema.String).annotate({
    description:
      "Absolute or vault-relative directory to save downloaded images into (e.g. vault/assets/<note_id>). Used only when localize_images is true. Created if missing.",
  }),
  infer_tags: Schema.optional(
    Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true as const))),
  ).annotate({
    description: "Infer tags from title, og:keywords, and content keywords. Default true.",
  }),
})

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function countWords(markdown: string): number {
  const matches = markdown.match(/\S+/g)
  return matches?.length ?? 0
}

function cleanMarkdown(md: string): string {
  return md.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

// [BROWSER-CODE-CHANGE] minimal tag normalization aligned with tool-vault/tag-policy.ts
const TAG_BLOCKLIST = [
  /^\d+$/,
  /^article$/,
  /^doc$/,
  /^note$/,
  /^tutorial$/,
  /^untitled$/,
  /^technology$/,
  /^programming$/,
  /^study$/,
  /^post$/,
  /^page$/,
  /^web$/,
]
const TAG_ALIASES: Record<string, string> = {
  reactjs: "react",
  "react-js": "react",
  "react.js": "react",
  "front-end": "frontend",
  front_end: "frontend",
  "front end": "frontend",
  "artificial-intelligence": "ai",
  typescriptlang: "typescript",
  ts: "typescript",
}

function sanitizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[/ : * ? " < > | # @ ! $ % ^ & + = { } [ ]]/g, "")
    .replace(/[.]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 32)
}

function normalizeTags(raw: string[], maxTags = 6): string[] {
  const out: string[] = []
  for (const raw_ of raw) {
    let t = sanitizeTag(raw_)
    if (!t) continue
    if (TAG_ALIASES[t]) t = TAG_ALIASES[t]
    if (TAG_BLOCKLIST.some((re) => re.test(t))) continue
    if (!out.includes(t)) out.push(t)
    if (out.length >= maxTags) break
  }
  return out
}

function inferTags(document: Document, title: string, bodyText: string): string[] {
  const raw: string[] = []
  // 1. og:keywords / meta keywords
  const metaKeywords =
    document.querySelector("meta[name='keywords']")?.getAttribute("content") ||
    document.querySelector("meta[property='og:keywords']")?.getAttribute("content") ||
    ""
  for (const kw of metaKeywords.split(",")) {
    const k = kw.trim()
    if (k) raw.push(k)
  }
  // 2. article:tag entries (common for blog platforms)
  for (const el of document.querySelectorAll("meta[property='article:tag']")) {
    const c = el.getAttribute("content")?.trim()
    if (c) raw.push(c)
  }
  // 3. title-derived tokens (drop stopwords / short tokens)
  const stopwords = new Set([
    "the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "with", "how", "why",
    "what", "is", "are", "your", "you", "my", "i", "we", "they", "this", "that",
    "的", "了", "是", "在", "和", "与", "如何", "为什么", "一个",
  ])
  for (const tok of title.split(/[\s,，:：|·\-—·]+/)) {
    const t = tok.trim()
    if (t.length >= 3 && !stopwords.has(t.toLowerCase())) raw.push(t)
  }
  // 4. frequency-based keywords from body (top noun-ish tokens)
  const freq = new Map<string, number>()
  for (const tok of bodyText.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (stopwords.has(tok)) continue
    freq.set(tok, (freq.get(tok) ?? 0) + 1)
  }
  const freqTags = [...freq.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t)
  for (const t of freqTags) raw.push(t)

  return normalizeTags(raw)
}

// [BROWSER-CODE-CHANGE] published date extraction (Readability gives article.publishedTime)
function extractPublishedDate(document: Document, articlePublishedTime?: string | null): string | undefined {
  if (articlePublishedTime) return articlePublishedTime
  const candidates = [
    "meta[property='article:published_time']",
    "meta[property='og:article:published_time']",
    "meta[name='date']",
    "meta[name='publish-date']",
    "meta[name='publication_date']",
    "time[datetime]",
  ]
  for (const sel of candidates) {
    const el = document.querySelector(sel)
    const val = el?.getAttribute("content") || el?.getAttribute("datetime")
    if (val?.trim()) return val.trim()
  }
  return undefined
}

function buildFrontmatter(meta: {
  title: string
  source_url: string
  byline?: string
  excerpt?: string
  site_name?: string
  language?: string
  tags?: string[]
  published?: string
  captured_at?: string
}): string {
  const lines: string[] = ["---"]
  lines.push(`title: ${meta.title.replace(/"/g, '\\"')}`)
  lines.push(`source_url: ${meta.source_url}`)
  if (meta.published) lines.push(`published: ${meta.published}`)
  if (meta.captured_at) lines.push(`captured_at: ${meta.captured_at}`)
  if (meta.byline) lines.push(`byline: ${meta.byline.replace(/"/g, '\\"')}`)
  if (meta.excerpt) lines.push(`excerpt: ${meta.excerpt.replace(/"/g, '\\"')}`)
  if (meta.site_name) lines.push(`site_name: ${meta.site_name.replace(/"/g, '\\"')}`)
  if (meta.language) lines.push(`language: ${meta.language}`)
  if (meta.tags && meta.tags.length) lines.push(`tags: [${meta.tags.map((t) => t).join(", ")}]`)
  lines.push("---")
  return lines.join("\n")
}

function extractMetadata(document: Document, fallbackTitle: string | undefined, sourceUrl: string) {
  const title =
    document.querySelector("title")?.textContent?.trim() ||
    document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() ||
    fallbackTitle ||
    sourceUrl

  const excerpt =
    document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
    document.querySelector("meta[property='og:description']")?.getAttribute("content")?.trim() ||
    undefined

  const byline =
    document.querySelector("meta[name='author']")?.getAttribute("content")?.trim() || undefined

  const siteName =
    document.querySelector("meta[property='og:site_name']")?.getAttribute("content")?.trim() || undefined

  const language = document.documentElement.lang?.trim() || undefined

  return { title, source_url: sourceUrl, byline, excerpt, site_name: siteName, language }
}

function extractResources(document: Document, baseUrl: string) {
  const resources: Array<{ type: string; url: string; text?: string }> = []
  const seen = new Set<string>()

  const add = (resource: { type: string; url: string; text?: string }) => {
    const key = `${resource.type}:${resource.url}`
    if (!seen.has(key)) {
      seen.add(key)
      resources.push(resource)
    }
  }

  for (const img of document.querySelectorAll("img")) {
    const src = img.getAttribute("src")
    if (!src) continue
    add({ type: "image", url: new URL(src, baseUrl).toString(), text: img.getAttribute("alt") || undefined })
  }

  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href")
    if (!href) continue
    const url = new URL(href, baseUrl).toString()
    const lower = url.toLowerCase()
    let type = "link"
    if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/.test(lower)) type = "image"
    else if (/\.(pdf|docx?|pptx?|xlsx?)(\?|#|$)/.test(lower)) type = "document"
    else if (/\.(mp4|mp3|wav|webm|ogg|m4a)(\?|#|$)/.test(lower)) type = "media"
    add({ type, url, text: anchor.textContent?.trim() || undefined })
  }

  return resources.map((r) => ({
    ...(r.type === "image" ? { object_asset: r.url, text: r.text } : { webpage_reference: r.url, text: r.text }),
    type: r.type,
  }))
}

// [BROWSER-CODE-CHANGE] turndown can crash on some HTML in the compiled binary
// (internal querySelector on undefined). Fall back to a regex HTML-strip so we
// still return usable text instead of crashing the whole tool.
function turndownSafe(turndownService: TurndownService, html: string): string {
  try {
    return turndownService.turndown(html)
  } catch {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }
}

function createTurndownService() {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    linkStyle: "inlined",
  })
  useGfm(turndownService)
  turndownService.remove(["script", "style", "noscript"])
  return turndownService
}

function parseReadableArticle(document: Document) {
  const documentClone = document.cloneNode(true) as Document
  let article: ReturnType<InstanceType<typeof Readability>["parse"]> = undefined
  let isProbablyArticle = false
  // [BROWSER-CODE-CHANGE] Readability + isProbablyReaderable can throw on minimal/malformed
  // HTML (e.g. example.com). Catch and treat as "no article" so the caller falls back to
  // full-body extraction.
  try {
    isProbablyArticle = isProbablyReaderable(document)
  } catch {
    isProbablyArticle = false
  }
  try {
    article = new Readability(documentClone, { keepClasses: false }).parse()
  } catch {
    article = undefined
  }
  return { article, isProbablyArticle }
}

function buildFullBodyHtml(document: Document) {
  return document.body?.innerHTML || document.documentElement.innerHTML || ""
}

function buildSelectionMarkdown(title: string, selectedText: string) {
  return cleanMarkdown(`# ${title}\n\n${selectedText}`)
}

// [BROWSER-CODE-CHANGE] image localization: download + rewrite to local relative paths
function safeImageExt(url: string, contentType?: string): string {
  if (contentType) {
    const ct = contentType.toLowerCase()
    if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg"
    if (ct.includes("png")) return "png"
    if (ct.includes("gif")) return "gif"
    if (ct.includes("webp")) return "webp"
    if (ct.includes("svg")) return "svg"
  }
  const m = url.toLowerCase().match(/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/)
  if (m) return m[1] === "jpg" ? "jpg" : m[1]
  return "png"
}

async function downloadImage(url: string, destDir: string, noteId: string, idx: number): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0.0.0" },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = safeImageExt(url, res.headers.get("content-type") ?? undefined)
    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8)
    const filename = `${noteId}_${idx}_${hash}.${ext}`
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, filename)
    fs.writeFileSync(dest, buf)
    return filename
  } catch {
    return undefined
  }
}

// Rewrite markdown image links to local relative paths after download.
// Returns { markdown, downloaded, failed }.
async function localizeImages(
  markdown: string,
  assetsDir: string,
  noteId: string,
  assetsRelPrefix: string,
): Promise<{ markdown: string; downloaded: string[]; failed: string[] }> {
  const downloaded: string[] = []
  const failed: string[] = []
  // Match markdown image syntax: ![alt](url)
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let idx = 0
  const matches = [...markdown.matchAll(imgRe)]
  for (const m of matches) {
    idx++
    const alt = m[1]
    const url = m[2]
    if (!/^https?:\/\//i.test(url)) continue // skip already-local or data: urls
    const filename = await downloadImage(url, assetsDir, noteId, idx)
    if (filename) {
      downloaded.push(url)
      const localRel = `${assetsRelPrefix.replace(/\\/g, "/")}/${filename}`
      markdown = markdown.replace(m[0], `![${alt}](${localRel})`)
    } else {
      failed.push(url)
    }
  }
  return { markdown, downloaded, failed }
}

/* ------------------------------------------------------------------ */
/*  Tool definition                                                    */
/* ------------------------------------------------------------------ */

export const WebToMarkdownTool = Tool.define(
  "web_to_markdown",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://") && !params.url.startsWith("file://")) {
            throw new Error("url must start with http://, https://, or file://")
          }

          yield* ctx.ask({
            permission: "web_to_markdown",
            patterns: [params.url],
            always: ["*"],
            metadata: {
              url: params.url,
              mode: params.mode ?? "readability",
            },
          })

          const html = params.html ?? ""
          // [BROWSER-CODE-CHANGE] if no html provided, self-fetch the url (Obsidian-clipper style).
          // webfetch output can be too large to thread back through tool params, so letting this
          // tool fetch directly avoids a round-trip that loses the HTML.
          let fetchedHtml = html
          let selfFetched = false
          if (!fetchedHtml && (params.url.startsWith("http://") || params.url.startsWith("https://"))) {
            const fetched = yield* Effect.tryPromise({
              try: async () => {
                const res = await fetch(params.url, {
                  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0.0.0" },
                  signal: AbortSignal.timeout(30000),
                  redirect: "follow",
                })
                if (!res.ok) return null
                return await res.text()
              },
              catch: () => null as string | null,
            })
            if (fetched) {
              fetchedHtml = fetched
              selfFetched = true
            }
          }
          if (!fetchedHtml) {
            throw new Error("html content is required for conversion (pass html, or a fetchable url)")
          }

          const mode = params.mode ?? "readability"
          const dom = new JSDOM(fetchedHtml, {
            url: params.url,
            contentType: "text/html",
          })
          const { document } = dom.window

          const metadata = extractMetadata(document, undefined, params.url)
          const turndownService = createTurndownService()

          let markdown = ""
          let extractionMethod: "readability" | "full" | "selection" = "readability"
          let isProbablyArticle = false
          let qualityGate: "pass" | "fallback" | "n/a" = "pass"
          let articlePublishedTime: string | null | undefined = undefined

          if (mode === "selection" && params.selected_text?.trim()) {
            markdown = buildSelectionMarkdown(metadata.title, params.selected_text.trim())
            extractionMethod = "selection"
            qualityGate = "n/a"
          } else if (mode === "full") {
            markdown = cleanMarkdown(turndownSafe(turndownService, buildFullBodyHtml(document)))
            extractionMethod = "full"
          } else {
            const { article, isProbablyArticle: readerable } = parseReadableArticle(document)
            isProbablyArticle = readerable
            articlePublishedTime = article?.publishedTime

            if (article?.content) {
              markdown = cleanMarkdown(turndownSafe(turndownService, article.content))
              metadata.title = article.title || metadata.title
              metadata.byline = article.byline || metadata.byline
              metadata.excerpt = article.excerpt || metadata.excerpt
              metadata.site_name = article.siteName || metadata.site_name
              metadata.language = article.lang || metadata.language
              extractionMethod = "readability"
              // [BROWSER-CODE-CHANGE] quality gate: if readability output is too thin, fall back to full
              const MIN_WORDS = 50
              if (countWords(markdown) < MIN_WORDS) {
                markdown = cleanMarkdown(turndownSafe(turndownService, buildFullBodyHtml(document)))
                extractionMethod = "full"
                qualityGate = "fallback"
              }
            } else if (params.selected_text?.trim()) {
              markdown = buildSelectionMarkdown(metadata.title, params.selected_text.trim())
              extractionMethod = "selection"
              qualityGate = "n/a"
            } else {
              markdown = cleanMarkdown(turndownSafe(turndownService, buildFullBodyHtml(document)))
              extractionMethod = "full"
            }
          }

          if (!markdown.startsWith("# ")) {
            markdown = cleanMarkdown(`# ${metadata.title}\n\n${markdown}`)
          }

          // [BROWSER-CODE-CHANGE] tag inference
          const tags = params.infer_tags ? inferTags(document, metadata.title, markdown) : []

          // [BROWSER-CODE-CHANGE] published date (previously discarded)
          const published = extractPublishedDate(document, articlePublishedTime)
          const capturedAt = new Date().toISOString()

          // [BROWSER-CODE-CHANGE] image localization
          let downloaded: string[] = []
          let failedImages: string[] = []
          let assetsDirUsed: string | undefined
          if (params.localize_images && params.assets_dir) {
            const assetsDir = path.isAbsolute(params.assets_dir)
              ? params.assets_dir
              : path.resolve(process.cwd(), params.assets_dir)
            assetsDirUsed = assetsDir
            // note_id derived from url hash (aligned with save-note.ts createNoteId format)
            const noteId = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${crypto
              .createHash("sha1")
              .update(params.url)
              .digest("hex")
              .slice(0, 8)}`
            const assetsRelPrefix = path.relative(process.cwd(), path.join(assetsDir)).replace(/\\/g, "/")
            const result = yield* Effect.promise(() =>
              localizeImages(markdown, assetsDir, noteId, assetsRelPrefix),
            )
            markdown = result.markdown
            downloaded = result.downloaded
            failedImages = result.failed
          }

          const frontmatter = buildFrontmatter({
            ...metadata,
            tags,
            published,
            captured_at: capturedAt,
          })
          const output = `${frontmatter}\n\n${markdown}`

          const resources = extractResources(document, params.url)

          return {
            title: metadata.title,
            output,
            metadata: {
              title: metadata.title,
              source_url: metadata.source_url,
              byline: metadata.byline ?? "",
              excerpt: metadata.excerpt ?? "",
              site_name: metadata.site_name ?? "",
              language: metadata.language ?? "",
              published: published ?? "",
              tags: JSON.stringify(tags),
              word_count: countWords(markdown).toString(),
              extraction_method: extractionMethod,
              self_fetched: String(selfFetched),
              is_probably_article: String(isProbablyArticle || extractionMethod === "selection"),
              quality_gate: qualityGate,
              images_localized: String(params.localize_images === true),
              images_downloaded: downloaded.length.toString(),
              images_failed: JSON.stringify(failedImages),
              assets_dir: assetsDirUsed ?? "",
              resources: JSON.stringify(resources),
            },
          }
        }),
    }
  }),
)
