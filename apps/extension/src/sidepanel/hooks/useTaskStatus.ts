import { useState, useCallback, useRef } from "react";
import type { AgentTaskStatus } from "../../capture/types";

/**
 * 7-state lifecycle for agent task tracking:
 *   idle → capturing → sending → processing → need_confirmation → done / error
 *
 * All communication goes through browser-code serve (fork server), NOT the old local-bridge.
 */

export type { AgentTaskStatus };

const STATUS_LABELS: Record<AgentTaskStatus, string> = {
  idle: "就绪",
  capturing: "正在读取页面...",
  sending: "已发送，等待处理...",
  processing: "Agent 处理中...",
  need_confirmation: "需要确认",
  done: "完成",
  error: "出错",
};

export function useTaskStatus() {
  const [status, setStatusState] = useState<AgentTaskStatus>("idle");
  const [message, setMessage] = useState("");
  const [taskId, setTaskId] = useState<string | undefined>();
  const lastDoneRef = useRef<string | null>(null);

  const setStatus = useCallback((next: AgentTaskStatus, msg?: string, id?: string) => {
    setStatusState(next);
    setMessage(msg ?? STATUS_LABELS[next]);
    if (id !== undefined) setTaskId(id);
    if (next === "done") lastDoneRef.current = msg ?? null;
  }, []);

  const reset = useCallback(() => {
    setStatusState("idle");
    setMessage("");
    setTaskId(undefined);
  }, []);

  return {
    status,
    message,
    taskId,
    lastDone: lastDoneRef,
    setStatus,
    reset,
    isBusy: status === "capturing" || status === "sending" || status === "processing",
    label: STATUS_LABELS[status],
  } as const;
}
