import { MANAGE_URL } from "./auth";

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

export async function getAgentTemplateList(token: string): Promise<AgentInfo[]> {
  const resp = await fetch(`${MANAGE_URL}/agent-templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to fetch agent templates");
  const data = await resp.json();
  return data.agent_templates || [];
}

export async function getSessionList(token: string): Promise<SessionInfo[]> {
  const resp = await fetch(`${MANAGE_URL}/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to fetch sessions");
  const data = await resp.json();
  return data.sessions || [];
}

export async function createSession(
  token: string,
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
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error("Failed to create session");
  return resp.json();
}

export async function updateSessionName(
  token: string,
  sessionId: string,
  name: string
): Promise<void> {
  await fetch(`${MANAGE_URL}/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
}

export async function deleteSession(
  token: string,
  sessionId: string
): Promise<void> {
  await fetch(`${MANAGE_URL}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getSessionMessages(
  token: string,
  sessionId: string
): Promise<Record<string, unknown>[]> {
  if (!sessionId) return [];
  const resp = await fetch(`${MANAGE_URL}/sessions/${sessionId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to fetch messages");
  const data = await resp.json();
  return data.messages || [];
}
