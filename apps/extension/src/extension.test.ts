/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import { buildCaptureTask } from "./capture/build-capture-task";
import { collectPageContext } from "./content/page-capture";
import { sendTaskToLocalBridge } from "./bridge-client/localhost-client";

describe("collectPageContext", () => {
  it("captures title, html, links, media, selection, and meta from the current page", () => {
    document.documentElement.innerHTML = `
      <html>
        <head>
          <title>Example Page</title>
          <meta name="description" content="Example description" />
        </head>
        <body>
          <article>
            <a href="/docs">Docs</a>
            <img src="/cover.png" alt="Cover" />
            <video src="/intro.mp4"></video>
          </article>
        </body>
      </html>
    `;

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => "Selected text"
      })
    });

    const context = collectPageContext();

    expect(context.title).toBe("Example Page");
    expect(context.selected_text).toBe("Selected text");
    expect(context.links[0]?.href).toMatch(/\/docs$/);
    expect(context.media.some((media) => /\/cover\.png$/.test(media.src))).toBe(true);
    expect(context.meta.description).toBe("Example description");
    expect(context.html).toContain("<article>");
  });
});

describe("buildCaptureTask", () => {
  it("builds a save_page capture task with platform detection", () => {
    const task = buildCaptureTask("save_page", {
      url: "https://www.youtube.com/watch?v=abc",
      title: "Video Page",
      html: "<html></html>",
      selected_text: "",
      links: [],
      media: [],
      meta: {}
    });

    expect(task.task_type).toBe("save_page");
    expect(task.page.platform).toBe("youtube");
    expect(task.task_id).toMatch(/^task_/);
  });

  it("drops oversized html payloads and falls back to title, url, and selection", () => {
    const task = buildCaptureTask("save_selection", {
      url: "https://example.com/large",
      title: "Large Page",
      html: "x".repeat(900_000),
      selected_text: "Keep this selection",
      links: [],
      media: [],
      meta: {}
    });

    expect(task.page.html).toBeUndefined();
    expect(task.page.selected_text).toBe("Keep this selection");
  });
});

describe("sendTaskToLocalBridge", () => {
  it("posts a capture task to the local bridge and returns the parsed status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        task_id: "task_123",
        status: "processing"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTaskToLocalBridge({
      task_id: "task_123",
      task_type: "save_page",
      page: {
        url: "https://example.com",
        title: "Example"
      },
      created_at: "2026-06-25T00:00:00+08:00"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:34567/tasks",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(result.status).toBe("processing");
  });
});
