import matter from "gray-matter";

import { NoteFrontmatterSchema } from "./note-schema";

function yamlString(value: string) {
  return JSON.stringify(value);
}

function yamlArray(values: string[]) {
  if (values.length === 0) {
    return " []";
  }

  return `\n${values.map((value) => `  - ${yamlString(value)}`).join("\n")}`;
}

export function buildFrontmatter(markdownBody: string, frontmatterInput: unknown) {
  const frontmatter = NoteFrontmatterSchema.parse(frontmatterInput);

  const frontmatterBlock = [
    "---",
    `id: ${yamlString(frontmatter.id)}`,
    `title: ${yamlString(frontmatter.title)}`,
    `source_url: ${yamlString(frontmatter.source_url)}`,
    `source_platform: ${yamlString(frontmatter.source_platform)}`,
    `content_type: ${yamlString(frontmatter.content_type)}`,
    `created_at: ${yamlString(frontmatter.created_at)}`,
    `captured_at: ${yamlString(frontmatter.captured_at)}`,
    `tags:${yamlArray(frontmatter.tags)}`,
    `keywords:${yamlArray(frontmatter.keywords)}`,
    `status: ${yamlString(frontmatter.status)}`,
    `assets:${yamlArray(frontmatter.assets)}`,
    `related_notes:${yamlArray(frontmatter.related_notes)}`,
    "---"
  ].join("\n");

  return `${frontmatterBlock}\n\n${markdownBody.trim()}\n`;
}

export function parseMarkdownNote(markdown: string) {
  const parsed = matter(markdown);
  return {
    data: NoteFrontmatterSchema.parse(parsed.data),
    content: parsed.content.trim()
  };
}
