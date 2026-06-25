import type {
  AgentMode,
  FetchTranscriptInput,
  FetchTranscriptOutput,
  FfmpegExtractAudioInput,
  FfmpegExtractAudioOutput,
  ToolRisk
} from "@ska/schemas";
import {
  FetchTranscriptInputSchema,
  FetchTranscriptOutputSchema,
  FfmpegExtractAudioInputSchema,
  FfmpegExtractAudioOutputSchema
} from "@ska/schemas";

import { detectVideoPlatform } from "./detect-video-platform";
import { ffmpegExtractAudio } from "./ffmpeg-adapter";
import { fetchTranscript } from "./transcript-fetcher";

export const toolVideoPackageInfo = {
  name: "@ska/tool-video",
  stage: 9,
  placeholderTools: [
    {
      name: "fetch_transcript",
      risk: "low" as ToolRisk,
      agent_modes: ["media"] as AgentMode[],
      implemented: true
    },
    {
      name: "ffmpeg_extract_audio",
      risk: "high" as ToolRisk,
      agent_modes: ["media"] as AgentMode[],
      implemented: true
    }
  ]
} as const;

export const fetchTranscriptToolSpec = {
  name: "fetch_transcript",
  description: "Extract public transcript data from the captured video page without downloading media.",
  risk: "low" as ToolRisk,
  agent_modes: ["media"] as AgentMode[],
  input_schema: FetchTranscriptInputSchema,
  output_schema: FetchTranscriptOutputSchema
} as const;

export const ffmpegExtractAudioToolSpec = {
  name: "ffmpeg_extract_audio",
  description: "High-risk local audio extraction placeholder that requires confirmation before execution.",
  risk: "high" as ToolRisk,
  agent_modes: ["media"] as AgentMode[],
  requires_confirmation: true,
  input_schema: FfmpegExtractAudioInputSchema,
  output_schema: FfmpegExtractAudioOutputSchema
} as const;

export async function runFetchTranscript(input: FetchTranscriptInput): Promise<FetchTranscriptOutput> {
  return fetchTranscript(FetchTranscriptInputSchema.parse(input));
}

export async function runFfmpegExtractAudio(
  input: FfmpegExtractAudioInput
): Promise<FfmpegExtractAudioOutput> {
  return ffmpegExtractAudio(FfmpegExtractAudioInputSchema.parse(input));
}

export { detectVideoPlatform, fetchTranscript, ffmpegExtractAudio };
