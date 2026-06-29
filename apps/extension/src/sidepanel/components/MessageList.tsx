import type { ChatMessage } from "./chatTypes";

type Props = { message: ChatMessage };

export function MessageBubble({ message }: Props) {
  return <article className={`message message-${message.role}`}>{message.text}</article>;
}

type ListProps = { messages: ChatMessage[]; onEmpty?: React.ReactNode };

export function MessageList({ messages, onEmpty }: ListProps) {
  if (!messages.length && onEmpty) return <>{onEmpty}</>;
  return (
    <section className="messages" aria-live="polite">
      {messages.map(m => <MessageBubble key={m.id} message={m} />)}
    </section>
  );
}

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export function DefaultEmptyState() {
  return (
    <div className="empty-state">
      <Icon />
      <h2>Browser Code</h2>
      <p>输入消息或点击快捷按钮开始</p>
    </div>
  );
}
