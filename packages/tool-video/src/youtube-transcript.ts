import { JSDOM } from "jsdom";
import type { TranscriptLine } from "@ska/schemas";

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 10_000 ? numeric / 1000 : numeric;
  }

  return undefined;
}

function parseTranscriptJson(document: Document): TranscriptLine[] {
  for (const script of Array.from(document.querySelectorAll("script[type='application/json'], script[type='application/ld+json'], script"))) {
    const text = script.textContent?.trim();
    if (!text || !text.includes("transcript")) {
      continue;
    }

    const match = text.match(/"transcript"\s*:\s*(\[[\s\S]*?\])/);
    if (!match) {
      continue;
    }

    try {
      const parsed = JSON.parse(match[1]) as Array<{ start?: number; end?: number; text?: string }>;
      return parsed
        .filter((line) => typeof line.text === "string" && typeof line.start === "number")
        .map((line) => ({
          start: line.start ?? 0,
          end: line.end,
          text: line.text ?? ""
        }));
    } catch {
      continue;
    }
  }

  return [];
}

export function fetchYouTubeTranscript(html: string) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const transcriptFromDom = Array.from(document.querySelectorAll("[data-transcript-text]"))
    .map((node) => ({
      start: parseTimestamp(node.getAttribute("data-start") ?? node.getAttribute("data-start-ms")) ?? 0,
      end: parseTimestamp(node.getAttribute("data-end") ?? node.getAttribute("data-end-ms")),
      text: node.getAttribute("data-transcript-text") ?? node.textContent ?? ""
    }))
    .filter((line) => line.text.trim().length > 0);

  const transcript = transcriptFromDom.length > 0 ? transcriptFromDom : parseTranscriptJson(document);

  return {
    transcript,
    metadata: {
      title: document.querySelector("meta[property='og:title']")?.getAttribute("content")
        ?? document.title
        ?? undefined,
      uploader: document.querySelector("meta[name='author']")?.getAttribute("content")
        ?? document.querySelector("link[itemprop='name']")?.getAttribute("content")
        ?? undefined
    }
  };
}
