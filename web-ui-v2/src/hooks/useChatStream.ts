import { useState, useRef, useCallback } from "react";

export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | unknown;
  output?: unknown;
}

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: ContentBlock[] | string;
}

function normalizeContent(raw: unknown): ContentBlock[] | string {
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw)) return String(raw || "");
  return raw as ContentBlock[];
}

function normalizeMessages(raw: Record<string, unknown>[]): Message[] {
  return raw.map((m) => ({
    id: m.id as string | undefined,
    role: (m.role as string) || "assistant",
    content: normalizeContent(m.content),
  }));
}

const CHAT_URL = "/api/chat/process";

export function useChatStream(token: string, sessionId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(
    async (sid: string) => {
      if (!sid) return;
      try {
        const resp = await fetch(`/api/manage/sessions/${sid}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          setMessages(normalizeMessages(data.messages || []));
        }
      } catch {
        // ignore
      }
    },
    [token]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim()) return;

      const userMsg: Message = { role: "user", content: text.trim() };
      const assistantMsg: Message = {
        role: "assistant",
        content: [{ type: "text", text: "" }],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            input: [{ role: "user", content: [{ type: "text", text: text.trim() }] }],
            session_id: sessionId,
            stream: true,
          }),
          signal: abortController.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || err.error || `HTTP ${resp.status}`);
        }

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const lines = part.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6);
              if (!jsonStr.trim()) continue;

              try {
                const event = JSON.parse(jsonStr);

                if (event.object === "content" && event.type === "text") {
                  // Text delta
                  const delta = event.text || "";
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") {
                      const content = Array.isArray(last.content)
                        ? last.content
                        : [{ type: "text" as const, text: last.content as string }];
                      const textBlock = content.find(
                        (b: ContentBlock) => b.type === "text"
                      );
                      if (textBlock) {
                        textBlock.text = (textBlock.text || "") + delta;
                      } else {
                        content.push({ type: "text", text: delta });
                      }
                      updated[updated.length - 1] = { ...last, content: [...content] };
                    }
                    return updated;
                  });
                } else if (
                  event.object === "content" &&
                  event.type === "thinking"
                ) {
                  const delta = event.thinking || "";
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") {
                      const content = Array.isArray(last.content)
                        ? last.content
                        : [{ type: "text" as const, text: last.content as string }];
                      const thinkBlock = content.find(
                        (b: ContentBlock) => b.type === "thinking"
                      );
                      if (thinkBlock) {
                        thinkBlock.thinking =
                          (thinkBlock.thinking || "") + delta;
                      } else {
                        content.unshift({ type: "thinking", thinking: delta });
                      }
                      updated[updated.length - 1] = { ...last, content: [...content] };
                    }
                    return updated;
                  });
                } else if (
                  event.object === "response" &&
                  event.status === "completed" &&
                  event.output
                ) {
                  // Final message with complete content
                  const outputMsgs = event.output.filter(
                    (o: Record<string, unknown>) => o.object === "message"
                  );
                  if (outputMsgs.length > 0) {
                    const lastMsg = outputMsgs[outputMsgs.length - 1];
                    const finalContent = normalizeContent(lastMsg.content);
                    setMessages((prev) => {
                      const updated = [...prev];
                      // Replace the last assistant message
                      const lastIdx = updated.length - 1;
                      if (updated[lastIdx]?.role === "assistant") {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          id: lastMsg.id as string,
                          content: finalContent,
                        };
                      }
                      return updated;
                    });
                  }
                } else if (event.error) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: [
                          {
                            type: "text",
                            text: `❌ Error: ${event.error.message || event.error}`,
                          },
                        ],
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // skip unparseable events
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: [
                  {
                    type: "text",
                    text: `❌ 请求失败: ${(err as Error).message}`,
                  },
                ],
              };
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [token, sessionId]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages };
}
