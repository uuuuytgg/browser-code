import type { CaptureTask } from "@ska/schemas";
import type { AgentMode } from "@ska/schemas";

export function inferAgentMode(task: CaptureTask): AgentMode {
  switch (task.task_type) {
    case "save_page":
    case "save_selection":
      return "curator";
    case "summarize_video":
      return "media";
    case "scan_resources":
      return "resource";
    case "chat":
    case "search_vault":
    default:
      return "reader";
  }
}

export function getMaxStepsForTask(task: CaptureTask): number {
  switch (task.task_type) {
    case "save_page":
      return 6;
    case "summarize_video":
      return 8;
    case "scan_resources":
      return 5;
    case "search_vault":
      return 4;
    case "chat":
      return 6;
    default:
      return 8;
  }
}
