import { useRef, useCallback } from "react";
import type { ForkMessage } from "../../bridge-client/fork-client";

/** Subscribes to SSE and falls back to polling for new messages from the fork server. */

export function useMessageStream(opts: {
  subscribeSSE: (onEvent: (e: { type: string; data: unknown }) => void, onError?: (err: unknown) => void) => AbortController | null;
  fetchMessages: () => Promise<ForkMessage[]>;
}) {
  const { subscribeSSE, fetchMessages } = opts;

  const knownIDs = useRef<Set<string>>(new Set());
  const sseCtrl = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetKnown = useCallback(() => {
    knownIDs.current = new Set();
  }, []);

  const stopSSE = useCallback(() => {
    if (sseCtrl.current) {
      sseCtrl.current.abort();
      sseCtrl.current = null;
    }
  }, []);

  const stopPoll = useCallback(() => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopSSE();
    stopPoll();
  }, [stopSSE, stopPoll]);

  const startPolling = useCallback(
    (onNew: (msg: ForkMessage) => void) => {
      stopPoll();
      pollTimer.current = setInterval(async () => {
        try {
          const msgs = await fetchMessages();
          for (const msg of msgs) {
            if (knownIDs.current.has(msg.id)) continue;
            knownIDs.current.add(msg.id);
            onNew(msg);
          }
        } catch {
          // Poll errors expected if session still spinning up
        }
      }, 500);
    },
    [fetchMessages, stopPoll],
  );

  const start = useCallback(
    (onNew: (msg: ForkMessage) => void) => {
      stopSSE();
      resetKnown();

      // Prime with existing messages first
      void fetchMessages().then((msgs) => {
        for (const m of msgs) knownIDs.current.add(m.id);
      });

      const ctrl = subscribeSSE(
        () => {
          void fetchMessages().then((msgs) => {
            for (const msg of msgs) {
              if (knownIDs.current.has(msg.id)) continue;
              knownIDs.current.add(msg.id);
              onNew(msg);
            }
          });
        },
        () => {
          startPolling(onNew);
        },
      );

      if (ctrl) {
        sseCtrl.current = ctrl;
      } else {
        startPolling(onNew);
      }
    },
    [subscribeSSE, fetchMessages, stopSSE, resetKnown, startPolling],
  );

  return { start, stop, resetKnown };
}
