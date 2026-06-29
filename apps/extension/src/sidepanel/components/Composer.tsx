import { useState } from "react";

type Props = {
  disabled: boolean;
  placeholder: string;
  sendLabel: string;
  onSend: (text: string) => void;
  platformLabel?: string;
};

/* Inline Lucide icons */
const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" />
  </svg>
);

/** Chat input area: textarea + send button. */
export function Composer({ disabled, placeholder, sendLabel: _sendLabel, onSend, platformLabel }: Props) {
  const [input, setInput] = useState("");

  function handleSend() {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <section className="composer">
      <div className="input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
        />
        <button
          type="button"
          className="send-button"
          disabled={disabled || !input.trim()}
          onClick={handleSend}
          title="发送"
        >
          <SendIcon />
        </button>
      </div>
      {platformLabel && (
        <div className="platform-badge">{platformLabel}</div>
      )}
    </section>
  );
}
