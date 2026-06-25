import { z } from "zod";
import {
  SaveMarkdownNoteInputSchema,
  SaveMarkdownNoteOutputSchema,
  SearchVaultInputSchema,
  SearchVaultResultSchema,
  VaultContentTypeSchema,
  VaultIndexSchema
} from "@ska/schemas";

export const NoteFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  source_url: z.string().url(),
  source_platform: z.string(),
  content_type: VaultContentTypeSchema,
  created_at: z.string(),
  captured_at: z.string(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  status: z.literal("processed"),
  assets: z.array(z.string()),
  related_notes: z.array(z.string())
});

export {
  SaveMarkdownNoteInputSchema,
  SaveMarkdownNoteOutputSchema,
  SearchVaultInputSchema,
  SearchVaultResultSchema,
  VaultIndexSchema
};
