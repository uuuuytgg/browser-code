import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CaptureTask } from "@ska/schemas";

import { inferAgentMode, getMaxStepsForTask } from "./agent/agent-modes";
import { runAgentTask } from "./agent/task-runner";
import { MockModelProvider } from "./model/mock-provider";
import { PermissionGuard } from "./tools/permission";
import { createStage1MockTools } from "./tools/mock-tools";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

function createTempRoot() {
  const root = path.join(os.tmpdir(), `ska-stage1-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tempRoots.push(root);
  return root;
}

function createSavePageTask(): CaptureTask {
  return {
    task_id: "task_stage1_save_page",
    task_type: "save_page",
    page: {
      url: "https://example.com/post",
      title: "Example Post",
      html: "<html><body><article>Hello Stage 1</article></body></html>",
      platform: "web"
    },
    created_at: "2026-06-25T00:00:00+08:00"
  };
}

describe("agent mode inference", () => {
  it("maps task types to the expected agent mode", () => {
    expect(inferAgentMode(createSavePageTask())).toBe("curator");
    expect(getMaxStepsForTask(createSavePageTask())).toBe(6);
  });
});

describe("runAgentTask", () => {
  it("runs the minimal save_page loop with mock tools", async () => {
    const tempRoot = createTempRoot();
    const task = createSavePageTask();
    const provider = new MockModelProvider([
      {
        type: "tool_call",
        tool_call: {
          id: "call_1",
          name: "web_to_markdown",
          input: {
            url: task.page.url,
            title: task.page.title,
            html: task.page.html
          }
        }
      },
      {
        type: "tool_call",
        tool_call: {
          id: "call_2",
          name: "save_markdown_note",
          input: {
            markdown: "# Example Post\n\nHello Stage 1",
            metadata: {
              title: task.page.title,
              source_url: task.page.url,
              tags: ["example"]
            },
            content_type: "article",
            source_url: task.page.url
          }
        }
      },
      {
        type: "final",
        answer: {
          message: "已保存",
          note_id: "20260625_example",
          file_path: "vault/articles/example.md"
        }
      }
    ]);

    const result = await runAgentTask(task, {
      provider,
      tools: createStage1MockTools(),
      tempDir: path.join(tempRoot, "temp"),
      vaultDir: path.join(tempRoot, "vault")
    });

    expect(result.status).toBe("done");
    expect(result.answer).toMatchObject({
      note_id: "20260625_example",
      file_path: "vault/articles/example.md"
    });

    const sessionLogPath = path.join(tempRoot, "temp", "sessions", `${task.task_id}.jsonl`);
    const sessionLog = await fs.readFile(sessionLogPath, "utf8");
    expect(sessionLog).toContain("\"event\":\"task_received\"");
    expect(sessionLog).toContain("\"event\":\"tool_result\"");
    expect(sessionLog).toContain("\"event\":\"final\"");
  });

  it("returns need_confirmation for a high-risk tool call", async () => {
    const tempRoot = createTempRoot();
    const task: CaptureTask = {
      ...createSavePageTask(),
      task_id: "task_stage1_high_risk",
      task_type: "summarize_video"
    };

    const provider = new MockModelProvider([
      {
        type: "tool_call",
        tool_call: {
          id: "call_high_risk",
          name: "ffmpeg_extract_audio",
          input: {
            source_path: "temp/input.mp4"
          }
        }
      }
    ]);

    const result = await runAgentTask(task, {
      provider,
      tools: createStage1MockTools(),
      tempDir: path.join(tempRoot, "temp"),
      vaultDir: path.join(tempRoot, "vault")
    });

    expect(result.status).toBe("need_confirmation");
    expect(result.pendingToolCall?.name).toBe("ffmpeg_extract_audio");
  });

  it("fails when the model exceeds the max step limit", async () => {
    const tempRoot = createTempRoot();
    const task = createSavePageTask();
    const provider = new MockModelProvider(
      Array.from({ length: 7 }, (_, index) => ({
        type: "tool_call" as const,
        tool_call: {
          id: `call_${index + 1}`,
          name: "web_to_markdown",
          input: {
            url: task.page.url,
            title: task.page.title,
            html: task.page.html
          }
        }
      }))
    );

    const result = await runAgentTask(task, {
      provider,
      tools: createStage1MockTools(),
      tempDir: path.join(tempRoot, "temp"),
      vaultDir: path.join(tempRoot, "vault")
    });

    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("MAX_STEPS_EXCEEDED");
  });
});

describe("PermissionGuard", () => {
  it("auto-allows low risk tools and confirms high-risk tools", () => {
    const guard = new PermissionGuard();
    const tools = createStage1MockTools();

    const lowRisk = guard.check(tools[0]!.spec, "curator");
    const highRisk = guard.check(tools[2]!.spec, "media");

    expect(lowRisk.decision).toBe("allow");
    expect(highRisk.decision).toBe("confirm");
  });
});
