import type { ChatMessage } from "./chatTypes";

type Props = {
  message: ChatMessage;
};

/** Renders a single chat bubble with role-appropriate styling. */
export function MessageBubble({ message }: Props) {
  return (
    <article className={`message message-${message.role}`}>
      {message.text}
    </article>
  );
}

type ListProps = {
  messages: ChatMessage[];
};

/** Scrollable message list with auto-scroll to bottom on new messages. */
export function MessageList({ messages }: ListProps) {
  return (
    <section className="messages" aria-live="polite">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </section>
  );
}
