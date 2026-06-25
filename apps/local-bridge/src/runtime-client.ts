import path from "node:path";

import { createRegisteredTools, runAgentTask } from "@ska/runtime";
import type {
  CaptureTask,
  FetchTranscriptOutput,
  ResourceItem,
  RunAgentTaskResult,
  ScanResourcesOutput,
  SaveMarkdownNoteOutput,
  ToolResult,
  WebToMarkdownOutput
} from "@ska/schemas";

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
    if (
      task.task_type !== "save_page"
      && task.task_type !== "save_selection"
      && task.task_type !== "summarize_video"
      && task.task_type !== "scan_resources"
    ) {
      return {
        status: "error",
        error: {
          code: "TASK_TYPE_NOT_IMPLEMENTED",
          message: `Task type ${task.task_type} is not implemented in Stage 10 bridge runtime handler`
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

    const transcriptResult = findToolResult<FetchTranscriptOutput>(toolMessages, "fetch_transcript");
    const scanResult = findToolResult<ScanResourcesOutput>(toolMessages, "scan_page_resources");
    const webResult = findToolResult<WebToMarkdownOutput>(toolMessages, "web_to_markdown");
    const saveResult = findToolResult<SaveMarkdownNoteOutput>(toolMessages, "save_markdown_note");

    let parsed: unknown;

    if (this.task.task_type === "scan_resources" && !scanResult) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_1`,
          name: "scan_page_resources",
          input: {
            page_url: this.task.page.url,
            links: this.task.page.links ?? [],
            media: this.task.page.media ?? [],
            html: this.task.page.html
          }
        }
      };
    } else if (this.task.task_type === "scan_resources" && scanResult) {
      parsed = {
        type: "final",
        answer: {
          message: `Found ${scanResult.items.length} public resources.`,
          resource_count: scanResult.items.length,
          resources: scanResult.items
        }
      };
    } else
    if (this.task.task_type === "summarize_video" && !transcriptResult) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_1`,
          name: "fetch_transcript",
          input: {
            url: this.task.page.url,
            platform: this.task.page.platform,
            html: this.task.page.html,
            preferred_languages: ["zh-CN", "en"]
          }
        }
      };
    } else if (this.task.task_type === "summarize_video" && transcriptResult && !transcriptResult.ok) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_2`,
          name: "ffmpeg_extract_audio",
          input: {
            input_path: path.join("temp", `${this.task.task_id}.video`),
            output_format: "wav"
          }
        }
      };
    } else if (this.task.task_type === "summarize_video" && transcriptResult && !saveResult) {
      parsed = {
        type: "tool_call",
        tool_call: {
          id: `${this.task.task_id}_call_3`,
          name: "save_markdown_note",
          input: {
            markdown: buildTranscriptMarkdown(this.task, transcriptResult),
            metadata: {
              title: transcriptResult.metadata?.title ?? this.task.page.title,
              source_url: this.task.page.url,
              source_platform: transcriptResult.platform,
              tags: ["summarize_video", transcriptResult.platform],
              keywords: extractTranscriptKeywords(transcriptResult)
            },
            content_type: "video",
            source_url: this.task.page.url
          }
        }
      };
    } else if (!webResult && this.task.task_type !== "summarize_video") {
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
    } else if (!saveResult && this.task.task_type !== "summarize_video" && webResult) {
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
    } else if (saveResult) {
      parsed = {
        type: "final",
        answer: {
          message: this.task.task_type === "summarize_video"
            ? "Video transcript saved to local vault."
            : "Saved to local vault.",
          note_id: saveResult.note_id,
          file_path: saveResult.file_path
        }
      };
    } else {
      parsed = {
        type: "final",
        answer: {
          message: "No further action available."
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

function buildTranscriptMarkdown(task: CaptureTask, result: FetchTranscriptOutput) {
  const transcriptText = (result.transcript ?? [])
    .map((line) => `- [${formatSeconds(line.start)}] ${line.text}`)
    .join("\n");

  return [
    `# ${result.metadata?.title ?? task.page.title}`,
    "",
    `Source: ${task.page.url}`,
    `Platform: ${result.platform}`,
    result.metadata?.uploader ? `Uploader: ${result.metadata.uploader}` : "",
    "",
    "## Transcript",
    transcriptText
  ]
    .filter(Boolean)
    .join("\n");
}

function extractTranscriptKeywords(result: FetchTranscriptOutput) {
  const text = (result.transcript ?? [])
    .map((line) => line.text)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 12);

  return [...new Set(text)].slice(0, 8);
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
