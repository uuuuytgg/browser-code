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
