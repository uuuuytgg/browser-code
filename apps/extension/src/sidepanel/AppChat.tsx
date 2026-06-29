import { useEffect, useRef, useState, useCallback } from "react";
import { MessageList, DefaultEmptyState } from "./components/MessageList";
import { QuickActions, type QuickAction } from "./components/QuickActions";
import { Composer } from "./components/Composer";
import { StatusBar } from "./components/StatusBar";
import { useAgentStatus } from "./hooks/useAgentStatus";

type RawMessage = {
  id: string;
  role: string;
  text: string;
};

const BASE = "http://127.0.0.1:34567";
const AUTH = "Basic " + btoa("opencode:opencode");

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: AUTH, "content-type": "application/json", ...opts?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res;
}

function chromeApi() {
  try { return (globalThis as any).chrome; } catch { return null; }
}

export function AppChat() {
  const [msgs, setMsgs] = useState<RawMessage[]>([]);
  const { status, setStatus } = useAgentStatus();
  const sidRef = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlSentRef = useRef(false);
  const currentTabUrl = useRef<string | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const poll = useCallback(async (sid: string) => {
    stopPoll();
    seen.current.clear();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api(`/session/${sid}/message`);
        const raw: Array<{ info: { id: string; role: string }; parts: Array<{ type: string; text?: string }> }> = await res.json();
        for (const m of raw) {
          if (seen.current.has(m.info.id)) continue;
          seen.current.add(m.info.id);
          const text = m.parts.map(p => p.text || "").join("\n").trim();
          setMsgs(prev => prev.some(x => x.id === m.info.id) ? prev : [...prev, { id: m.info.id, role: m.info.role, text }]);
        }
      } catch { /* skip */ }
    }, 1000);
  }, [stopPoll]);

  const send = useCallback(async (text: string) => {
    setStatus("busy");
    try {
      const res = await api("/session", { method: "POST", body: JSON.stringify({ title: "Browser Code" }) });
      const { id } = await res.json();
      sidRef.current = id;
      const payload = text;
      await api(`/session/${id}/prompt_async`, { method: "POST", body: JSON.stringify({ parts: [{ type: "text", text: payload }] }) });
      poll(id);
    } catch {
      setStatus("error");
    }
  }, [poll, setStatus]);

  // 初始：获取当前 tab URL
  useEffect(() => {
    const ch = chromeApi();
    if (!ch?.tabs?.query) return;
    ch.tabs.query({ active: true, currentWindow: true }).then(([tab]: any[]) => {
      if (tab?.url) currentTabUrl.current = tab.url;
    });
  }, []);

  // 监听 tab 切换 → 触发新一轮
  useEffect(() => {
    const ch = chromeApi();
    if (!ch?.tabs?.onActivated) return;
    const handler = async ({ tabId }: { tabId: number }) => {
      const tab = await ch.tabs.get(tabId);
      if (tab?.url && tab.url !== currentTabUrl.current) {
        currentTabUrl.current = tab.url;
        urlSentRef.current = false;
        // 自动发送 URL 到当前会话
        const sid = sidRef.current;
        if (sid) {
          await api(`/session/${sid}/prompt_async`, { method: "POST", body: JSON.stringify({ parts: [{ type: "text", text: `当前页面：${tab.url}` }] }) });
        }
      }
    };
    ch.tabs.onActivated.addListener(handler);
    return () => ch.tabs.onActivated.removeListener(handler);
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const onSend = useCallback(async (text: string) => {
    const sid = sidRef.current;
    const ch = chromeApi();
    let url = "";
    try {
      if (ch?.tabs?.query) {
        const [tab] = await ch.tabs.query({ active: true, currentWindow: true });
        url = tab?.url || "";
      }
    } catch {}

    // 第一次或切换 tab 后带 URL，否则纯对话
    const needUrl = !urlSentRef.current && url;
    const payload = needUrl ? `当前页面：${url}\n\n${text}` : text;
    urlSentRef.current = true;

    if (sid) {
      setMsgs(prev => [...prev, { id: Date.now().toString(), role: "user", text }]);
      await api(`/session/${sid}/prompt_async`, { method: "POST", body: JSON.stringify({ parts: [{ type: "text", text: payload }] }) });
    } else {
      setMsgs(prev => [...prev, { id: Date.now().toString(), role: "user", text }]);
      await send(payload);
    }
  }, [send]);

  const onQuickAction = useCallback(async (action: QuickAction) => {
    await onSend(action.promptHint);
  }, [onSend]);

  return (
    <main className="app-shell">
      <StatusBar connected={true} status={status} statusMessage="" />
      <MessageList messages={msgs.map(m => ({ id: m.id, role: m.role as any, text: m.text }))} onEmpty={<DefaultEmptyState />} />
      <section className="composer-area">
        <QuickActions disabled={status === "busy"} onAction={onQuickAction} />
        <Composer disabled={status === "busy"} placeholder="输入消息..." sendLabel="发送" onSend={onSend} />
      </section>
    </main>
  );
}
