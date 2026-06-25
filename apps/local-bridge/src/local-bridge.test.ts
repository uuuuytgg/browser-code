import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CaptureTask } from "@ska/schemas";

import { createLocalBridgeServer } from "./localhost-server";
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
      })
    });

    await server.start();
    try {
      const response = await fetch(server.url("/health"));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        name: "sidebar-knowledge-agent-bridge",
        version: "0.1.0"
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
      expect(finalRecord.result).toMatchObject({
        status: "done",
        answer: {
          note_id: `mock_${task.task_id}`,
          file_path: "vault/articles/mock-note.md"
        }
      });
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
      task_type: "search_vault"
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
      expect(finalRecord.status).toBe("error");
      expect(finalRecord.result).toMatchObject({
        status: "error",
        error: {
          code: "TASK_TYPE_NOT_IMPLEMENTED"
        }
      });
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
