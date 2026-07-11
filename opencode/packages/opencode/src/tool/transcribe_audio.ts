import { spawn } from "child_process"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./transcribe_audio.txt"
import path from "path"
import fs from "fs"
import os from "os"

// [BROWSER-CODE-CHANGE] transcribe audio via Volcengine ASR WebSocket.
// Uses volc_asr.py (checked into repo root) for the actual WS call.
// Pipelines: ffprobe duration → ffmpeg downmix to 16kHz mono wav → python volc_asr.py → text.
// VOLC_ASR_API_KEY env var required (new console API Key, not Access Token).
// Default resource: volc.seedasr.sauc.duration.

export const Parameters = Schema.Struct({
  input_path: Schema.String.annotate({
    description: "Path to a local audio or video file. Video is auto-extracted to audio.",
  }),
})

export const TranscribeAudioTool = Tool.define(
  "transcribe_audio",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "transcribe_audio",
            patterns: [params.input_path],
            always: ["*"],
            metadata: { input_path: params.input_path },
          })

          const inputPath = path.resolve(params.input_path)
          if (!fs.existsSync(inputPath)) {
            return { title: "Failed", output: `Not found: ${inputPath}`, metadata: { ok: false, error: "File not found" } }
          }

          const key = process.env.VOLC_ASR_API_KEY || process.env.VOLC_ASR_KEY || ""
          if (!key) {
            return { title: "Failed", output: "VOLC_ASR_API_KEY (or VOLC_ASR_KEY) not set", metadata: { ok: false, error: "VOLC_ASR_API_KEY not set" } }
          }

          // Find volc_asr.py — checked into the repo root D:\ClaudeData\browser agent\
          const repoRoot = path.resolve(__dirname, "../../../../")
          const scriptPath = path.join(repoRoot, "volc_asr.py")

          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-asr-"))
          try {
            // ffprobe duration
            const duration = yield* Effect.tryPromise<number>({
              try: () => new Promise((resolve) => {
                const p = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", inputPath], { windowsHide: true })
                const c: Buffer[] = []; p.stdout.on("data", (b: Buffer) => c.push(b))
                p.on("close", () => { try { const d = JSON.parse(Buffer.concat(c).toString()); resolve(Number(d?.format?.duration ?? 0)) } catch { resolve(0) } })
                p.on("error", () => resolve(0))
              }),
              catch: () => 0,
            })

            // Downmix to 16kHz mono wav
            const wavPath = path.join(tmpDir, "audio.wav")
            yield* Effect.tryPromise({
              try: () => new Promise<void>((resolve, reject) => {
                const p = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wavPath], { windowsHide: true })
                const e: Buffer[] = []; p.stderr?.on("data", (b: Buffer) => e.push(b))
                p.on("close", (code) => code === 0 ? resolve() : reject(new Error(Buffer.concat(e).toString().slice(0, 200))))
                p.on("error", (e) => reject(e))
              }),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            })

            // Call python ASR script
            const text = yield* Effect.tryPromise<string>({
              try: () => new Promise((resolve, reject) => {
                const env: Record<string, string> = { VOLC_ASR_API_KEY: key }
                // also preserve system env
                for (const k of ["PATH", "TMP", "TEMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA"])
                  if (process.env[k]) env[k] = process.env[k]!
                const p = spawn("python", [scriptPath, wavPath], { windowsHide: true, env })
                const out: Buffer[] = []; const err: Buffer[] = []
                p.stdout.on("data", (b: Buffer) => out.push(b))
                p.stderr?.on("data", (b: Buffer) => err.push(b))
                p.on("close", (code) => {
                  const o = Buffer.concat(out).toString().trim()
                  if (code === 0 && o) resolve(o)
                  else reject(new Error(o || Buffer.concat(err).toString().slice(0, 300)))
                })
                p.on("error", (e) => reject(e))
              }),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            })

            return {
              title: `Transcription (${duration.toFixed(0)}s)`,
              output: text,
              metadata: { ok: true, text, duration, next_action: "summarize" as const },
            }
          } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { }
          }
        }).pipe(Effect.orDie),
    }
  }),
)
