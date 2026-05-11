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

  // Track streaming state: map msg_id → { type: "reasoning"|"message", textParts: string[] }
  const streamStateRef = useRef<Map<string, { msgType: string; textParts: string[] }>>(new Map());

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
      // Placeholder assistant message — will be built up from SSE events
      const assistantMsg: Message = {
        role: "assistant",
        content: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Reset stream state
      streamStateRef.current.clear();

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

                // New message starts — record its type and msg_id
                if (event.object === "message" && event.status === "in_progress") {
                  streamStateRef.current.set(event.id, {
                    msgType: event.type || "message", // "reasoning" or "message"
                    textParts: [],
                  });
                }

                // Text delta — append to the corresponding msg_id
                if (event.object === "content" && event.type === "text" && event.delta && event.msg_id) {
                  const state = streamStateRef.current.get(event.msg_id);
                  if (state) {
                    state.textParts.push(event.text || "");
                  }

                  // Rebuild assistant message content from all tracked msg states
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role !== "assistant") return prev;

                    const contentBlocks: ContentBlock[] = [];
                    for (const [msgId, s] of streamStateRef.current) {
                      const fullText = s.textParts.join("");
                      if (s.msgType === "reasoning" && fullText) {
                        contentBlocks.push({ type: "thinking", thinking: fullText, id: msgId });
                      } else if (fullText) {
                        contentBlocks.push({ type: "text", text: fullText, id: msgId });
                      }
                    }

                    updated[updated.length - 1] = { ...last, content: contentBlocks.length > 0 ? contentBlocks : last.content };
                    return updated;
                  });
                }

                // Completed response — replace with final structured content
                if (event.object === "response" && event.status === "completed" && event.output) {
                  const outputMsgs = event.output.filter(
                    (o: Record<string, unknown>) => o.object === "message"
                  );
                  if (outputMsgs.length > 0) {
                    // Combine all output messages into content blocks
                    const allBlocks: ContentBlock[] = [];
                    for (const outMsg of outputMsgs) {
                      const msgContent = normalizeContent(outMsg.content);
                      const msgType = outMsg.type as string;
                      if (typeof msgContent === "string") {
                        if (msgType === "reasoning") {
                          allBlocks.push({ type: "thinking", thinking: msgContent });
                        } else {
                          allBlocks.push({ type: "text", text: msgContent });
                        }
                      } else {
                        for (const block of msgContent as ContentBlock[]) {
                          // Map "reasoning" message content blocks to "thinking"
                          if (msgType === "reasoning" && block.type === "text") {
                            allBlocks.push({ type: "thinking", thinking: block.text || "" });
                          } else {
                            allBlocks.push(block);
                          }
                        }
                      }
                    }

                    setMessages((prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (updated[lastIdx]?.role === "assistant") {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          id: outputMsgs[outputMsgs.length - 1].id as string,
                          content: allBlocks,
                        };
                      }
                      return updated;
                    });
                  }
                }

                if (event.error) {
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
        streamStateRef.current.clear();
      }
    },
    [token, sessionId]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, sendMessage, stopStreaming, loadHistory, clearMessages };
}
