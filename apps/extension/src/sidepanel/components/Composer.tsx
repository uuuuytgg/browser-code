import { useState } from "react";

type Props = {
  disabled: boolean;
  placeholder: string;
  sendLabel: string;
  onSend: (text: string) => void;
  platformLabel?: string;
};

/** Chat input area: textarea + send button, with optional platform badge. */
export function Composer({ disabled, placeholder, sendLabel, onSend, platformLabel }: Props) {
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
          className="primary-button"
          disabled={disabled || !input.trim()}
          onClick={handleSend}
        >
          {sendLabel}
        </button>
      </div>
      {platformLabel && (
        <div className="platform-badge">{platformLabel}</div>
      )}
    </section>
  );
}
