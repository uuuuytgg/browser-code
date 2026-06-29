import { useState, useRef, useCallback } from "react";

/** Simplified agent status enum: idle | busy | success | error */
export type AgentStatus = "idle" | "busy" | "success" | "error";

export function useAgentStatus() {
  const [status, setStatusState] = useState<AgentStatus>("idle");
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = useCallback((next: AgentStatus) => {
    // Clear any pending auto-reset
    if (successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
    }

    setStatusState(next);

    // Auto-reset "success" after 2s back to idle
    if (next === "success") {
      successTimer.current = setTimeout(() => {
        setStatusState("idle");
        successTimer.current = null;
      }, 2000);
    }
  }, []);

  return { status, setStatus } as const;
}
