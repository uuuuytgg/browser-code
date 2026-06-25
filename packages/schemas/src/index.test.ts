import { describe, expect, it } from "vitest";
import {
  CaptureTaskSchema,
  RunAgentTaskResultSchema,
  WebToMarkdownInputSchema,
  WebToMarkdownOutputSchema
} from "./index";

describe("CaptureTaskSchema", () => {
  it("accepts a valid capture task fixture", () => {
    const parsed = CaptureTaskSchema.parse({
      task_id: "task_001",
      task_type: "save_page",
      page: {
        url: "https://example.com/article",
        title: "Example Article",
        platform: "web",
        links: [{ text: "Example", href: "https://example.com" }],
        media: [{ type: "image", src: "https://example.com/cover.png" }],
        meta: {
          author: "Example Author"
        }
      },
      created_at: "2026-06-25T00:00:00+08:00"
    });

    expect(parsed.task_type).toBe("save_page");
    expect(parsed.page.platform).toBe("web");
  });

  it("rejects an unsupported task type", () => {
    expect(() =>
      CaptureTaskSchema.parse({
        task_id: "task_002",
        task_type: "run_shell",
        page: {
          url: "https://example.com",
          title: "Invalid Task"
        },
        created_at: "2026-06-25T00:00:00+08:00"
      })
    ).toThrow();
  });

  it("rejects a task missing required fields", () => {
    expect(() =>
      CaptureTaskSchema.parse({
        task_id: "task_003",
        task_type: "save_page",
        created_at: "2026-06-25T00:00:00+08:00"
      })
    ).toThrow();
  });

  it("accepts the runtime result contract", () => {
    const parsed = RunAgentTaskResultSchema.parse({
      status: "done",
      answer: {
        message: "已保存",
        note_id: "20260625_example"
      }
    });

    expect(parsed.status).toBe("done");
  });

  it("accepts the web_to_markdown contracts", () => {
    const input = WebToMarkdownInputSchema.parse({
      url: "https://example.com/post",
      title: "Example Post",
      html: "<html><body><article>Hello</article></body></html>",
      mode: "readability"
    });

    const output = WebToMarkdownOutputSchema.parse({
      markdown: "# Example Post\n\nHello",
      metadata: {
        title: "Example Post",
        source_url: "https://example.com/post"
      },
      resources: [
        {
          type: "link",
          url: "https://example.com/reference",
          text: "Reference"
        }
      ],
      quality: {
        word_count: 1,
        extraction_method: "readability",
        is_probably_article: true
      }
    });

    expect(input.mode).toBe("readability");
    expect(output.quality.extraction_method).toBe("readability");
  });
});
