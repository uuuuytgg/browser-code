import { describe, expect, it } from "vitest";

import type { CaptureTask } from "@ska/schemas";

import { buildConversationIntent, buildHarnessInput, buildTaskInstruction, buildToolSummary, readSystemPrompt } from "./harness";

const sampleTask: CaptureTask = {
  task_id: "task_harness_1",
  task_type: "save_page",
  page: {
    url: "https://example.com/post",
    title: "Harness Example",
    html: "<html><body>Hello</body></html>",
    platform: "web"
  },
  created_at: "2026-06-25T00:00:00+08:00"
};

describe("harness", () => {
  it("reads the system prompt from the repo prompt file", async () => {
    const systemPrompt = await readSystemPrompt();
    expect(systemPrompt).toContain("You are a local knowledge agent");
    expect(systemPrompt).toContain("run_shell");
  });

  it("builds task-specific instructions", () => {
    expect(buildTaskInstruction(sampleTask)).toContain("web_to_markdown");
    expect(
      buildTaskInstruction({
        ...sampleTask,
        task_type: "search_vault"
      })
    ).toContain("search_vault first");
    expect(
      buildTaskInstruction({
        ...sampleTask,
        task_type: "chat",
        user_instruction: "Explain this page"
      })
    ).toContain("answer directly");
  });

  it("summarizes only the injected tools", () => {
    const summary = buildToolSummary([
      {
        name: "web_to_markdown",
        description: "Convert HTML to markdown",
        risk: "low",
        agent_modes: ["curator"],
        input_schema: { safeParse: () => ({ success: true, data: {} }) } as any,
        output_schema: { safeParse: () => ({ success: true, data: {} }) } as any
      }
    ]);

    expect(summary).toBe("web_to_markdown [risk=low]");
  });

  it("builds a JSON harness input with the output contract and tool list", async () => {
    const input = await buildHarnessInput(
      sampleTask,
      [],
      [
        {
          name: "web_to_markdown",
          description: "Convert HTML to markdown",
          risk: "low",
          agent_modes: ["curator"],
          input_schema: { safeParse: () => ({ success: true, data: {} }) } as any,
          output_schema: { safeParse: () => ({ success: true, data: {} }) } as any
        }
      ]
    );

    expect(input.response_format).toBe("json");
    expect(input.messages[0]?.content).toContain("Return valid json only");
    expect(input.messages[0]?.content).toContain("\"allowed_tools\": \"web_to_markdown [risk=low]\"");
    expect(input.messages[0]?.content).toContain("\"allowed_types\": [");
  });

  it("adds natural-language chat intent without forcing vault search", () => {
    const intent = buildConversationIntent({
      ...sampleTask,
      task_type: "chat",
      user_instruction: "What can you do?"
    });

    expect(intent).toMatchObject({
      user_message: "What can you do?",
      current_page: {
        title: "Harness Example",
        url: "https://example.com/post"
      }
    });
  });
});
