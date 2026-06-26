import type { CaptureTask } from "@ska/schemas";

export function buildCaptureTaskFromText(
  taskType: CaptureTask["task_type"],
  userInstruction: string
): CaptureTask {
  return {
    task_id: `tui_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    task_type: taskType,
    page: {
      url: "https://browser-code.local/tui",
      title: "Browser Code TUI",
      platform: "web",
      html: "<html><body></body></html>",
      links: [],
      media: [],
      meta: {}
    },
    user_instruction: userInstruction,
    created_at: new Date().toISOString()
  };
}
