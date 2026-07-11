import { spawn } from "child_process"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./ffmpeg_extract_audio.txt"
import path from "path"
import fs from "fs"
import os from "os"

// --- Input / Output schemas ---

export const Parameters = Schema.Struct({
  input_path: Schema.String,
  format: Schema.Literals(["mp3", "wav", "ogg"])
    .annotate({ description: "Output audio format. Defaults to mp3.", default: "mp3" })
    .pipe(Schema.withDecodingDefault(Effect.succeed("mp3" as const))),
})

const AudioMetadata = Schema.Struct({
  duration: Schema.Number,
  sample_rate: Schema.Number,
  channels: Schema.Number,
})

const Output = Schema.Struct({
  ok: Schema.Boolean,
  output_path: Schema.String,
  format: Schema.Literal("mp3", "wav", "ogg"),
  metadata: AudioMetadata,
  error: Schema.optional(Schema.String),
})

// --- ffprobe helper: probe a media file for metadata ---

function ffprobe(inputPath: string): Effect.Effect<{ duration: number; sample_rate: number; channels: number }> {
  return Effect.async<{ duration: number; sample_rate: number; channels: number }>((resume) => {
    const chunks: Buffer[] = []
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ])

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on("data", () => { /* swallow */ })

    proc.on("close", (code) => {
      if (code !== 0) {
        resume(Effect.fail(new Error(`ffprobe exited with code ${code}. Is ffmpeg installed and in PATH?`)))
        return
      }
      try {
        const raw = JSON.parse(Buffer.concat(chunks).toString("utf-8"))
        const audioStream = (raw.streams ?? []).find((s: any) => s.codec_type === "audio")
        const format = raw.format ?? {}
        resume(Effect.succeed({
          duration: Number(format.duration ?? audioStream?.duration ?? 0),
          sample_rate: Number(audioStream?.sample_rate ?? 0),
          channels: Number(audioStream?.channels ?? 0),
        }))
      } catch (err: any) {
        resume(Effect.fail(new Error(`Failed to parse ffprobe output: ${err.message}`)))
      }
    })

    proc.on("error", (err) => {
      resume(Effect.fail(new Error(`Failed to launch ffprobe: ${err.message}. Is ffmpeg installed and in PATH?`)))
    })
  })
}

/**
 * Wait for a spawned process to complete, capturing stdout and stderr buffers.
 * Uses Effect.async to bridge the child_process callback world into the Effect
 * eco-system.
 */
function waitProcess(
  proc: ReturnType<typeof spawn>,
): Effect.Effect<{ stdout: string; stderr: string; code: number }> {
  return Effect.async<{ stdout: string; stderr: string; code: number }>((resume) => {
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on("close", (code) => {
      resume(
        Effect.succeed({
          stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
          stderr: Buffer.concat(stderrChunks).toString("utf-8"),
          code: code ?? -1,
        }),
      )
    })

    proc.on("error", (err) => {
      resume(Effect.fail(new Error(`Process spawn error: ${err.message}`)))
    })
  })
}

// --- Tool definition ---

export const FfmpegExtractAudioTool = Tool.define(
  "ffmpeg_extract_audio",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          // High-risk tool: require explicit user permission
          yield* ctx.ask({
            permission: "ffmpeg_extract_audio",
            patterns: [params.input_path],
            always: ["*"],
            metadata: {
              input_path: params.input_path,
              format: params.format,
            },
          })

          const inputPath = path.resolve(params.input_path)

          // Verify input file exists
          if (!fs.existsSync(inputPath)) {
            return {
              title: "Audio extraction failed",
              output: `Input file not found: ${inputPath}`,
              metadata: {
                ok: false,
                output_path: "",
                format: params.format,
                metadata: { duration: 0, sample_rate: 0, channels: 0 },
                error: `Input file not found: ${inputPath}`,
              } as const,
            }
          }

          // Probe input file for metadata first
          const probeResult = yield* ffprobe(inputPath).pipe(
            Effect.catchAll((err) =>
              Effect.succeed({ duration: 0, sample_rate: 0, channels: 0, _error: err.message }),
            ),
          )

          // Create a temp path for the output audio
          const tmpFile = path.join(
            os.tmpdir(),
            `opencode_audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${params.format}`,
          )

          // Build ffmpeg arguments
          const ffmpegArgs: string[] = ["-y", "-i", inputPath, "-vn"]

          switch (params.format) {
            case "mp3":
              ffmpegArgs.push("-codec:a", "libmp3lame", "-qscale:a", "2")
              break
            case "wav":
              ffmpegArgs.push("-codec:a", "pcm_s16le")
              break
            case "ogg":
              ffmpegArgs.push("-codec:a", "libvorbis", "-qscale:a", "5")
              break
          }
          ffmpegArgs.push(tmpFile)

          // Run ffmpeg
          const proc = spawn("ffmpeg", ffmpegArgs)
          const result = yield* waitProcess(proc)

          if (result.code !== 0) {
            // Clean up on failure
            if (fs.existsSync(tmpFile)) {
              try { fs.unlinkSync(tmpFile) } catch { /* best effort */ }
            }
            const errorDetail = result.stderr.slice(0, 500) || result.stdout.slice(0, 500) || "unknown error"
            return {
              title: "Audio extraction failed",
              output: `ffmpeg exited with code ${result.code}: ${errorDetail}`,
              metadata: {
                ok: false,
                output_path: "",
                format: params.format,
                metadata: { duration: 0, sample_rate: 0, channels: 0 },
                error: `ffmpeg exited with code ${result.code}: ${errorDetail}`,
              } as const,
            }
          }

          // Check output exists
          if (!fs.existsSync(tmpFile)) {
            return {
              title: "Audio extraction failed",
              output: "ffmpeg completed but output file was not created.",
              metadata: {
                ok: false,
                output_path: "",
                format: params.format,
                metadata: { duration: 0, sample_rate: 0, channels: 0 },
                error: "ffmpeg completed but output file was not created.",
              } as const,
            }
          }

          // Read and immediately clean up the temp file — storage discipline
          const fileBuffer = fs.readFileSync(tmpFile)
          const fileSize = fileBuffer.length
          try { fs.unlinkSync(tmpFile) } catch { /* best effort cleanup */ }

          // Probe the temp file to get actual audio metadata (if ffprobe failed earlier)
          let finalMeta = probeResult as any
          if (finalMeta._error) {
            finalMeta = { duration: 0, sample_rate: 0, channels: 0 }
          }

          const duration = finalMeta.duration ?? 0
          const sampleRate = finalMeta.sample_rate ?? 0
          const channels = finalMeta.channels ?? 0

          return {
            title: `Extracted audio (${params.format}, ${(fileSize / 1024 / 1024).toFixed(1)}MB)`,
            output: `Audio extracted successfully.
  Format: ${params.format}
  Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB
  Duration: ${duration.toFixed(1)}s
  Sample rate: ${sampleRate} Hz
  Channels: ${channels}

  The output file was read into memory and the temporary file has been cleaned up.
  To use this audio data, pass the buffer to a transcription tool.`,
            metadata: {
              ok: true,
              output_path: tmpFile,
              format: params.format,
              metadata: { duration, sample_rate: sampleRate, channels },
            } as const,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
