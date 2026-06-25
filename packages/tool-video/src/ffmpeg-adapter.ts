import path from "node:path";

import {
  FfmpegExtractAudioInputSchema,
  FfmpegExtractAudioOutputSchema,
  type FfmpegExtractAudioInput,
  type FfmpegExtractAudioOutput
} from "@ska/schemas";

export async function ffmpegExtractAudio(
  input: FfmpegExtractAudioInput
): Promise<FfmpegExtractAudioOutput> {
  const parsed = FfmpegExtractAudioInputSchema.parse(input);
  const outputPath = `${parsed.input_path}.${parsed.output_format}`;

  return FfmpegExtractAudioOutputSchema.parse({
    audio_path: path.normalize(outputPath)
  });
}
