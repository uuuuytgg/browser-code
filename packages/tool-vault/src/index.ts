import type {
  AgentMode,
  ReadNoteInput,
  ReadNoteOutput,
  SaveMarkdownNoteInput,
  SaveMarkdownNoteOutput,
  SearchVaultInput,
  SearchVaultResult,
  ToolRisk,
  VaultIndex
} from "@ska/schemas";
import {
  ReadNoteInputSchema,
  ReadNoteOutputSchema,
  SaveMarkdownNoteInputSchema,
  SaveMarkdownNoteOutputSchema,
  SearchVaultInputSchema,
  SearchVaultResultSchema,
  VaultIndexSchema
} from "@ska/schemas";

import { buildIndex, readIndexFile } from "./build-index";
import { readNote } from "./read-note";
import { saveMarkdownNote } from "./save-note";
import { searchVault } from "./search-vault";

export const toolVaultPackageInfo = {
  name: "@ska/tool-vault",
  stage: 11,
  placeholderTools: [
    {
      name: "save_markdown_note",
      risk: "medium" as ToolRisk,
      agent_modes: ["curator", "media", "resource", "librarian"] as AgentMode[],
      implemented: true
    },
    {
      name: "build_index",
      risk: "medium" as ToolRisk,
      agent_modes: ["curator", "media", "librarian"] as AgentMode[],
      implemented: true
    },
    {
      name: "search_vault",
      risk: "low" as ToolRisk,
      agent_modes: ["reader", "librarian"] as AgentMode[],
      implemented: true
    },
    {
      name: "read_note",
      risk: "low" as ToolRisk,
      agent_modes: ["reader", "librarian"] as AgentMode[],
      implemented: true
    }
  ]
} as const;

export const saveMarkdownNoteToolSpec = {
  name: "save_markdown_note",
  description: "Save a Markdown note into the local vault.",
  risk: "medium" as ToolRisk,
  agent_modes: ["curator", "media", "resource", "librarian"] as AgentMode[],
  input_schema: SaveMarkdownNoteInputSchema,
  output_schema: SaveMarkdownNoteOutputSchema
} as const;

export const buildIndexToolSpec = {
  name: "build_index",
  description: "Rebuild the vault index from Markdown files.",
  risk: "medium" as ToolRisk,
  agent_modes: ["curator", "media", "librarian"] as AgentMode[],
  input_schema: SaveMarkdownNoteInputSchema.pick({ source_url: true }).partial(),
  output_schema: VaultIndexSchema
} as const;

export const searchVaultToolSpec = {
  name: "search_vault",
  description: "Search the local vault using title, tags, keywords, and body text.",
  risk: "low" as ToolRisk,
  agent_modes: ["reader", "librarian"] as AgentMode[],
  input_schema: SearchVaultInputSchema.omit({ vaultDir: true }),
  output_schema: SearchVaultResultSchema.array()
} as const;

export const readNoteToolSpec = {
  name: "read_note",
  description: "Read a single vault note by relative path.",
  risk: "low" as ToolRisk,
  agent_modes: ["reader", "librarian"] as AgentMode[],
  input_schema: ReadNoteInputSchema.omit({ vaultDir: true }),
  output_schema: ReadNoteOutputSchema
} as const;

export async function runSaveMarkdownNote(
  input: SaveMarkdownNoteInput,
  options: { vaultDir: string }
): Promise<SaveMarkdownNoteOutput> {
  return saveMarkdownNote(input, options);
}

export async function runBuildIndex(options: { vaultDir: string }): Promise<VaultIndex> {
  return buildIndex(options);
}

export async function runSearchVault(input: SearchVaultInput): Promise<SearchVaultResult[]> {
  return searchVault(input);
}

export async function runReadNote(input: ReadNoteInput): Promise<ReadNoteOutput> {
  const parsed = ReadNoteInputSchema.parse(input);
  const content = await readNote(parsed.vaultDir, parsed.relativePath);
  return ReadNoteOutputSchema.parse({
    path: parsed.relativePath,
    content
  });
}

export { buildIndex, readIndexFile, readNote, saveMarkdownNote, searchVault };
