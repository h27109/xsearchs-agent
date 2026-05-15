import { MANAGE_URL, getAuthHeader } from "./auth";

export interface AgentInfo {
  name: string;
  description: string;
  provider: string;
  model: string;
  color: string;
}

export interface SessionInfo {
  id: string;
  user_id: string;
  name: string;
  msg_count: number;
  agent_id: string;
}

export async function getAgentTemplateList(): Promise<AgentInfo[]> {
  const resp = await fetch(`${MANAGE_URL}/agent-templates`);
  if (!resp.ok) throw new Error("Failed to fetch agent templates");
  const data = await resp.json();
  return data.agent_templates || [];
}

export async function getSessionList(): Promise<SessionInfo[]> {
  const resp = await fetch(`${MANAGE_URL}/sessions`, {
    headers: { Authorization: getAuthHeader() },
  });
  if (!resp.ok) throw new Error("Failed to fetch sessions");
  const data = await resp.json();
  return data.sessions || [];
}

export async function createSession(
  name: string,
  id?: string,
  agentId?: string
): Promise<SessionInfo> {
  const body: Record<string, string> = { name };
  if (id) body.id = id;
  if (agentId) body.agent_id = agentId;
  const resp = await fetch(`${MANAGE_URL}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error("Failed to create session");
  return resp.json();
}

export async function updateSessionName(
  sessionId: string,
  name: string
): Promise<void> {
  await fetch(`${MANAGE_URL}/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ name }),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${MANAGE_URL}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: getAuthHeader() },
  });
}

export async function getSessionMessages(
  sessionId: string
): Promise<Record<string, unknown>[]> {
  if (!sessionId) return [];
  const resp = await fetch(`${MANAGE_URL}/sessions/${sessionId}/messages`, {
    headers: { Authorization: getAuthHeader() },
  });
  if (!resp.ok) throw new Error("Failed to fetch messages");
  const data = await resp.json();
  return data.messages || [];
}

// =============================================================================
// Agent Template CRUD
// =============================================================================

export interface TemplateContent {
  name: string;
  description: string;
  provider: string;
  model: string;
  color: string;
  mcp: string[];
  tools: string[];
  system_prompt: string;
}

export interface GenerateResult {
  identifier: string;
  when_to_use: string;
  system_prompt: string;
  provider: string;
  model: string;
  color: string;
  mcp: string[];
  tools: string[];
}

export async function getTemplate(name: string): Promise<TemplateContent> {
  const resp = await fetch(
    `${MANAGE_URL}/agent-templates/${encodeURIComponent(name)}`,
    { headers: { Authorization: getAuthHeader() } }
  );
  if (!resp.ok) throw new Error("获取模板失败");
  return resp.json();
}

export async function createTemplate(
  payload: TemplateContent
): Promise<{ message: string }> {
  const resp = await fetch(`${MANAGE_URL}/agent-templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "创建失败" }));
    throw new Error(err.detail || "创建失败");
  }
  return resp.json();
}

export async function updateTemplate(
  name: string,
  payload: TemplateContent
): Promise<{ message: string }> {
  const resp = await fetch(
    `${MANAGE_URL}/agent-templates/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(payload),
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "更新失败" }));
    throw new Error(err.detail || "更新失败");
  }
  return resp.json();
}

export async function deleteTemplate(
  name: string
): Promise<{ message: string }> {
  const resp = await fetch(
    `${MANAGE_URL}/agent-templates/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
      headers: { Authorization: getAuthHeader() },
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "删除失败" }));
    throw new Error(err.detail || "删除失败");
  }
  return resp.json();
}

export type GenerateEventType = "delta" | "completed" | "error";

export interface GenerateStreamEvent {
  event: GenerateEventType;
  data: Record<string, unknown>;
}

export async function generateTemplateStream(
  prompt: string,
  onEvent: (event: GenerateStreamEvent) => void,
  signal?: AbortSignal
): Promise<GenerateResult> {
  const resp = await fetch(`${MANAGE_URL}/agent-templates/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "生成失败" }));
    throw new Error(err.detail || "生成失败");
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      let eventType: GenerateEventType = "delta";
      let eventData: Record<string, unknown> = {};

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim() as GenerateEventType;
        } else if (line.startsWith("data: ")) {
          try {
            eventData = JSON.parse(line.slice(6));
          } catch {
            // skip
          }
        }
      }

      onEvent({ event: eventType, data: eventData });

      if (eventType === "error") {
        throw new Error(
          (eventData.message as string) || "生成失败"
        );
      }

      if (eventType === "completed") {
        result = eventData as unknown as GenerateResult;
      }
    }
  }

  if (!result) {
    throw new Error("未收到生成结果");
  }
  return result;
}
