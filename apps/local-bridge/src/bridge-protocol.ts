import { z } from "zod";

import {
  CaptureTaskSchema,
  RunAgentTaskResultSchema
} from "@ska/schemas";
import { skaVersion } from "@ska/shared";

export const bridgeTaskStatusValues = [
  "processing",
  "done",
  "need_confirmation",
  "error"
] as const;

export const BridgeTaskStatusSchema = z.enum(bridgeTaskStatusValues);
export type BridgeTaskStatus = z.infer<typeof BridgeTaskStatusSchema>;

export const BridgeHealthSchema = z.object({
  ok: z.literal(true),
  name: z.literal("sidebar-knowledge-agent-bridge"),
  version: z.literal(skaVersion)
});
export type BridgeHealth = z.infer<typeof BridgeHealthSchema>;

export const BridgeSubmitTaskResponseSchema = z.object({
  ok: z.literal(true),
  task_id: z.string().min(1),
  status: z.literal("processing")
});
export type BridgeSubmitTaskResponse = z.infer<typeof BridgeSubmitTaskResponseSchema>;

export const BridgeTaskRecordSchema = z.object({
  task_id: z.string().min(1),
  status: BridgeTaskStatusSchema,
  task_type: CaptureTaskSchema.shape.task_type,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  result: RunAgentTaskResultSchema.optional()
});
export type BridgeTaskRecord = z.infer<typeof BridgeTaskRecordSchema>;
