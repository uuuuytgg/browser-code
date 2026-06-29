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

/* Inline Lucide icons */
const CodeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="topbar-icon">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" x2="22" y1="12" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

/** Top header bar with connection status, task status, and platform badge. */
export function StatusBar({ connected, status, statusMessage, currentUrl }: Props) {
  const dotClass = connected ? STATUS_DOT[status] : "status-err";
  const dotTitle = connected
    ? `状态: ${statusMessage}`
    : "未连接";

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <CodeIcon />
        <h1>Browser&nbsp;Code</h1>
      </div>
      <div className="topbar-meta">
        <p>{connected ? statusMessage : "等待后端"}</p>
        {currentUrl && currentUrl.length > 0 && (
          <span className="platform-badge">
            <GlobeIcon />
            {platformLabel(currentUrl)}
          </span>
        )}
        <span className={`status-dot ${dotClass}`} title={dotTitle} />
      </div>
    </header>
  );
}
