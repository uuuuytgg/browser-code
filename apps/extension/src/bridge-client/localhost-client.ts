import { z } from "zod";
import { CaptureTaskSchema, type CaptureTask } from "@ska/schemas";

const BridgeTaskResponseSchema = z.object({
  ok: z.boolean(),
  task_id: z.string(),
  status: z.enum(["processing", "done", "need_confirmation", "error"]),
  result: z.unknown().optional()
});

export type BridgeTaskResponse = z.infer<typeof BridgeTaskResponseSchema>;

const BridgeTaskRecordSchema = z.object({
  task_id: z.string(),
  status: z.enum(["processing", "done", "need_confirmation", "error"]),
  task_type: CaptureTaskSchema.shape.task_type,
  created_at: z.string(),
  updated_at: z.string(),
  result: z.unknown().optional()
});

const BridgeConfigSchema = z.object({
  ok: z.boolean(),
  provider: z.enum(["mock", "deepseek", "openai", "anthropic"]),
  model: z.string().optional(),
  vaultDir: z.string(),
  tempDir: z.string(),
  keyConfigured: z.boolean(),
  configPath: z.string()
});

export type BridgeTaskRecord = z.infer<typeof BridgeTaskRecordSchema>;
export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export async function sendTaskToLocalBridge(task: CaptureTask): Promise<BridgeTaskResponse> {
  const parsedTask = CaptureTaskSchema.parse(task);
  const response = await fetch("http://127.0.0.1:34567/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(parsedTask)
  });

  if (!response.ok) {
    throw new Error(`Local bridge request failed with status ${response.status}`);
  }

  return BridgeTaskResponseSchema.parse(await response.json());
}

export async function getTaskFromLocalBridge(taskId: string): Promise<BridgeTaskRecord> {
  const response = await fetch(`http://127.0.0.1:34567/tasks/${encodeURIComponent(taskId)}`);

  if (!response.ok) {
    throw new Error(`Local bridge task lookup failed with status ${response.status}`);
  }

  return BridgeTaskRecordSchema.parse(await response.json());
}

export async function waitForLocalBridgeTask(
  taskId: string,
  options: { attempts?: number; intervalMs?: number } = {}
): Promise<BridgeTaskRecord> {
  const attempts = options.attempts ?? 80;
  const intervalMs = options.intervalMs ?? 500;

  for (let index = 0; index < attempts; index += 1) {
    const record = await getTaskFromLocalBridge(taskId);
    if (record.status !== "processing") {
      return record;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("\u4efb\u52a1\u4ecd\u5728\u5904\u7406\u4e2d\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0\u67e5\u770b\u3002");
}

export async function getBridgeConfig(): Promise<BridgeConfig> {
  const response = await fetch("http://127.0.0.1:34567/config");

  if (!response.ok) {
    throw new Error(`Local bridge config failed with status ${response.status}`);
  }

  return BridgeConfigSchema.parse(await response.json());
}

export async function updateBridgeConfig(input: {
  provider?: BridgeConfig["provider"];
  model?: string;
  apiKey?: string;
  vaultDir?: string;
  tempDir?: string;
}): Promise<BridgeConfig> {
  const response = await fetch("http://127.0.0.1:34567/config", {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Local bridge config update failed with status ${response.status}`);
  }

  return BridgeConfigSchema.parse(await response.json());
}
