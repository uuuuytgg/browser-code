import type { PageContext, AgentTaskStatus } from "../../capture/types";
import { detectPlatform } from "../../capture/detect-platform";

/**
 * Requests page context from the content script via chrome.tabs.sendMessage.
 * Only called within the extension sidepanel context; throws in other envs.
 */

const CHROME_MSG_TYPE = "ska:get-page-context" as const;

function chromeApi(): any {
  try {
    return (globalThis as { chrome?: any }).chrome ?? null;
  } catch {
    return null;
  }
}

export async function requestPageContext(): Promise<PageContext> {
  const api = chromeApi();
  if (!api?.tabs?.query || !api?.tabs?.sendMessage) {
    throw new Error("当前环境无法读取浏览器页面，请确认是在扩展侧边栏中运行。");
  }

  const [activeTab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    throw new Error("没有找到当前活动标签页。");
  }

  // 先尝试通过 content script 获取完整上下文
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const context = await api.tabs.sendMessage(activeTab.id, { type: CHROME_MSG_TYPE });
      if (context) {
        return {
          url: activeTab.url ?? "",
          title: activeTab.title ?? "",
          html: "",
          links: [],
          media: [],
          meta: {},
          ...context,
        } as PageContext;
      }
    } catch {
      // content script 未注入 → 主动注入一次再重试
      if (attempt === 0) {
        try {
          await api.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["content/content-script.js"],
          });
          // 给 content script 一点初始化时间
          await new Promise((r) => setTimeout(r, 100));
        } catch {
          // 没有 scripting 权限时放弃
          break;
        }
      }
    }
  }

  // 实在拿不到，返回最少上下文（url + title）
  return {
    url: activeTab.url ?? "",
    title: activeTab.title ?? "",
    html: "",
    links: [],
    media: [],
    meta: {},
  };
}

/** Derive a display label for the detected platform. */
export function platformLabel(url: string): string {
  const platform = detectPlatform(url);
  switch (platform) {
    case "bilibili": return "Bilibili";
    case "youtube": return "YouTube";
    case "web": return "网页";
    default: return "未知";
  }
}

/** Build an agent prompt from page context + optional action hint + user text. */
export function buildAgentPrompt(
  pageContext: PageContext,
  userInput: string,
  actionHint?: string,
): string {
  const lines: string[] = [];
  lines.push(`当前页面：${pageContext.title} (${pageContext.url})`);
  if (pageContext.selected_text) {
    lines.push(`\n用户选中文本：${pageContext.selected_text}`);
  }
  if (actionHint) {
    lines.push(`\n用户指令：${actionHint}`);
  }
  if (userInput) {
    lines.push(`\n用户附加说明：${userInput}`);
  }
  return lines.join("\n");
}
