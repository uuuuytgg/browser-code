import { useEffect, useRef, useState, useCallback } from "react";
import { skaVersion } from "@ska/shared";

import { MessageList } from "./components/MessageList";
import { QuickActions, type QuickAction } from "./components/QuickActions";
import { Composer } from "./components/Composer";
import { StatusBar } from "./components/StatusBar";

type ChatMessage = { id: string; role: "user" | "assistant" | "status" | "error"; text: string };

export const extensionAppInfo = {
  name: "@ska/extension",
  displayName: "Browser Code Extension",
  stage: 4,
  version: skaVersion,
} as const;

function chromeApi(): any {
  try {
    return (globalThis as { chrome?: any }).chrome ?? null;
  } catch {
    return null;
  }
}

const BASE_URL = "http://127.0.0.1:34567";
const AUTH = "Basic " + btoa("opencode:opencode");

async function getPageUrl(): Promise<string | null> {
  const api = chromeApi();
  if (!api?.tabs?.query) return null;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? null;
  } catch {
    return null;
  }
}

async function createSession(): Promise<string> {
  const res = await fetch(`${BASE_URL}/session`, {
    method: "POST",
    headers: { Authorization: AUTH, "content-type": "application/json" },
    body: JSON.stringify({ title: "Browser Code" }),
  });
  if (!res.ok) throw new Error(`创建会话失败: ${res.status}`);
  const data = await res.json();
  return data.id;
}

async function sendPrompt(sessionID: string, text: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/session/${sessionID}/prompt_async`, {
    method: "POST",
    headers: { Authorization: AUTH, "content-type": "application/json" },
    body: JSON.stringify({ parts: [{ type: "text", text }] }),
  });
  if (res.status !== 204) throw new Error(`发送失败: ${res.status}`);
}

async function getMessages(sessionID: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE_URL}/session/${sessionID}/message`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) return [];
  const raw: Array<{ info: { id: string; role: string; finish?: string }; parts: Array<{ type: string; text?: string }> }> = await res.json();
  return raw
    .filter((m) => m.info.role === "assistant" && !m.info.finish?.includes("tool-calls"))
    .map((m) => ({
      id: m.info.id,
      role: "assistant" as const,
      text: m.parts.filter((p) => p.type === "text" && !p.text?.startsWith("```")).map((p) => p.text ?? "").join("\n") || "(工具调用中...)",
    }));
}

export function AppChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: "已就绪。发送消息或点快捷按钮让 agent 开始工作。" },
  ]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionID = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownMessageIDs = useRef(new Set<string>());

  // 连接检查
  useEffect(() => {
    fetch(`${BASE_URL}/session?limit=1`, { headers: { Authorization: AUTH } })
      .then((r) => setConnected(r.ok))
      .catch(() => setConnected(false));
  }, []);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  // 开始轮询消息
  const startPolling = useCallback(async (sid: string) => {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const msgs = await getMessages(sid);
        for (const msg of msgs) {
          if (knownMessageIDs.current.has(msg.id)) continue;
          knownMessageIDs.current.add(msg.id);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      } catch { /* skip */ }
    }, 1000);
  }, [stopPolling]);

  async function send(text: string) {
    setBusy(true);
    try {
      const sid = await createSession();
      sessionID.current = sid;
      const url = await getPageUrl();
      const prompt = url ? `当前页面：${url}\n\n用户指令：${text}` : text;
      knownMessageIDs.current.clear();
      await sendPrompt(sid, prompt);
      startPolling(sid);
    } catch (err) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "error", text: err instanceof Error ? err.message : "发送失败" }]);
    } finally {
      setBusy(false);
    }
  }

  async function onQuickAction(action: QuickAction) {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", text: action.label }]);
    await send(action.promptHint);
  }

  async function onChatSend(userText: string) {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", text: userText }]);
    await send(userText);
  }

  // 清理
  useEffect(() => () => stopPolling(), [stopPolling]);

  return (
    <main className="app-shell">
      <StatusBar connected={connected} status={busy ? "processing" : "idle"} statusMessage="" currentUrl="" />
      <MessageList messages={messages} />
      <section className="composer-area">
        <QuickActions disabled={busy} onAction={onQuickAction} />
        <Composer disabled={busy} placeholder="描述任务" sendLabel="发送" onSend={onChatSend} />
      </section>
    </main>
  );
}
