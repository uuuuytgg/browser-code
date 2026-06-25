import { z } from "zod";
import { CaptureTaskSchema, type CaptureTask } from "@ska/schemas";

const BridgeTaskResponseSchema = z.object({
  ok: z.boolean(),
  task_id: z.string(),
  status: z.enum(["processing", "done", "need_confirmation", "error"]),
  result: z.unknown().optional()
});

export type BridgeTaskResponse = z.infer<typeof BridgeTaskResponseSchema>;

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
