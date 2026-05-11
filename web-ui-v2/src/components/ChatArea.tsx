import { useEffect } from "react";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import WelcomeScreen from "./WelcomeScreen";
import { useChatStream } from "../hooks/useChatStream";

interface Props {
  token: string;
  sessionId: string | null;
  onSessionUsed?: (id: string) => void;
}

export default function ChatArea({ token, sessionId, onSessionUsed }: Props) {
  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages } =
    useChatStream(token, sessionId);

  useEffect(() => {
    if (sessionId) {
      loadHistory(sessionId);
    } else {
      clearMessages();
    }
  }, [sessionId, loadHistory, clearMessages]);

  const handleSend = (text: string) => {
    if (sessionId) {
      onSessionUsed?.(sessionId);
    }
    sendMessage(text);
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
      <MessageList messages={messages} />
      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        onStop={stopStreaming}
      />
    </div>
  );
}
