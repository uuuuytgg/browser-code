import { spawn } from "child_process"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./fetch_transcript.txt"
import path from "path"
import fs from "fs"
import os from "os"

// [BROWSER-CODE-CHANGE] rewritten to use yt-dlp for subtitle fetching instead of
// fragile HTML regex. yt-dlp pulls real subtitle tracks (manual + auto) from
// YouTube/Bilibili/1000+ sites, far more robust than scraping HTML attributes.
// Falls back to "need_audio_transcription" when no subtitles exist, so the caller
// can route to the audio transcription path (ffmpeg + doubao ASR).

// --- Platform detection ---

const VideoPlatform = Schema.Literal("youtube", "bilibili", "unknown")

function detectVideoPlatform(url: string): "youtube" | "bilibili" | "unknown" {
  const normalized = url.toLowerCase()
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "youtube"
  if (normalized.includes("bilibili.com") || normalized.includes("b23.tv")) return "bilibili"
  return "unknown"
}

// --- Transcript line schema ---

const TranscriptLine = Schema.Struct({
  start: Schema.Number,
  end: Schema.optional(Schema.Number),
  text: Schema.String,
})

// --- Input / Output schemas ---

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "Video URL (YouTube/Bilibili/etc.)" }),
  // html kept for backward-compat but no longer used for extraction
  html: Schema.optional(Schema.String).annotate({ description: "Deprecated. Subtitles are fetched via yt-dlp now." }),
  languages: Schema.optional(Schema.String).annotate({
    description:
      "Comma-separated preferred subtitle language codes, e.g. 'zh,en'. Default 'zh,en'. First available is used.",
  }),
})

const Metadata = Schema.Struct({
  title: Schema.optional(Schema.String),
  uploader: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.Number),
})

const Output = Schema.Struct({
  ok: Schema.Boolean,
  platform: VideoPlatform,
  transcript: Schema.optional(Schema.Array(TranscriptLine)),
  transcript_text: Schema.optional(Schema.String),
  metadata: Schema.optional(Metadata),
  subtitle_source: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  next_action: Schema.Literal("summarize", "need_audio_transcription", "unsupported"),
})

// --- SRT/VTT parsing ---

function parseTimestamp(ts: string): number {
  // SRT: HH:MM:SS,mmm  VTT: HH:MM:SS.mmm
  const m = ts.match(/(\d+):(\d+):(\d+)[.,](\d+)/)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
}

function parseSubtitle(content: string): Array<{ start: number; end?: number; text: string }> {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const out: Array<{ start: number; end?: number; text: string }> = []
  let i = 0
  // Strip WEBVTT header / NOTE blocks
  while (i < lines.length && (lines[i].startsWith("WEBVTT") || lines[i].startsWith("NOTE") || lines[i].trim() === "")) {
    i++
  }
  while (i < lines.length) {
    // Skip index number (SRT) or cue id
    const line = lines[i].trim()
    if (/^\d+$/.test(line)) {
      i++
    }
    // Timestamp line: 00:00:01,000 --> 00:00:03,000
    if (i < lines.length && lines[i].includes("-->")) {
      const tsMatch = lines[i].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/)
      if (tsMatch) {
        const start = parseTimestamp(tsMatch[1])
        const end = parseTimestamp(tsMatch[2])
        i++
        const textLines: string[] = []
        while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes("-->")) {
          // strip VTT cue settings like <c> tags / position attrs
          const t = lines[i].replace(/<[^>]+>/g, "").trim()
          if (t) textLines.push(t)
          i++
        }
        const text = textLines.join(" ").replace(/\s+/g, " ").trim()
        if (text) out.push({ start, end, text })
      } else {
        i++
      }
    } else {
      i++
    }
  }
  return out
}

// --- yt-dlp runner ---

function runYtDlp(args: string[]): Effect.Effect<{ stdout: string; stderr: string; code: number }> {
  return Effect.tryPromise({
    try: () =>
      new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
        const proc = spawn("yt-dlp", args, { windowsHide: true })
        const stdoutChunks: Buffer[] = []
        const stderrChunks: Buffer[] = []
        proc.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c))
        proc.stderr?.on("data", (c: Buffer) => stderrChunks.push(c))
        proc.on("close", (code) => {
          resolve({ stdout: Buffer.concat(stdoutChunks).toString("utf-8"), stderr: Buffer.concat(stderrChunks).toString("utf-8"), code: code ?? -1 })
        })
        proc.on("error", (err) => reject(new Error(`Failed to launch yt-dlp: ${err.message}. Is yt-dlp installed and in PATH?`)))
      }),
    catch: (err) => err instanceof Error ? err : new Error(String(err)),
  })
}

// --- Tool definition ---

