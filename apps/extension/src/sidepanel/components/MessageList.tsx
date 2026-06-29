import type { ChatMessage } from "./chatTypes";

type Props = { message: ChatMessage };

/** Renders a single chat bubble with role-appropriate styling. */
export function MessageBubble({ message }: Props) {
  return (
    <article className={`message message-${message.role}`}>
      {message.text}
    </article>
  );
}

type ListProps = { messages: ChatMessage[]; onEmpty?: React.ReactNode };

/* Inline Lucide icon for empty state */
const MessageSquareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export function MessageList({ messages, onEmpty }: ListProps) {
  if (messages.length === 0 && onEmpty !== undefined) {
    return <>{onEmpty}</>;
  }

  return (
    <section className="messages" aria-live="polite">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </section>
  );
}

/** Default empty state shown when there are no messages. */
export function DefaultEmptyState() {
  return (
    <div className="empty-state">
      <MessageSquareIcon />
      <h2>Browser Code</h2>
      <p>发送消息或点快捷按钮让 agent 开始工作</p>
    </div>
  );
}
