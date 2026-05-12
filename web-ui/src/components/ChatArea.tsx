import { useEffect, useRef } from "react";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import WelcomeScreen from "./WelcomeScreen";
import { useChatStream } from "../hooks/useChatStream";

interface Props {
  sessionId: string | null;
  isPending?: boolean;
  agentId?: string;
  onSessionUsed?: (id: string) => void;
  onCreateSession?: () => Promise<string | null>;
  onPersistSession?: (id: string, name: string, agentId?: string) => Promise<void>;
}

export default function ChatArea({ sessionId, isPending, agentId, onSessionUsed, onCreateSession, onPersistSession }: Props) {
  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages } =
    useChatStream(sessionId);

  const skipLoadRef = useRef(false);

  useEffect(() => {
    if (skipLoadRef.current) {
      skipLoadRef.current = false;
      return;
    }
    if (sessionId) {
      if (isPending) {
        clearMessages();
      } else {
        loadHistory(sessionId);
      }
    } else {
      clearMessages();
    }
  }, [sessionId, isPending, loadHistory, clearMessages]);

  const handleSend = async (text: string) => {
    let sid = sessionId;
    let shouldPersist = false;
    if (!sid && onCreateSession) {
      const newId = await onCreateSession();
      if (!newId) return;
      sid = newId;
      onSessionUsed?.(sid);
      shouldPersist = true;
    } else if (isPending) {
      shouldPersist = true;
    }
    if (sid) {
      if (shouldPersist) {
        const name = text.trim().slice(0, 50) || "新会话";
        skipLoadRef.current = true;
        onPersistSession?.(sid, name, agentId);
      }
      sendMessage(text, sid, agentId);
    }
  };

  if (!sessionId) {
    return <WelcomeScreen onPromptClick={handleSend} />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#141414",
      }}
    >
      {isPending ? (
        <WelcomeScreen onPromptClick={handleSend} />
      ) : (
        <MessageList messages={messages} />
      )}
      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        onStop={stopStreaming}
      />
    </div>
  );
}
