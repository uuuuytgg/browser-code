import {
  FetchTranscriptInputSchema,
  FetchTranscriptOutputSchema,
  type FetchTranscriptInput,
  type FetchTranscriptOutput
} from "@ska/schemas";

import { detectVideoPlatform } from "./detect-video-platform";
import { normalizeTranscript } from "./normalize-transcript";
import { fetchYouTubeTranscript } from "./youtube-transcript";
import { fetchBilibiliTranscript } from "./bilibili-transcript";

export async function fetchTranscript(input: FetchTranscriptInput): Promise<FetchTranscriptOutput> {
  const parsed = FetchTranscriptInputSchema.parse(input);
  const platform = parsed.platform ?? detectVideoPlatform(parsed.url);
  const html = parsed.html ?? "";

  if (!html) {
    return FetchTranscriptOutputSchema.parse({
      ok: false,
      platform,
      error: "HTML is required for local transcript extraction.",
      next_action: "need_audio_transcription"
    });
  }

  const extracted = platform === "youtube"
    ? fetchYouTubeTranscript(html)
    : platform === "bilibili"
      ? fetchBilibiliTranscript(html)
      : { transcript: [], metadata: { title: undefined, uploader: undefined } };

  const transcript = normalizeTranscript(extracted.transcript);

  if (transcript.length === 0) {
    return FetchTranscriptOutputSchema.parse({
      ok: false,
      platform,
      metadata: extracted.metadata,
      error: platform === "unknown" ? "Unsupported video platform." : "No transcript found in the captured page.",
      next_action: platform === "unknown" ? "unsupported" : "need_audio_transcription"
    });
  }

  return FetchTranscriptOutputSchema.parse({
    ok: true,
    platform,
    transcript,
    metadata: extracted.metadata,
    next_action: "summarize"
  });
}
