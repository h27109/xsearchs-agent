import { useEffect, useRef } from "react";
import { Empty } from "antd";
import MessageBubble from "./MessageBubble";
import type { Message } from "../hooks/useChatStream";

export default function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Empty
          description="开始对话吧"
          styles={{ description: { color: "#666" } }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: "20px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
        }}
      >
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
