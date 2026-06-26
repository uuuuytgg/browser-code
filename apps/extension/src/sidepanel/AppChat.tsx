import { useEffect, useState } from "react";

import { skaVersion } from "@ska/shared";
import {
  getBridgeConfig,
  sendTaskToLocalBridge,
  updateBridgeConfig,
  waitForLocalBridgeTask,
  type BridgeConfig,
  type BridgeTaskRecord
} from "../bridge-client/localhost-client";
import { buildCaptureTask } from "../capture/build-capture-task";
import type { CaptureTaskType, PageContext } from "../capture/types";

export const extensionAppInfo = {
  name: "@ska/extension",
  displayName: "Browser Code Extension",
  stage: 4,
  version: skaVersion
} as const;

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "status" | "error";
  text: string;
};

const text = {
  welcome: "\u6211\u53ef\u4ee5\u4fdd\u5b58\u7f51\u9875\u3001\u603b\u7ed3\u89c6\u9891\u3001\u626b\u63cf\u8d44\u6e90\uff0c\u4e5f\u53ef\u4ee5\u641c\u7d22\u672c\u5730\u77e5\u8bc6\u5e93\u3002",
  settings: "\u8bbe\u7f6e",
  vault: "\u77e5\u8bc6\u5e93",
  waiting: "\u7b49\u5f85\u672c\u5730\u540e\u7aef",
  connected: "\u5df2\u8fde\u63a5",
  keyReady: "\u5df2\u914d\u7f6e Key",
  keyMissing: "\u672a\u914d\u7f6e Key",
  provider: "\u6a21\u578b\u670d\u52a1",
  model: "\u6a21\u578b\u540d",
  apiKey: "API Key",
  saveSettings: "\u4fdd\u5b58\u8bbe\u7f6e",
  modelPlaceholder: "\u7559\u7a7a\u4f7f\u7528\u9ed8\u8ba4\u6a21\u578b",
  keyPlaceholder: "\u7559\u7a7a\u5219\u4e0d\u4fee\u6539",
  inputPlaceholder: "\u95ee\u77e5\u8bc6\u5e93\uff0c\u6216\u5148\u8f93\u5165\u8981\u6c42\u518d\u70b9\u4e0a\u65b9\u5feb\u6377\u6309\u94ae",
  send: "\u53d1\u9001",
  submitted: "\u4efb\u52a1\u5df2\u63d0\u4ea4",
  reading: "\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u9875\u9762\u5e76\u53d1\u9001\u4efb\u52a1...",
  noBridge: "\u672a\u8fde\u63a5\u672c\u5730\u540e\u7aef\uff0c\u8bf7\u5148\u5728\u7ec8\u7aef\u8fd0\u884c browser-code start\u3002"
};

const actions: Array<{ label: string; taskType: CaptureTaskType }> = [
  { label: "\u4fdd\u5b58\u7f51\u9875", taskType: "save_page" },
  { label: "\u603b\u7ed3\u89c6\u9891", taskType: "summarize_video" },
  { label: "\u626b\u63cf\u8d44\u6e90", taskType: "scan_resources" },
  { label: "\u4fdd\u5b58\u9009\u4e2d", taskType: "save_selection" },
  { label: "\u641c\u7d22\u77e5\u8bc6\u5e93", taskType: "search_vault" }
];

const providerLabels: Record<BridgeConfig["provider"], string> = {
  mock: "Mock",
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic"
};

async function requestPageContext(): Promise<PageContext> {
  const chromeApi = (globalThis as { chrome?: any }).chrome;

  if (!chromeApi?.tabs?.query || !chromeApi?.tabs?.sendMessage) {
    throw new Error("\u5f53\u524d\u73af\u5883\u65e0\u6cd5\u8bfb\u53d6\u6d4f\u89c8\u5668\u9875\u9762\uff0c\u8bf7\u786e\u8ba4\u662f\u5728\u6269\u5c55\u4fa7\u8fb9\u680f\u4e2d\u8fd0\u884c\u3002");
  }

  const [activeTab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    throw new Error("\u6ca1\u6709\u627e\u5230\u5f53\u524d\u6d3b\u52a8\u6807\u7b7e\u9875\u3002");
  }

  const context = await chromeApi.tabs.sendMessage(activeTab.id, { type: "ska:get-page-context" });
  if (!context) {
    throw new Error("\u65e0\u6cd5\u8bfb\u53d6\u5f53\u524d\u9875\u9762\u5185\u5bb9\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u518d\u8bd5\u3002");
  }

  return context as PageContext;
}

