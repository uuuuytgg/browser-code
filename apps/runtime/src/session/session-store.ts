import fs from "node:fs/promises";
import path from "node:path";

import type { ToolResult } from "@ska/schemas";

export type SessionMessage = {
  role: "assistant" | "tool";
  content: string;
};

type SessionEvent =
  | "session_started"
  | "task_received"
  | "model_output"
  | "tool_result"
  | "error"
  | "final"
  | "need_confirmation"
  | "tool_log";

export class SessionStore {
  readonly messages: SessionMessage[] = [];

  private readonly sessionFilePath: string;

  constructor(sessionDir: string, sessionId: string) {
    this.sessionFilePath = path.join(sessionDir, `${sessionId}.jsonl`);
  }

  async addEvent(event: SessionEvent, payload: unknown) {
    await fs.mkdir(path.dirname(this.sessionFilePath), { recursive: true });
    await fs.appendFile(
      this.sessionFilePath,
      `${JSON.stringify({ event, payload, created_at: new Date().toISOString() })}\n`,
      "utf8"
    );
  }

  async addError(code: string, message: string) {
    this.messages.push({
      role: "assistant",
      content: JSON.stringify({
        error: {
          code,
          message
        }
      })
    });

    await this.addEvent("error", { code, message });
  }

  async addToolResult(toolName: string, result: ToolResult) {
    this.messages.push({
      role: "tool",
      content: JSON.stringify({
        name: toolName,
        result
      })
    });

    await this.addEvent("tool_result", {
      name: toolName,
      result
    });
  }
}
