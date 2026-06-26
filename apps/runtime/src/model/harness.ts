import fs from "node:fs/promises";
import path from "node:path";

import type { CaptureTask } from "@ska/schemas";

import { resolveModuleDir } from "../module-path";
import { resolveRepoRoot } from "../repo-root";
import type { SessionMessage } from "../session/session-store";
import type { ToolSpec } from "../tools/types";
import type { ModelGenerateInput } from "./provider";

const runtimeDir = resolveModuleDir(import.meta.url);
const repoRoot = resolveRepoRoot(runtimeDir);
const systemPromptPath = path.join(repoRoot, "prompts", "system.knowledge-agent.md");

export async function readSystemPrompt() {
  return fs.readFile(systemPromptPath, "utf8");
}

export function buildTaskInstruction(task: CaptureTask) {
  switch (task.task_type) {
    case "save_page":
      return "Task: save_page. Use web_to_markdown first, then save_markdown_note, then build_index if available, then return a final answer.";
    case "summarize_video":
      return "Task: summarize_video. Use fetch_transcript first. If transcript is available, write a concise structured summary with key points and timestamps through save_markdown_note using content_type=video, then return the saved note reference. If subtitles are unavailable and extraction is high-risk, request confirmation instead of pretending the summary succeeded.";
    case "scan_resources":
      return "Task: scan_resources. Use scan_page_resources to inspect the page. Do not auto-download assets.";
    case "search_vault":
      return "Task: search_vault. Use search_vault first, then compose a grounded answer from the returned results.";
    case "save_selection":
      return "Task: save_selection. Prefer the selected text as the source material, save it through save_markdown_note, and return the saved note reference.";
    default:
      return `Task: ${task.task_type}.`;
  }
}

export function buildToolSummary(tools: ToolSpec[]) {
  if (tools.length === 0) {
    return "No tools are available.";
  }

  return tools
    .map((tool) => `${tool.name} [risk=${tool.risk}]`)
    .join(", ");
}

export async function buildHarnessInput(
  task: CaptureTask,
  sessionMessages: SessionMessage[],
  tools: ToolSpec[],
  options: {
    knownTags?: string[];
  } = {}
): Promise<ModelGenerateInput> {
  const system = await readSystemPrompt();

  return {
    system,
    response_format: "json",
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            instruction: buildTaskInstruction(task),
            output_contract: {
              allowed_types: ["tool_call", "final"],
              tool_call_shape: {
                type: "tool_call",
                tool_call: {
                  id: "string",
                  name: "registered tool name",
                  input: {}
                }
              },
              final_shape: {
                type: "final",
                answer: {}
              }
            },
            allowed_tools: buildToolSummary(tools),
            known_tags: options.knownTags ?? [],
            task
          },
          null,
          2
        )
      },
      ...sessionMessages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ],
    tools
  };
}
