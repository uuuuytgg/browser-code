import type { AgentStatus } from "../hooks/useAgentStatus";
import { BrowserCodeLogo } from "./BrowserCodeLogo";

type Props = {
  connected: boolean;
  status: AgentStatus;
  statusMessage: string;
  currentUrl?: string;
};

/* Inline Lucide globe icon */
const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" x2="22" y1="12" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const STATUS_DOT: Record<string, { cls: string; label: string }> = {
  idle:   { cls: "s-err", label: "就绪" },
  busy:   { cls: "s-busy", label: "工作中" },
  success:{ cls: "s-ok", label: "完成" },
  error:  { cls: "s-err", label: "失败" },
};

export function StatusBar({ connected, status, statusMessage }: Props) {
  const dot = connected ? STATUS_DOT[status] : STATUS_DOT.error;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">
          <BrowserCodeLogo />
        </div>
      </div>
      <div className="topbar-meta">
        <p>{connected ? statusMessage : "等待后端"}</p>
        <span className={`status-dot ${dot.cls}`} title={dot.label} />
      </div>
    </header>
  );
}
