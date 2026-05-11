import { useState } from "react";
import { Input, Button } from "antd";
import { SendOutlined, PauseCircleOutlined } from "@ant-design/icons";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  onStop?: () => void;
}

export default function ChatInput({ onSend, disabled, onStop }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        padding: "12px 24px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: "8px 12px",
        }}
      >
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="给 XSearchs Agent 发送消息..."
          autoSize={{ minRows: 1, maxRows: 6 }}
          variant="borderless"
          style={{
            flex: 1,
            background: "transparent",
            color: "#fff",
            resize: "none",
          }}
        />
        {disabled && onStop ? (
          <Button
            type="text"
            danger
            icon={<PauseCircleOutlined />}
            onClick={onStop}
            size="middle"
          />
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            size="middle"
            style={{ borderRadius: 8 }}
          />
        )}
      </div>
    </div>
  );
}
