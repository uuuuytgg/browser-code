import { z } from "zod";
import {
  WebToMarkdownInputSchema,
  WebToMarkdownOutputSchema
} from "@ska/schemas";

import type { ToolImplementation } from "./types";

const saveMarkdownNoteInputSchema = z.object({
  markdown: z.string(),
  metadata: z.object({
    title: z.string(),
    source_url: z.string().url(),
    tags: z.array(z.string()).optional()
  }),
  content_type: z.enum(["article", "video", "document", "snippet", "resource"]),
  source_url: z.string().url()
});

const saveMarkdownNoteOutputSchema = z.object({
  note_id: z.string(),
  file_path: z.string(),
  deduped: z.boolean(),
  index_updated: z.boolean()
});

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function createStage1MockTools(): ToolImplementation[] {
  return [
    {
      spec: {
        name: "web_to_markdown",
        description: "Mock HTML to Markdown conversion for Stage 1 runtime tests.",
        risk: "low",
        agent_modes: ["curator"],
        input_schema: WebToMarkdownInputSchema,
        output_schema: WebToMarkdownOutputSchema
      },
      async execute(input) {
        const parsed = WebToMarkdownInputSchema.parse(input);
        return {
          markdown: `# ${parsed.title}\n\n${parsed.html ? stripHtml(parsed.html) : ""}`.trim(),
          metadata: {
            title: parsed.title ?? parsed.url,
            source_url: parsed.url
          },
          resources: [],
          quality: {
            word_count: parsed.html ? stripHtml(parsed.html).split(/\s+/).filter(Boolean).length : 0,
            extraction_method: "full",
            is_probably_article: false
          }
        };
      }
    },
    {
      spec: {
        name: "save_markdown_note",
        description: "Mock note save for Stage 1 runtime tests.",
        risk: "medium",
        agent_modes: ["curator", "media", "resource", "librarian"],
        input_schema: saveMarkdownNoteInputSchema,
        output_schema: saveMarkdownNoteOutputSchema
      },
      async execute(input) {
        const parsed = saveMarkdownNoteInputSchema.parse(input);
        const slug = parsed.metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return {
          note_id: `20260625_${slug || "note"}`,
          file_path: `vault/articles/${slug || "note"}.md`,
          deduped: false,
          index_updated: false
        };
      }
    }
  ];
}
