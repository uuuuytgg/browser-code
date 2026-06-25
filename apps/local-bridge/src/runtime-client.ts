import path from "node:path";

import { MockModelProvider, createStage1MockTools, runAgentTask } from "@ska/runtime";
import type { CaptureTask, RunAgentTaskResult } from "@ska/schemas";

export type RuntimeTaskHandler = (task: CaptureTask) => Promise<RunAgentTaskResult>;

export type CreateRuntimeTaskHandlerOptions = {
  tempDir?: string;
  vaultDir?: string;
};

export function createRuntimeTaskHandler(
  options: CreateRuntimeTaskHandlerOptions = {}
): RuntimeTaskHandler {
  const tempDir = options.tempDir ?? path.resolve("temp");
  const vaultDir = options.vaultDir ?? path.resolve("vault");

  return async (task) => {
    if (task.task_type !== "save_page" && task.task_type !== "save_selection") {
      return {
        status: "error",
        error: {
          code: "TASK_TYPE_NOT_IMPLEMENTED",
          message: `Task type ${task.task_type} is not implemented in Stage 5 bridge runtime mock`
        }
      };
    }

    const provider = new MockModelProvider(createMockOutputs(task));

    return runAgentTask(task, {
      provider,
      tools: createStage1MockTools(),
      tempDir,
      vaultDir
    });
  };
}

function createMockOutputs(task: CaptureTask) {
  const markdownTitle = task.page.title || task.page.url;
  const noteId = `mock_${task.task_id}`;
  const filePath = "vault/articles/mock-note.md";
  const html = task.page.html ?? "<html><body></body></html>";

  return [
    {
      type: "tool_call",
      tool_call: {
        id: `${task.task_id}_call_1`,
        name: "web_to_markdown",
        input: {
          url: task.page.url,
          title: markdownTitle,
          html,
          selected_text: task.page.selected_text ?? null,
          mode: task.task_type === "save_selection" ? "selection" : "full"
        }
      }
    },
    {
      type: "tool_call",
      tool_call: {
        id: `${task.task_id}_call_2`,
        name: "save_markdown_note",
        input: {
          markdown: buildMockMarkdown(task, markdownTitle),
          metadata: {
            title: markdownTitle,
            source_url: task.page.url,
            tags: [task.task_type]
          },
          content_type: task.task_type === "save_selection" ? "snippet" : "article",
          source_url: task.page.url
        }
      }
    },
    {
      type: "final",
      answer: {
        message: "Saved by local bridge runtime mock.",
        note_id: noteId,
        file_path: filePath
      }
    }
  ];
}

function buildMockMarkdown(task: CaptureTask, title: string) {
  if (task.task_type === "save_selection" && task.page.selected_text) {
    return `# ${title}\n\n${task.page.selected_text}`;
  }

  return `# ${title}\n\nSaved from ${task.page.url}`;
}
