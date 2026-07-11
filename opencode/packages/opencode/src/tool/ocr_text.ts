import { spawn } from "child_process"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./ocr_text.txt"
import path from "path"
import fs from "fs"

// [BROWSER-CODE-CHANGE] OCR text from images using PaddleOCR.
// Runs a small python helper that calls PaddleOCR and returns JSON with text, confidence, and bbox.

export const Parameters = Schema.Struct({
  image_path: Schema.String.annotate({
    description: "Path to a local image file (PNG, JPG, etc.)",
  }),
})

const OcrLine = Schema.Struct({
  text: Schema.String,
  confidence: Schema.Number,
  bbox: Schema.Array(Schema.Array(Schema.Number)),
})

const Output = Schema.Struct({
  ok: Schema.Boolean,
  text: Schema.String,
  lines: Schema.Array(OcrLine),
  error: Schema.optional(Schema.String),
})

export const OcrTextTool = Tool.define(
  "ocr_text",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "ocr_text",
            patterns: [params.image_path],
            always: ["*"],
            metadata: { image_path: params.image_path },
          })

          const inputPath = path.resolve(params.image_path)
          if (!fs.existsSync(inputPath)) {
            return { title: "OCR Failed", output: `Not found: ${inputPath}`, metadata: { ok: false, error: "File not found" } }
          }

          // Build a tiny inline python script so we don't need an extra file on disk
          const pythonScript = `
import json, sys, os
os.environ["PADDLE_PYTHON"] = "1"
from paddleocr import PaddleOCR
ocr = PaddleOCR(use_textline_orientation=True, lang="ch")
result = ocr.ocr(sys.argv[1], cls=True)
lines = []
all_text = []
if result and result[0]:
    for line in result[0]:
        bbox, (text, conf) = line
        lines.append({"text": text, "confidence": round(conf, 3), "bbox": bbox})
        all_text.append(text)
print(json.dumps({"ok": True, "text": "\\n".join(all_text), "lines": lines}, ensure_ascii=False))
`.trim()

          const text = yield* Effect.tryPromise<string>({
            try: () =>
              new Promise<string>((resolve, reject) => {
                const p = spawn("python", ["-c", pythonScript, inputPath], { windowsHide: true })
                const out: Buffer[] = []
                const err: Buffer[] = []
                p.stdout.on("data", (b: Buffer) => out.push(b))
                p.stderr?.on("data", (b: Buffer) => err.push(b))
                p.on("close", (code) => {
                  const o = Buffer.concat(out).toString().trim()
                  if (code === 0 && o) {
                    resolve(o)
                  } else {
                    reject(new Error(o || Buffer.concat(err).toString().slice(0, 300)))
                  }
                })
                p.on("error", (e) => reject(e))
              }),
            catch: (e) => (e instanceof Error ? e : new Error(String(e))),
          })

          const data = JSON.parse(text)
          return {
            title: `OCR (${data.lines.length} lines)`,
            output: data.text,
            metadata: {
              ok: true,
              lines: data.lines,
              next_action: "use_text" as const,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
