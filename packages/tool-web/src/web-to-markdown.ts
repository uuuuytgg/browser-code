import { JSDOM } from "jsdom";
import type { WebToMarkdownInput, WebToMarkdownOutput } from "@ska/schemas";

import { cleanMarkdown } from "./clean-markdown";
import { extractMetadata } from "./metadata";
import { parseReadableArticle } from "./readability";
import { extractResources } from "./resource-extract";
import { createTurndownService } from "./turndown-rules";

function countWords(markdown: string) {
  const matches = markdown.match(/\S+/g);
  return matches?.length ?? 0;
}

function buildSelectionMarkdown(title: string, selectedText: string) {
  return cleanMarkdown(`# ${title}\n\n${selectedText}`);
}

function buildFullBodyHtml(document: Document) {
  return document.body?.innerHTML || document.documentElement.innerHTML || "";
}

export async function webToMarkdown(input: WebToMarkdownInput): Promise<WebToMarkdownOutput> {
  const mode = input.mode ?? "readability";
  const dom = new JSDOM(input.html, {
    url: input.url,
    contentType: "text/html"
  });
  const { document } = dom.window;

  const metadata = extractMetadata(document, input.title, input.url);
  const resources = extractResources(document, input.url);
  const turndownService = createTurndownService();

  let markdown = "";
  let extractionMethod: WebToMarkdownOutput["quality"]["extraction_method"] = "readability";
  let isProbablyArticle = false;

  if (mode === "selection" && input.selected_text?.trim()) {
    markdown = buildSelectionMarkdown(metadata.title, input.selected_text.trim());
    extractionMethod = "selection";
  } else if (mode === "full") {
    markdown = cleanMarkdown(turndownService.turndown(buildFullBodyHtml(document)));
    extractionMethod = "full";
  } else {
    const { article, isProbablyArticle: readerable } = parseReadableArticle(document);
    isProbablyArticle = readerable;

    if (article?.content) {
      markdown = cleanMarkdown(turndownService.turndown(article.content));
      metadata.title = article.title || metadata.title;
      metadata.byline = article.byline || metadata.byline;
      metadata.excerpt = article.excerpt || metadata.excerpt;
      metadata.site_name = article.siteName || metadata.site_name;
      metadata.language = article.lang || metadata.language;
      extractionMethod = "readability";
    } else if (input.selected_text?.trim()) {
      markdown = buildSelectionMarkdown(metadata.title, input.selected_text.trim());
      extractionMethod = "selection";
    } else {
      markdown = cleanMarkdown(turndownService.turndown(buildFullBodyHtml(document)));
      extractionMethod = "full";
    }
  }

  if (!markdown.startsWith("# ")) {
    markdown = cleanMarkdown(`# ${metadata.title}\n\n${markdown}`);
  }

  return {
    markdown,
    metadata,
    resources,
    quality: {
      word_count: countWords(markdown),
      extraction_method: extractionMethod,
      is_probably_article: isProbablyArticle || extractionMethod === "selection"
    }
  };
}