export const FetchTranscriptTool = Tool.define(
  "fetch_transcript",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "fetch_transcript",
            patterns: [params.url],
            always: ["*"],
            metadata: { url: params.url },
          })

          const url = params.url
          const platform = detectVideoPlatform(url)
          const langs = params.languages ?? "zh,en"

          if (platform === "unknown") {
            return {
              title: `Transcript for ${url}`,
              output: "Unsupported video platform. Supported: YouTube, Bilibili. For other platforms, use audio transcription.",
              metadata: {
                ok: false,
                platform,
                error: "Unsupported video platform.",
                next_action: "unsupported",
              } as const,
            }
          }

          // Use a temp dir for subtitle files
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-transcript-"))
          try {
            // 1. Fetch metadata (title/uploader/duration) as JSON
            const metaResult = yield* runYtDlp([
              "--skip-download",
              "--print", "%(title)s||%(uploader)s||%(duration)s",
              "--no-playlist",
              url,
            ]).pipe(Effect.catchAll((e) => Effect.succeed({ stdout: "", stderr: e.message, code: -1 })))

            let title: string | undefined
            let uploader: string | undefined
            let duration: number | undefined
            if (metaResult.code === 0 && metaResult.stdout.trim()) {
              const parts = metaResult.stdout.trim().split("||")
              title = parts[0] || undefined
              uploader = parts[1] || undefined
              duration = parts[2] ? Number(parts[2]) : undefined
            }

            // 2. Download subtitles: prefer manual subs, fall back to auto-subs
            //    --write-sub tries manual, --write-auto-sub tries auto-generated
            //    --sub-lang picks from preferred languages
            //    --skip-download: don't download the video
            const subResult = yield* runYtDlp([
              "--skip-download",
              "--write-sub",
              "--write-auto-sub",
              "--sub-lang", langs,
              "--sub-format", "srt/vtt/best",
              "--convert-subs", "srt",
              "-o", path.join(tmpDir, "sub.%(ext)s"),
              "--no-playlist",
              url,
            ])

            // Find the downloaded subtitle file
            const subFiles = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).filter((f) => /\.(srt|vtt)$/i.test(f)) : []
            if (subResult.code !== 0 && subFiles.length === 0) {
              const stderrHint = subResult.stderr.slice(0, 300)
              return {
                title: `Transcript for ${url}`,
                output: `No subtitles found for this video. yt-dlp: ${stderrHint || "no subtitle tracks available"}. Use audio transcription (ffmpeg + doubao ASR) instead.`,
                metadata: {
                  ok: false,
                  platform,
                  metadata: { title, uploader, duration },
                  subtitle_source: "none",
                  error: "No subtitles found.",
                  next_action: "need_audio_transcription",
                } as const,
              }
            }

            if (subFiles.length === 0) {
              return {
                title: `Transcript for ${url}`,
                output: "yt-dlp reported success but no subtitle file was written. Use audio transcription instead.",
                metadata: {
                  ok: false,
                  platform,
                  metadata: { title, uploader, duration },
                  subtitle_source: "none",
                  error: "No subtitle file written.",
                  next_action: "need_audio_transcription",
                } as const,
              }
            }

            // Read & parse the subtitle file (prefer the first match)
            const subFile = subFiles[0]!
            const subPath = path.join(tmpDir, subFile)
            const subContent = fs.readFileSync(subPath, "utf-8")
            const transcript = parseSubtitle(subContent)
            const isAuto = /auto|\.auto\./i.test(subFile) || subContent.startsWith("WEBVTT")

            if (transcript.length === 0) {
              return {
                title: `Transcript for ${url}`,
                output: `Subtitle file downloaded but could not be parsed (${subFile}). Use audio transcription instead.`,
                metadata: {
                  ok: false,
                  platform,
                  metadata: { title, uploader, duration },
                  subtitle_source: isAuto ? "auto" : "manual",
                  error: "Subtitle parse failed.",
                  next_action: "need_audio_transcription",
                } as const,
              }
            }

            const transcriptText = transcript
              .map((line) => `[${line.start.toFixed(1)}s]${line.end ? `-${line.end.toFixed(1)}s` : ""} ${line.text}`)
              .join("\n")

            return {
              title: `Transcript for ${url}`,
              output: `Transcript (${transcript.length} lines, ${isAuto ? "auto-generated" : "manual"}):\n${transcriptText}`,
              metadata: {
                ok: true,
                platform,
                transcript,
                transcript_text: transcript.map((l) => l.text).join(" "),
                metadata: { title, uploader, duration },
                subtitle_source: isAuto ? "auto" : "manual",
                next_action: "summarize",
              } as const,
            }
          } finally {
            // Clean up temp dir
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best effort */ }
          }
        }).pipe(Effect.orDie),
    }
  }),
)
