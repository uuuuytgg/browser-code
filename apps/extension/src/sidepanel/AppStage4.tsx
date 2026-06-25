import { useState } from "react";

import { skaVersion } from "@ska/shared";
import { sendTaskToLocalBridge } from "../bridge-client/localhost-client";
import { buildCaptureTask } from "../capture/build-capture-task";
import type { BridgeTaskStatus, CaptureTaskType, PageContext } from "../capture/types";

export const extensionAppInfo = {
  name: "@ska/extension",
  displayName: "Browser Code Extension",
  stage: 4,
  version: skaVersion
} as const;

const actions: Array<{ label: string; taskType: CaptureTaskType }> = [
  { label: "保存当前网页", taskType: "save_page" },
  { label: "总结当前视频", taskType: "summarize_video" },
  { label: "扫描页面资源", taskType: "scan_resources" },
  { label: "保存选中文本", taskType: "save_selection" },
  { label: "搜索知识库", taskType: "search_vault" }
];

async function requestPageContext(): Promise<PageContext> {
  const chromeApi = (globalThis as { chrome?: any }).chrome;

  if (!chromeApi?.tabs?.query || !chromeApi?.tabs?.sendMessage) {
    throw new Error("Chrome extension APIs are unavailable in the side panel.");
  }

  const [activeTab] = await chromeApi.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!activeTab?.id) {
    throw new Error("No active tab was found.");
  }

  const context = await chromeApi.tabs.sendMessage(activeTab.id, {
    type: "ska:get-page-context"
  });

  if (!context) {
    throw new Error("Failed to capture page context from the current tab.");
  }

  return context as PageContext;
}

export function AppStage4() {
  const [status, setStatus] = useState<BridgeTaskStatus>("idle");
  const [message, setMessage] = useState("Ready to capture the current page.");

  async function handleAction(taskType: CaptureTaskType) {
    try {
      setStatus("capturing");
      setMessage("Capturing page context...");

      const pageContext = await requestPageContext();
      const task = buildCaptureTask(taskType, pageContext);

      setStatus("sending");
      setMessage("Sending task to local bridge...");

      const response = await sendTaskToLocalBridge(task);
      setStatus(response.status);
      setMessage(`Task ${response.task_id} is ${response.status}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unknown extension error.");
    }
  }

  return (
    <main>
      <h1>Browser Code</h1>
      <p>Capture the current page and send a controlled task to the local bridge.</p>
      <p>Status: {status}</p>
      <p>{message}</p>
      <ul>
        {actions.map((action) => (
          <li key={action.taskType}>
            <button type="button" onClick={() => void handleAction(action.taskType)}>
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
