import type { CaptureTask } from "@ska/schemas";
import type { ModelGenerateInput } from "../model/provider";
import type { SessionMessage } from "../session/session-store";
import type { ToolSpec } from "../tools/types";
import { buildHarnessInput } from "../model/harness";

export async function buildContext(
  task: CaptureTask,
  sessionMessages: SessionMessage[],
  tools: ToolSpec[]
): Promise<ModelGenerateInput> {
  return buildHarnessInput(task, sessionMessages, tools);
}
