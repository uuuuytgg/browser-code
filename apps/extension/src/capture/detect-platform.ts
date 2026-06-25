export function detectPlatform(url: string) {
  const hostname = new URL(url).hostname;

  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    return "youtube" as const;
  }

  if (hostname.includes("bilibili.com")) {
    return "bilibili" as const;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "web" as const;
  }

  return "unknown" as const;
}
