import type { VideoPlatform } from "@ska/schemas";

type VideoPlatformRule = {
  platform: Exclude<VideoPlatform, "unknown">;
  hosts: RegExp[];
};

const videoPlatformRules: VideoPlatformRule[] = [
  {
    platform: "youtube",
    hosts: [/(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/]
  },
  {
    platform: "bilibili",
    hosts: [/(^|\.)bilibili\.com$/, /(^|\.)b23\.tv$/]
  },
  {
    platform: "douyin",
    hosts: [/(^|\.)douyin\.com$/, /(^|\.)iesdouyin\.com$/]
  },
  {
    platform: "xiaohongshu",
    hosts: [/(^|\.)xiaohongshu\.com$/, /(^|\.)xhslink\.com$/]
  },
  {
    platform: "tiktok",
    hosts: [/(^|\.)tiktok\.com$/, /(^|\.)vm\.tiktok\.com$/, /(^|\.)vt\.tiktok\.com$/]
  }
];

export function detectVideoPlatform(url: string): VideoPlatform {
  let hostname = "";

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  for (const rule of videoPlatformRules) {
    if (rule.hosts.some((pattern) => pattern.test(hostname))) {
      return rule.platform;
    }
  }

  return "unknown";
}
