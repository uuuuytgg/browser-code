import fs from "node:fs/promises";
import path from "node:path";

import type { CaptureTask } from "@ska/schemas";
import type { ModelGenerateInput } from "../model/provider";
import type { SessionMessage } from "../session/session-store";
import type { ToolSpec } from "../tools/types";

const systemPromptPath = path.resolve(process.cwd(), "..", "..", "prompts", "system.knowledge-agent.md");

function buildTaskPrompt(task: CaptureTask) {
  switch (task.task_type) {
    case "save_page":
      return "Task: save_page. First call web_to_markdown, then save_markdown_note, then return a final answer.";
    case "summarize_video":
      return "Task: summarize_video. Prefer fetch_transcript first. High-risk media extraction requires confirmation.";
    case "scan_resources":
      return "Task: scan_resources. Scan only. Do not auto-download.";
    case "search_vault":
      return "Task: search_vault. Search first, then answer.";
    case "save_selection":
      return "Task: save_selection. Capture the selected text and save through save_markdown_note.";
    default:
      return `Task: ${task.task_type}.`;
  }
}

async function readSystemPrompt() {
  return fs.readFile(systemPromptPath, "utf8");
}

export async function buildContext(
  task: CaptureTask,
  sessionMessages: SessionMessage[],
  tools: ToolSpec[]
): Promise<ModelGenerateInput> {
  const system = await readSystemPrompt();

  return {
    system,
    response_format: "json",
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          prompt: buildTaskPrompt(task),
          task
        })
      },
      ...sessionMessages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ],
    tools
  };
}
