import type { VideoPlatform } from "@ska/schemas";

export function detectVideoPlatform(url: string): VideoPlatform {
  const normalized = url.toLowerCase();

  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    return "youtube";
  }

  if (normalized.includes("bilibili.com") || normalized.includes("b23.tv")) {
    return "bilibili";
  }

  return "unknown";
}
