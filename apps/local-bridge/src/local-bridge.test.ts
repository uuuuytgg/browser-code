import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CaptureTask, ResourceItem } from "@ska/schemas";

import { createLocalBridgeServer } from "./localhost-server";
import { LocalConfigStore } from "./local-config";
import { createRuntimeTaskHandler } from "./runtime-client";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

function createTempRoot() {
  const root = path.join(os.tmpdir(), `ska-stage5-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tempRoots.push(root);
  return root;
}

function createTask(overrides: Partial<CaptureTask> = {}): CaptureTask {
  return {
    task_id: "task_bridge_1",
    task_type: "save_page",
    page: {
      url: "https://example.com/article",
      title: "Bridge Example",
      html: "<html><body><article>Hello bridge</article></body></html>",
      platform: "web"
    },
    created_at: "2026-06-25T00:00:00+08:00",
    ...overrides
  };
}

describe("local bridge server", () => {
  it("serves the health endpoint", async () => {
    const root = createTempRoot();
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      }),
      configStore: new LocalConfigStore(path.join(root, "config.json"))
    });

    await server.start();
    try {
      const response = await fetch(server.url("/health"));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        name: "browser-code-local-bridge",
        version: "0.1.0"
      });
    } finally {
      await server.stop();
    }
  });

  it("reads and updates public bridge config without exposing API keys", async () => {
    const root = createTempRoot();
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      }),
      configStore: new LocalConfigStore(path.join(root, "config.json"))
    });

    await server.start();
    try {
      const patchResponse = await fetch(server.url("/config"), {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          provider: "deepseek",
          model: "deepseek-chat",
          apiKey: "secret-test-key",
          vaultDir: path.join(root, "configured-vault")
        })
      });

      expect(patchResponse.status).toBe(200);
      const updated = await patchResponse.json();
      expect(updated).toMatchObject({
        ok: true,
        provider: "deepseek",
        model: "deepseek-chat",
        keyConfigured: true,
        vaultDir: path.join(root, "configured-vault")
      });
      expect(JSON.stringify(updated)).not.toContain("secret-test-key");

      const getResponse = await fetch(server.url("/config"));
      expect(getResponse.status).toBe(200);
      expect(await getResponse.json()).toMatchObject({
        provider: "deepseek",
        keyConfigured: true
      });
    } finally {
      await server.stop();
    }
  });

  it("accepts a valid task and exposes its status", async () => {
    const root = createTempRoot();
    const task = createTask();
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      const postResponse = await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(task)
      });

      expect(postResponse.status).toBe(200);
      expect(await postResponse.json()).toMatchObject({
        ok: true,
        task_id: task.task_id,
        status: "processing"
      });

      const finalRecord = await waitForTask(server, task.task_id);
      expect(finalRecord.status).toBe("done");
      expect(finalRecord.result?.status).toBe("done");
      expect(finalRecord.result?.answer?.file_path).toMatch(/^vault\/articles\/.+\.md$/);

      const filePath = path.join(root, finalRecord.result.answer.file_path.replace(/^vault\//, "vault/"));
      const savedMarkdown = await fs.readFile(filePath, "utf8");
      expect(savedMarkdown).toContain("Hello bridge");

      const indexPath = path.join(root, "vault", "index", "index.json");
      const indexRaw = await fs.readFile(indexPath, "utf8");
      const index = JSON.parse(indexRaw);
      expect(index.notes).toHaveLength(1);
    } finally {
      await server.stop();
    }
  });

  it("saves selections into the snippets vault path using selected text mode", async () => {
    const root = createTempRoot();
    const task = createTask({
      task_id: "task_bridge_selection",
      task_type: "save_selection",
      page: {
        url: "https://example.com/selection",
        title: "Selection Example",
        html: "<html><body><article>Full article should not win.</article></body></html>",
        selected_text: "Only this selected sentence should be saved.",
        platform: "web"
      }
    });
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(task)
      });

      const finalRecord = await waitForTask(server, task.task_id);
      expect(finalRecord.status).toBe("done");
      expect(finalRecord.result?.answer?.file_path).toMatch(/^vault\/snippets\/.+\.md$/);

      const filePath = path.join(root, finalRecord.result.answer.file_path.replace(/^vault\//, "vault/"));
      const savedMarkdown = await fs.readFile(filePath, "utf8");
      expect(savedMarkdown).toContain("Only this selected sentence should be saved.");
    } finally {
      await server.stop();
    }
  });

  it("rejects an invalid task with status 400", async () => {
    const root = createTempRoot();
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      const response = await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          task_id: "bad_task",
          task_type: "not_real"
        })
      });

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("BAD_REQUEST");
    } finally {
      await server.stop();
    }
  });

  it("returns runtime mock errors for unsupported task types", async () => {
    const root = createTempRoot();
    const task = createTask({
      task_id: "task_bridge_search",
      task_type: "search_vault",
      user_instruction: "react performance"
    });
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(task)
      });

      const finalRecord = await waitForTask(server, task.task_id);
      expect(finalRecord.status).toBe("done");
      expect(finalRecord.result).toMatchObject({
        status: "done",
        answer: {
          result_count: 0
        }
      });
    } finally {
      await server.stop();
    }
  });

  it("saves a video transcript into the videos vault path when transcript data is present", async () => {
    const root = createTempRoot();
    const task = createTask({
      task_id: "task_bridge_video",
      task_type: "summarize_video",
      page: {
        url: "https://www.youtube.com/watch?v=abc123",
        title: "Video Example",
        html: `
          <html>
            <head>
              <meta property="og:title" content="Video Example" />
              <meta name="author" content="Uploader Name" />
            </head>
            <body>
              <div data-transcript-text="First transcript line" data-start="0" data-end="2"></div>
              <div data-transcript-text="Second transcript line" data-start="2" data-end="4"></div>
            </body>
          </html>
        `,
        platform: "youtube"
      }
    });
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(task)
      });

      const finalRecord = await waitForTask(server, task.task_id);
      expect(finalRecord.status).toBe("done");
      expect(finalRecord.result?.answer?.file_path).toMatch(/^vault\/videos\/.+\.md$/);

      const filePath = path.join(root, finalRecord.result.answer.file_path.replace(/^vault\//, "vault/"));
      const savedMarkdown = await fs.readFile(filePath, "utf8");
      expect(savedMarkdown).toContain("## Transcript");
      expect(savedMarkdown).toContain("First transcript line");
    } finally {
      await server.stop();
    }
  });

  it("returns need_confirmation when a video page has no transcript", async () => {
    const root = createTempRoot();
    const task = createTask({
      task_id: "task_bridge_video_missing_transcript",
      task_type: "summarize_video",
      page: {
        url: "https://www.youtube.com/watch?v=missing",
        title: "Missing Transcript",
        html: "<html><body><video></video></body></html>",
        platform: "youtube"
      }
    });
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(task)
      });

      const finalRecord = await waitForTask(server, task.task_id);
      expect(finalRecord.status).toBe("need_confirmation");
      expect(finalRecord.result).toMatchObject({
        status: "need_confirmation",
        pendingToolCall: {
          name: "ffmpeg_extract_audio"
        }
      });
    } finally {
      await server.stop();
    }
  });

  it("scans public resources and returns them without writing assets by default", async () => {
    const root = createTempRoot();
    const task = createTask({
      task_id: "task_bridge_resources",
      task_type: "scan_resources",
      page: {
        url: "https://example.com/resources",
        title: "Resource Page",
        html: "<html><body></body></html>",
        platform: "web",
        links: [
          { text: "Guide PDF", href: "https://example.com/files/guide.pdf" },
          { text: "Playlist", href: "https://cdn.example.com/video/master.m3u8" }
        ],
        media: [
          { type: "image", src: "https://example.com/assets/cover.png" }
        ]
      }
    });
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(task)
      });

      const finalRecord = await waitForTask(server, task.task_id);
      expect(finalRecord.status).toBe("done");
      expect(finalRecord.result?.answer?.resource_count).toBe(3);
      const resources = finalRecord.result?.answer?.resources as ResourceItem[];
      expect(resources.find((item) => item.type === "pdf")?.downloadable_by_default).toBe(true);
      expect(resources.find((item) => item.url.endsWith(".m3u8"))?.risk).toBe("high");

      const assetDir = path.join(root, "vault", "assets");
      await expect(fs.access(assetDir)).rejects.toThrow();
    } finally {
      await server.stop();
    }
  });

  it("searches the vault through the bridge and returns matching notes", async () => {
    const root = createTempRoot();
    const seedTask = createTask({
      task_id: "task_bridge_seed_note",
      task_type: "save_page",
      page: {
        url: "https://example.com/react-performance",
        title: "React Performance Guide",
        html: "<html><body><article>React performance tuning strategies for rendering.</article></body></html>",
        platform: "web"
      }
    });
    const searchTask = createTask({
      task_id: "task_bridge_search_results",
      task_type: "search_vault",
      page: {
        url: "https://example.com/search",
        title: "Search Vault",
        html: "<html><body></body></html>",
        platform: "web"
      },
      user_instruction: "react performance"
    });
    const server = createLocalBridgeServer({
      port: 0,
      runtimeHandler: createRuntimeTaskHandler({
        tempDir: path.join(root, "temp"),
        vaultDir: path.join(root, "vault")
      })
    });

    await server.start();
    try {
      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(seedTask)
      });
      await waitForTask(server, seedTask.task_id);

      await fetch(server.url("/tasks"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(searchTask)
      });

      const finalRecord = await waitForTask(server, searchTask.task_id);
      expect(finalRecord.status).toBe("done");
      expect(finalRecord.result?.answer?.result_count).toBeGreaterThan(0);
      expect(finalRecord.result?.answer?.results?.[0]?.title).toContain("React Performance");
    } finally {
      await server.stop();
    }
  });
});

async function waitForTask(
  server: ReturnType<typeof createLocalBridgeServer>,
  taskId: string
) {
  for (let index = 0; index < 20; index += 1) {
    const response = await fetch(server.url(`/tasks/${taskId}`));
    if (response.status !== 200) {
      throw new Error(`Expected task lookup 200, got ${response.status}`);
    }

    const payload = await response.json();
    if (payload.status !== "processing") {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Task ${taskId} did not settle in time`);
}
