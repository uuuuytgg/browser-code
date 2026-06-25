import type { CaptureTask } from "@ska/schemas";
import { readTopTags } from "@ska/tool-vault";
import type { ModelGenerateInput } from "../model/provider";
import type { SessionMessage } from "../session/session-store";
import type { ToolSpec } from "../tools/types";
import { buildHarnessInput } from "../model/harness";

export async function buildContext(
  task: CaptureTask,
  sessionMessages: SessionMessage[],
  tools: ToolSpec[],
  options?: {
    vaultDir?: string;
  }
): Promise<ModelGenerateInput> {
  const knownTags = options?.vaultDir
    ? await readTopTags(options.vaultDir, 50)
    : [];

  return buildHarnessInput(task, sessionMessages, tools, {
    knownTags
  });
}