export function AppChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: text.welcome }
  ]);
  const [input, setInput] = useState("");
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<BridgeConfig["provider"]>("mock");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshConfig();
  }, []);

  async function refreshConfig() {
    try {
      const next = await getBridgeConfig();
      setConfig(next);
      setProvider(next.provider);
      setModel(next.model ?? "");
    } catch {
      addMessage("error", text.noBridge);
    }
  }

  function addMessage(role: ChatMessage["role"], messageText: string) {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, role, text: messageText }
    ]);
  }

  async function handleAction(taskType: CaptureTaskType) {
    const userInstruction = input.trim();
    const label = actions.find((action) => action.taskType === taskType)?.label ?? taskType;
    addMessage("user", userInstruction ? `${label}\uff1a${userInstruction}` : label);
    setInput("");
    await runTask(taskType, userInstruction);
  }

  async function handleSend() {
    const messageText = input.trim();
    if (!messageText) return;
    addMessage("user", messageText);
    setInput("");
    await runTask("chat", messageText);
  }

  async function runTask(taskType: CaptureTaskType, userInstruction?: string) {
    try {
      setBusy(true);
      addMessage("status", text.reading);
      const pageContext = await requestPageContext();
      const task = buildCaptureTask(taskType, pageContext, userInstruction);
      const response = await sendTaskToLocalBridge(task);
      addMessage("status", `${text.submitted}\uff1a${response.task_id}`);
      const record = await waitForLocalBridgeTask(response.task_id);
      addMessage(record.status === "error" ? "error" : "assistant", renderTaskRecord(record));
      await refreshConfig();
    } catch (error) {
      addMessage("error", error instanceof Error ? error.message : "\u4efb\u52a1\u5931\u8d25\u3002");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    try {
      const next = await updateBridgeConfig({
        provider,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined
      });
      setConfig(next);
      setApiKey("");
      setSettingsOpen(false);
      addMessage("assistant", `\u8bbe\u7f6e\u5df2\u4fdd\u5b58\uff1a${providerLabels[next.provider]}\uff0cAPI Key ${next.keyConfigured ? text.keyReady : text.keyMissing}\u3002`);
    } catch (error) {
      addMessage("error", error instanceof Error ? error.message : "\u4fdd\u5b58\u8bbe\u7f6e\u5931\u8d25\u3002");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Browser Code</h1>
          <p>{config ? `${providerLabels[config.provider]} · ${config.keyConfigured ? text.keyReady : text.keyMissing}` : text.connected}</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setSettingsOpen((value) => !value)}>
          {text.settings}
        </button>
      </header>

      <section className="vault-strip">
        <span>{text.vault}</span>
        <strong title={config?.vaultDir}>{config?.vaultDir ?? text.waiting}</strong>
      </section>

      {settingsOpen && (
        <section className="settings-panel">
          <label>
            {text.provider}
            <select value={provider} onChange={(event) => setProvider(event.target.value as BridgeConfig["provider"])}>
              <option value="mock">Mock</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label>
            {text.model}
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder={text.modelPlaceholder} />
          </label>
          <label>
            {text.apiKey}
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder={text.keyPlaceholder} />
          </label>
          <button type="button" className="primary-button" onClick={() => void saveSettings()}>
            {text.saveSettings}
          </button>
        </section>
      )}

      <section className="messages" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`message message-${message.role}`}>
            {message.text}
          </article>
        ))}
      </section>

      <section className="composer">
        <div className="quick-actions">
          {actions.map((action) => (
            <button key={action.taskType} type="button" disabled={busy} onClick={() => void handleAction(action.taskType)}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="input-row">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={text.inputPlaceholder} rows={2} />
          <button type="button" className="primary-button" disabled={busy || !input.trim()} onClick={() => void handleSend()}>
            {text.send}
          </button>
        </div>
      </section>
    </main>
  );
}

function renderTaskRecord(record: BridgeTaskRecord) {
  const result = record.result as any;
  if (record.status === "need_confirmation") {
    return "\u9700\u8981\u786e\u8ba4\u9ad8\u98ce\u9669\u64cd\u4f5c\u3002\u5f53\u524d\u7248\u672c\u4e0d\u4f1a\u81ea\u52a8\u4e0b\u8f7d\u6216\u8f6c\u5199\u97f3\u9891\u3002";
  }
  if (record.status === "error") {
    return result?.error?.message ?? "\u4efb\u52a1\u5931\u8d25\u3002";
  }
  const answer = result?.answer;
  if (answer?.file_path) {
    return `${answer.message ?? "\u5df2\u4fdd\u5b58\u3002"}\n\u6587\u4ef6\uff1a${answer.file_path}`;
  }
  if (Array.isArray(answer?.results)) {
    if (answer.results.length === 0) return "\u77e5\u8bc6\u5e93\u91cc\u6ca1\u6709\u627e\u5230\u76f8\u5173\u5185\u5bb9\u3002";
    return answer.results.slice(0, 5).map((item: any, index: number) => `${index + 1}. ${item.title}\n${item.snippet ?? item.path}`).join("\n\n");
  }
  if (Array.isArray(answer?.resources)) {
    return `\u53d1\u73b0 ${answer.resources.length} \u4e2a\u8d44\u6e90\u3002\n${answer.resources.slice(0, 6).map((item: any) => `${item.type}: ${item.url}`).join("\n")}`;
  }
  return answer?.message ?? "\u4efb\u52a1\u5b8c\u6210\u3002";
}
