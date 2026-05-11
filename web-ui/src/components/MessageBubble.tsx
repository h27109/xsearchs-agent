import { useMemo } from "react";
import { Collapse, Typography } from "antd";
import {
  ToolOutlined,
  FileTextOutlined,
  BulbOutlined,
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, ContentBlock } from "../hooks/useChatStream";

const { Text, Paragraph } = Typography;

function renderContentBlock(block: ContentBlock, idx: number) {
  switch (block.type) {
    case "text":
      return (
        <div key={idx} className="msg-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {block.text || ""}
          </ReactMarkdown>
        </div>
      );
    case "thinking":
      return (
        <Collapse
          key={idx}
          size="small"
          style={{ marginBottom: 8, background: "transparent", border: "1px solid rgba(97,94,205,0.2)" }}
          items={[
            {
              key: "thinking",
              label: (
                <span style={{ color: "#615CED", fontSize: 13 }}>
                  <BulbOutlined /> 思考过程
                </span>
              ),
              children: (
                <Paragraph
                  type="secondary"
                  style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 13 }}
                >
                  {block.thinking || ""}
                </Paragraph>
              ),
            },
          ]}
        />
      );
    case "tool_use":
      return (
        <div
          key={idx}
          style={{
            background: "rgba(97,94,205,0.06)",
            border: "1px solid rgba(97,94,205,0.15)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 4, color: "#615CED" }}>
            <ToolOutlined /> <Text strong style={{ color: "#615CED" }}>{block.name || "tool"}</Text>
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 200,
              color: "#999",
            }}
          >
            {JSON.stringify(block.input || {}, null, 2)}
          </pre>
        </div>
      );
    case "tool_result": {
      const resultText =
        typeof block.content === "string"
          ? block.content
          : typeof block.output === "string"
            ? block.output
            : JSON.stringify(block.content || block.output || "", null, 2);
      return (
        <div
          key={idx}
          style={{
            background: "rgba(82,196,26,0.06)",
            border: "1px solid rgba(82,196,26,0.15)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 4, color: "#52c41a" }}>
            <FileTextOutlined /> <Text strong style={{ color: "#52c41a" }}>工具结果</Text>
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 300,
              color: "#999",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {resultText}
          </pre>
        </div>
      );
    }
    default:
      return null;
  }
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  const content = useMemo(() => {
    if (isUser) {
      const text =
        typeof message.content === "string"
          ? message.content
          : (message.content as ContentBlock[])
              .filter((b) => b.type === "text")
              .map((b) => b.text || "")
              .join("\n");
      return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
    }

    if (typeof message.content === "string") {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>
      );
    }

    return (message.content as ContentBlock[]).map((block, i) =>
      renderContentBlock(block, i)
    );
  }, [message, isUser]);

  if (isUser) {
    // User message: right-aligned, colored bubble
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "8px 0",
        }}
      >
        <div
          style={{
            maxWidth: "80%",
            padding: "10px 16px",
            borderRadius: "18px 18px 4px 18px",
            background: "#615CED",
            color: "#fff",
            fontSize: 14,
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // Assistant message: left-aligned, avatar + content row, no bubble
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 0",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "rgba(97,94,205,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <RobotOutlined style={{ color: "#615CED", fontSize: 16 }} />
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: "#e0e0e0",
          fontSize: 14,
          lineHeight: 1.7,
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}
