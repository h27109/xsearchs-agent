import { useState, useCallback, useEffect } from "react";
import {
  SessionInfo,
  getSessionList,
  createSession,
  updateSessionName,
  deleteSession,
} from "../api/sessions";

function generateId(): string {
  const now = new Date();
  const ts = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

export function useSessions(token: string) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getSessionList(token);
      setSessions(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectSession = useCallback((id: string | null) => {
    setCurrentId(id);
  }, []);

  const createNewSession = useCallback(async (agentId?: string) => {
    const id = generateId();
    const local: SessionInfo = { id, user_id: "", name: "新会话", msg_count: 0, agent_id: agentId || "simple-react-agent" };
    setSessions((prev) => [local, ...prev]);
    setPendingIds((prev) => new Set(prev).add(id));
    setCurrentId(id);
    return id;
  }, []);

  const persistSession = useCallback(
    async (id: string, name: string, agentId?: string) => {
      if (!pendingIds.has(id)) return;
      try {
        await createSession(token, name, id, agentId);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, name } : s))
        );
      } catch {
        // ignore
      }
    },
    [token, pendingIds]
  );

  const deleteSessionById = useCallback(
    async (id: string) => {
      try {
        if (!pendingIds.has(id)) {
          await deleteSession(token, id);
        }
        if (currentId === id) setCurrentId(null);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } catch {
        // ignore
      }
    },
    [token, currentId, pendingIds]
  );

  const renameSessionById = useCallback(
    async (id: string, name: string) => {
      if (pendingIds.has(id)) {
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, name } : s))
        );
        return;
      }
      try {
        await updateSessionName(token, id, name);
        await refresh();
      } catch {
        // ignore
      }
    },
    [token, refresh, pendingIds]
  );

  return {
    sessions,
    currentId,
    pendingIds,
    loading,
    selectSession,
    createNewSession,
    persistSession,
    deleteSessionById,
    renameSessionById,
    refresh,
  };
}
