import { useEffect, useRef, useState, useCallback } from "react";
import { ForkClient } from "../../bridge-client/fork-client";

/**
 * Manages the fork server session lifecycle: connect → health → create session.
 * Returns a stable client reference and session ID for use by child components.
 *
 * NOTE: Before creating a session, this hook fetches the existing session list
 * via healthCheck and reuses a recent idle session if available. This avoids
 * the "empty response / stuck processing" issue where the extension creates a
 * fresh session every mount but the fork server has no project context to ground
 * the agent in.
 */

export function useForkSession(port: number = 34567) {
  const clientRef = useRef<ForkClient | null>(null);
  const sessionIDRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const client = ForkClient.connect(port);
        clientRef.current = client;

        // Health check also returns the session list; pick the most recent
        // idle session (or create a new one).
        let sid: string | null = null;
        try {
          const sessions = await client.healthCheck();
          if (!sessions || !Array.isArray(sessions)) {
            if (!cancelled) setError("无法连接 fork server，请确认终端已运行 `browser-code serve`。");
            return;
          }
          // Prefer the most recently updated session that isn't busy
          const sorted = [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
          const idle = sorted.find((s) => s.status !== "busy");
          if (idle) {
            sid = idle.id;
          }
        } catch {
          if (!cancelled) { setError("无法连接 fork server，请确认终端已运行 `browser-code serve`。"); return; }
        }

        if (!sid) {
          const session = await client.createSession({ title: "Browser Code" });
          sid = session.sessionID;
        }

        sessionIDRef.current = sid;
        if (!cancelled) setConnected(true);
      } catch (err) {
        if (!cancelled) {
          setError(`连接失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [port]);

  /** Create a brand new session (avoids stale question/state from previous runs). */
  const newSession = useCallback(async (title?: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("未连接");
    const session = await client.createSession({ title: title ?? "Browser Code" });
    sessionIDRef.current = session.sessionID;
    return session.sessionID;
  }, []);

  /** Send a prompt to the agent. */
  const sendPrompt = useCallback(async (prompt: string) => {
    const client = clientRef.current;
    const sid = sessionIDRef.current;
    if (!client || !sid) throw new Error("未连接");
    await client.sendMessage(sid, prompt);
  }, []);

  /** Fetch all messages for the current session. */
  const fetchMessages = useCallback(async () => {
    const client = clientRef.current;
    const sid = sessionIDRef.current;
    if (!client || !sid) return [];
    return client.getMessages(sid);
  }, []);

  /** Subscribe to SSE events for the current session. */
  const subscribeSSE = useCallback(
    (onEvent: (event: { type: string; data: unknown }) => void, onError?: (err: unknown) => void) => {
      const client = clientRef.current;
      const sid = sessionIDRef.current;
      if (!client || !sid) return null;
      return client.subscribeToSessionEvents(sid, onEvent, onError);
    },
    []
  );

  return {
    client: clientRef,
    sessionID: sessionIDRef,
    connected,
    error,
    sendPrompt,
    fetchMessages,
    subscribeSSE,
    newSession,
  } as const;
}
