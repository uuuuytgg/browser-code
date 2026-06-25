import path from "node:path";

import {
  CaptureTaskSchema,
  RunAgentTaskResultSchema,
  type CaptureTask,
  type RunAgentTaskResult,
  type ToolResult
} from "@ska/schemas";

import { buildContext } from "./context-builder";
import { getMaxStepsForTask, inferAgentMode } from "./agent-modes";
import { parseModelOutput } from "./output-parser";
import type { ModelProvider } from "../model/provider";
import { SessionStore } from "../session/session-store";
import { PermissionGuard } from "../tools/permission";
import { ToolRegistry } from "../tools/registry";
import { ToolRouter } from "../tools/router";
import type { ToolImplementation } from "../tools/types";

type RunAgentTaskOptions = {
  provider: ModelProvider;
  tools: ToolImplementation[];
  tempDir: string;
  vaultDir: string;
  sessionDir?: string;
  maxStepsOverride?: number;
};

export async function runAgentTask(
  rawTask: CaptureTask,
  options: RunAgentTaskOptions
): Promise<RunAgentTaskResult> {
  const task = CaptureTaskSchema.parse(rawTask);
  const mode = inferAgentMode(task);
  const maxSteps = options.maxStepsOverride ?? getMaxStepsForTask(task);
  const registry = new ToolRegistry(options.tools);
  const router = new ToolRouter(registry);
  const permissionGuard = new PermissionGuard();
  const sessionStore = new SessionStore(options.sessionDir ?? path.join(options.tempDir, "sessions"), task.task_id);

  await sessionStore.addEvent("session_started", {
    session_id: task.task_id,
    task_id: task.task_id,
    mode,
    provider: options.provider.name,
    temp_dir: options.tempDir,
    vault_dir: options.vaultDir,
    max_steps: maxSteps
  });
  await sessionStore.addEvent("task_received", { task, mode, maxSteps });

  for (let step = 0; step < maxSteps; step += 1) {
    const context = await buildContext(task, sessionStore.messages, registry.getToolsForMode(mode).map((tool) => tool.spec));
    const output = await options.provider.generate(context);
    await sessionStore.addEvent("model_output", { raw: output.raw, parsed: output.parsed });

    let parsedOutput;
    try {
      parsedOutput = parseModelOutput(output.parsed);
    } catch (error) {
      await sessionStore.addError("MODEL_OUTPUT_INVALID", error instanceof Error ? error.message : "Invalid model output");
      continue;
    }

    if (parsedOutput.type === "final") {
      await sessionStore.addEvent("final", parsedOutput.answer);
      return RunAgentTaskResultSchema.parse({
        status: "done",
        answer: parsedOutput.answer
      });
    }

    const validation = registry.validate(parsedOutput.tool_call, mode);
    if (!validation.ok) {
      await sessionStore.addError(validation.error.code, validation.error.message);
      continue;
    }

    const toolSpec = validation.spec;
    const permission = permissionGuard.check(toolSpec, mode);
    if (permission.decision === "confirm") {
      await sessionStore.addEvent("need_confirmation", { tool_call: parsedOutput.tool_call, reason: permission.reason });
      return RunAgentTaskResultSchema.parse({
        status: "need_confirmation",
        pendingToolCall: parsedOutput.tool_call
      });
    }

    if (permission.decision === "deny") {
      await sessionStore.addError("TOOL_DENIED", permission.reason ?? "Tool denied");
      continue;
    }

    const toolResult = await router.execute(parsedOutput.tool_call, {
      task_id: task.task_id,
      session_id: task.task_id,
      vault_dir: options.vaultDir,
      temp_dir: options.tempDir,
      allowed_read_roots: [options.vaultDir, options.tempDir],
      allowed_write_roots: [options.tempDir],
      logger: {
        info(message, details) {
          void sessionStore.addEvent("tool_log", { level: "info", message, details });
        },
        error(message, details) {
          void sessionStore.addEvent("tool_log", { level: "error", message, details });
        }
      }
    });

    await recordToolResult(sessionStore, parsedOutput.tool_call.name, toolResult);
  }

  await sessionStore.addError("MAX_STEPS_EXCEEDED", `Task exceeded ${maxSteps} steps`);
  return RunAgentTaskResultSchema.parse({
    status: "error",
    error: {
      code: "MAX_STEPS_EXCEEDED",
      message: `Task exceeded ${maxSteps} steps`
    }
  });
}

async function recordToolResult(sessionStore: SessionStore, toolName: string, toolResult: ToolResult) {
  await sessionStore.addToolResult(toolName, toolResult);
}
