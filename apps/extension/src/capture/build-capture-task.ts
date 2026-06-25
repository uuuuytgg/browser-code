import type { CaptureTask } from "@ska/schemas";
import { detectPlatform } from "./detect-platform";
import type { CaptureTaskType, PageContext } from "./types";

const HTML_SIZE_LIMIT = 500_000;

function createTaskId() {
  return `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function buildCaptureTask(taskType: CaptureTaskType, page: PageContext, userInstruction?: string): CaptureTask {
  const html = page.html && page.html.length > HTML_SIZE_LIMIT ? undefined : page.html;

  return {
    task_id: createTaskId(),
    task_type: taskType,
    page: {
      url: page.url,
      title: page.title,
      platform: detectPlatform(page.url),
      html,
      selected_text: page.selected_text,
      links: page.links,
      media: page.media,
      meta: page.meta
    },
    user_instruction: userInstruction,
    created_at: new Date().toISOString()
  };
}
