import {
  buildIndexToolSpec,
  runBuildIndex,
  runSaveMarkdownNote,
  runSearchVault,
  saveMarkdownNoteToolSpec,
  searchVaultToolSpec
} from "@ska/tool-vault";
import {
  ffmpegExtractAudioToolSpec,
  runFetchTranscript,
  runFfmpegExtractAudio,
  fetchTranscriptToolSpec
} from "@ska/tool-video";
import { runWebToMarkdown, webToMarkdownToolSpec } from "@ska/tool-web";

import { ensureAllowedRead, ensureAllowedWrite } from "./path-security";
import type { ToolImplementation } from "./types";

export function createRegisteredTools(): ToolImplementation[] {
  return [
    {
      spec: webToMarkdownToolSpec,
      async execute(input) {
        return runWebToMarkdown(input as Parameters<typeof runWebToMarkdown>[0]);
      }
    },
    {
      spec: fetchTranscriptToolSpec,
      async execute(input) {
        return runFetchTranscript(input as Parameters<typeof runFetchTranscript>[0]);
      }
    },
    {
      spec: ffmpegExtractAudioToolSpec,
      async execute(input, context) {
        ensureAllowedRead(
          (input as { input_path: string }).input_path,
          [...context.allowed_read_roots, context.temp_dir]
        );
        ensureAllowedWrite(context.temp_dir, [...context.allowed_write_roots, context.temp_dir]);
        return runFfmpegExtractAudio(input as Parameters<typeof runFfmpegExtractAudio>[0]);
      }
    },
    {
      spec: saveMarkdownNoteToolSpec,
      async execute(input, context) {
        ensureAllowedWrite(context.vault_dir, [...context.allowed_write_roots, context.vault_dir]);
        return runSaveMarkdownNote(input as Parameters<typeof runSaveMarkdownNote>[0], {
          vaultDir: context.vault_dir
        });
      }
    },
    {
      spec: buildIndexToolSpec,
      async execute(_input, context) {
        ensureAllowedWrite(context.vault_dir, [...context.allowed_write_roots, context.vault_dir]);
        return runBuildIndex({
          vaultDir: context.vault_dir
        });
      }
    },
    {
      spec: searchVaultToolSpec,
      async execute(input, context) {
        ensureAllowedRead(context.vault_dir, [...context.allowed_read_roots, context.vault_dir]);
        return runSearchVault({
          ...(input as Parameters<typeof runSearchVault>[0]),
          vaultDir: context.vault_dir
        });
      }
    }
  ];
}
