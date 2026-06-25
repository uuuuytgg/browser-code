import type { TranscriptLine } from "@ska/schemas";

export function normalizeTranscript(lines: TranscriptLine[]) {
  return lines
    .map((line) => ({
      start: line.start,
      end: line.end,
      text: line.text.replace(/\s+/g, " ").trim()
    }))
    .filter((line) => line.text.length > 0)
    .sort((left, right) => left.start - right.start);
}
