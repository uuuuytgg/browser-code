import type { AgentTaskStatus } from "../../capture/types";
import { platformLabel } from "../hooks/pageCapture";

type Props = {
  connected: boolean;
  status: AgentTaskStatus;
  statusMessage: string;
  currentUrl?: string;
};

const STATUS_DOT = {
  idle: "status-err",
  capturing: "status-busy",
  sending: "status-busy",
  processing: "status-busy",
  need_confirmation: "status-warn",
  done: "status-ok",
  error: "status-err",
} as const;

/** Top header bar with connection status, task status, and optionally platform badge. */
export function StatusBar({ connected, status, statusMessage, currentUrl }: Props) {
  const dotClass = connected ? STATUS_DOT[status] : "status-err";
  const dotTitle = connected
    ? `状态: ${statusMessage}`
    : "未连接 — 请确认终端已运行 `browser-code serve`";

  return (
    <header className="topbar">
      <div>
        <h1>Browser Code</h1>
        <div className="topbar-meta">
          <p>{connected ? statusMessage : "等待后端"}</p>
          {currentUrl && (
            <span className="platform-badge">{platformLabel(currentUrl)}</span>
          )}
        </div>
      </div>
      <span className={`status-dot ${dotClass}`} title={dotTitle} />
    </header>
  );
}
