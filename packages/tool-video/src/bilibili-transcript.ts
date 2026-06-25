import { JSDOM } from "jsdom";
import type { TranscriptLine } from "@ska/schemas";

function parseTranscriptJson(document: Document): TranscriptLine[] {
  for (const script of Array.from(document.querySelectorAll("script"))) {
    const text = script.textContent?.trim();
    if (!text || !text.includes("subtitle") || !text.includes("transcript")) {
      continue;
    }

    const match = text.match(/"transcript"\s*:\s*(\[[\s\S]*?\])/);
    if (!match) {
      continue;
    }

    try {
      const parsed = JSON.parse(match[1]) as Array<{ from?: number; to?: number; text?: string; start?: number; end?: number }>;
      return parsed
        .filter((line) => typeof line.text === "string")
        .map((line) => ({
          start: line.start ?? line.from ?? 0,
          end: line.end ?? line.to,
          text: line.text ?? ""
        }));
    } catch {
      continue;
    }
  }

  return [];
}

export function fetchBilibiliTranscript(html: string) {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const transcriptFromDom = Array.from(document.querySelectorAll("[data-subtitle-text]"))
    .map((node) => ({
      start: Number(node.getAttribute("data-start") ?? "0"),
      end: Number(node.getAttribute("data-end") ?? "0") || undefined,
      text: node.getAttribute("data-subtitle-text") ?? node.textContent ?? ""
    }))
    .filter((line) => line.text.trim().length > 0);

  const transcript = transcriptFromDom.length > 0 ? transcriptFromDom : parseTranscriptJson(document);

  return {
    transcript,
    metadata: {
      title: document.querySelector("meta[property='og:title']")?.getAttribute("content")
        ?? document.title
        ?? undefined,
      uploader: document.querySelector("meta[name='author']")?.getAttribute("content") ?? undefined
    }
  };
}
