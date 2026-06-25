import type { CaptureTask } from "@ska/schemas";

export type CaptureTaskType = CaptureTask["task_type"];

export type PageContext = {
  url: string;
  title: string;
  html?: string;
  selected_text?: string;
  links: Array<{ text: string; href: string }>;
  media: Array<{ type: string; src: string }>;
  meta: Record<string, string>;
};

export type BridgeTaskStatus =
  | "idle"
  | "capturing"
  | "sending"
  | "processing"
  | "need_confirmation"
  | "done"
  | "error";
