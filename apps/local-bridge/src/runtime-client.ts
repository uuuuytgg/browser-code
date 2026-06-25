import path from "node:path";

import { createRegisteredTools, runAgentTask } from "@ska/runtime";
import type { CaptureTask, RunAgentTaskResult, ToolResult, WebToMarkdownOutput, SaveMarkdownNoteOutput } from "@ska/schemas";

type ToolMessagePayload = {
  name: string;
  result: ToolResult;
};

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
          message: `Task type ${task.task_type} is not implemented in Stage 8 bridge runtime handler`
        }
      };
    }

    const provider = new LocalBridgeCaptureProvider(task);

    return runAgentTask(task, {
      provider,
      tools: createRegisteredTools(),
      tempDir,
      vaultDir
    });
  };
}

class LocalBridgeCaptureProvider {
  readonly name = "mock";

  constructor(private readonly task: CaptureTask) {}

  async generate(input: {
    messages: Array<{ role: "user" | "assistant" | "tool"; content: string }>;
  }) {
    const toolMessages = input.messages
      .filter((message) => message.role === "tool")
      .map((message) => parseToolMessage(message.content))
      .filter((message): message is ToolMessagePayload => Boolean(message));

    const webResult = findToolResult<WebToMarkdownOutput>(toolMessages, "web_to_markdown");
    const saveResult = findToolResult<SaveMarkdownNoteOutput>(toolMessages, "save_markdown_note");

    let parsed: unknown;

    if (!webResult) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_1`,
          name: "web_to_markdown",
          input: {
            url: this.task.page.url,
            title: this.task.page.title,
            html: this.task.page.html ?? "<html><body></body></html>",
            selected_text: this.task.page.selected_text ?? null,
            mode: this.task.task_type === "save_selection" ? "selection" : "readability"
          }
        }
      };
    } else if (!saveResult) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_2`,
          name: "save_markdown_note",
          input: {
            markdown: webResult.markdown,
            metadata: {
              title: webResult.metadata.title,
              source_url: webResult.metadata.source_url,
              source_platform: this.task.page.platform ?? "web",
              tags: [this.task.task_type],
              keywords: extractKeywords(webResult)
            },
            content_type: this.task.task_type === "save_selection" ? "snippet" : "article",
            source_url: webResult.metadata.source_url
          }
        }
      };
    } else if (!findToolResult(toolMessages, "build_index")) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_3`,
          name: "build_index",
          input: {}
        }
      };
    } else {
      parsed = {
        type: "final",
        answer: {
          message: "Saved to local vault.",
          note_id: saveResult.note_id,
          file_path: saveResult.file_path
        }
      };
    }

    return {
      raw: JSON.stringify(parsed),
      parsed
    };
  }
}

function parseToolMessage(content: string) {
  try {
    return JSON.parse(content) as ToolMessagePayload;
  } catch {
    return null;
  }
}

function findToolResult<T>(messages: ToolMessagePayload[], toolName: string) {
  const match = messages.find((message) => message.name === toolName && message.result.ok);
  return match?.result.output as T | undefined;
}

function extractKeywords(result: WebToMarkdownOutput) {
  const keywordSet = new Set<string>();
  const text = `${result.metadata.title} ${result.metadata.excerpt ?? ""} ${result.markdown}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 12);

  for (const token of text) {
    keywordSet.add(token);
  }

  return [...keywordSet].slice(0, 8);
}
