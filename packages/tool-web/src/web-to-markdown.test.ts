import { describe, expect, it } from "vitest";

import { webToMarkdown } from "./web-to-markdown";

describe("webToMarkdown", () => {
  it("extracts article content with readability and returns markdown metadata", async () => {
    const result = await webToMarkdown({
      url: "https://example.com/posts/readability",
      title: "Ignored Title",
      html: `<!doctype html>
        <html lang="en">
          <head>
            <title>Readable Article</title>
            <meta name="description" content="Short summary" />
          </head>
          <body>
            <header><nav><a href="/home">Home</a></nav></header>
            <main>
              <article>
                <h1>Readable Article</h1>
                <p>This is a focused article body with enough content to parse cleanly.</p>
                <p>It also contains a <a href="/reference">reference link</a>.</p>
              </article>
            </main>
          </body>
        </html>`
    });

    expect(result.metadata.title).toBe("Readable Article");
    expect(result.markdown).toContain("# Readable Article");
    expect(result.markdown).toContain("focused article body");
    expect(result.resources.some((resource) => resource.url === "https://example.com/reference")).toBe(true);
    expect(result.quality.extraction_method).toBe("readability");
  });

  it("prefers selected text mode when explicit selection is provided", async () => {
    const result = await webToMarkdown({
      url: "https://example.com/posts/selection",
      title: "Selection Title",
      html: "<html><body><article><p>Full article text that should not win.</p></article></body></html>",
      selected_text: "Only this selected text should be converted.",
      mode: "selection"
    });

    expect(result.markdown).toContain("Only this selected text should be converted.");
    expect(result.quality.extraction_method).toBe("selection");
  });

  it("falls back to body extraction when readability cannot produce an article", async () => {
    const result = await webToMarkdown({
      url: "https://example.com/fallback",
      title: "Fallback Example",
      html: `<!doctype html>
        <html>
          <body>
            <div>
              <p>Fallback body text.</p>
              <a href="/document.pdf">PDF</a>
            </div>
          </body>
        </html>`,
      mode: "full"
    });

    expect(result.markdown).toContain("Fallback body text.");
    expect(result.quality.extraction_method).toBe("full");
    expect(result.resources.some((resource) => resource.type === "document")).toBe(true);
  });
});
