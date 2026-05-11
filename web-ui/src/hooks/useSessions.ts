import { useState, useCallback, useEffect } from "react";
import {
  SessionInfo,
  getSessionList,
  createSession,
  updateSessionName,
  deleteSession,
} from "../api/sessions";

export function useSessions(token: string) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const createNewSession = useCallback(async () => {
    const id = crypto.randomUUID();
    try {
      await createSession(token, "新会话", id);
      await refresh();
      setCurrentId(id);
      return id;
    } catch {
      return null;
    }
  }, [token, refresh]);

  const deleteSessionById = useCallback(
    async (id: string) => {
      try {
        await deleteSession(token, id);
        if (currentId === id) setCurrentId(null);
        await refresh();
      } catch {
        // ignore
      }
    },
    [token, currentId, refresh]
  );

  const renameSessionById = useCallback(
    async (id: string, name: string) => {
      try {
        await updateSessionName(token, id, name);
        await refresh();
      } catch {
        // ignore
      }
    },
    [token, refresh]
  );

  return {
    sessions,
    currentId,
    loading,
    selectSession,
    createNewSession,
    deleteSessionById,
    renameSessionById,
    refresh,
  };
}
