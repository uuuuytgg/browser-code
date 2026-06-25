import {
  BridgeTaskRecordSchema,
  type BridgeTaskRecord,
  type BridgeTaskStatus
} from "./bridge-protocol";
import type { CaptureTask, RunAgentTaskResult } from "@ska/schemas";

function nowIso() {
  return new Date().toISOString();
}

export class TaskStore {
  private readonly records = new Map<string, BridgeTaskRecord>();

  submit(task: CaptureTask): BridgeTaskRecord {
    const timestamp = nowIso();
    const record = BridgeTaskRecordSchema.parse({
      task_id: task.task_id,
      task_type: task.task_type,
      status: "processing",
      created_at: timestamp,
      updated_at: timestamp
    });

    this.records.set(task.task_id, record);
    return record;
  }

  settle(taskId: string, result: RunAgentTaskResult): BridgeTaskRecord {
    const record = this.getOrThrow(taskId);
    const status = mapRuntimeStatus(result.status);
    const settled = BridgeTaskRecordSchema.parse({
      ...record,
      status,
      updated_at: nowIso(),
      result
    });

    this.records.set(taskId, settled);
    return settled;
  }

  fail(taskId: string, error: { code: string; message: string }): BridgeTaskRecord {
    const record = this.getOrThrow(taskId);
    const failed = BridgeTaskRecordSchema.parse({
      ...record,
      status: "error",
      updated_at: nowIso(),
      result: {
        status: "error",
        error
      }
    });

    this.records.set(taskId, failed);
    return failed;
  }

  get(taskId: string) {
    return this.records.get(taskId);
  }

  private getOrThrow(taskId: string) {
    const record = this.records.get(taskId);
    if (!record) {
      throw new Error(`Unknown task_id: ${taskId}`);
    }

    return record;
  }
}

function mapRuntimeStatus(status: RunAgentTaskResult["status"]): BridgeTaskStatus {
  switch (status) {
    case "done":
      return "done";
    case "need_confirmation":
      return "need_confirmation";
    case "error":
      return "error";
    default:
      return "error";
  }
}
