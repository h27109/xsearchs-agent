import { useState, useCallback, useEffect } from "react";
import { ConfigProvider, theme, Drawer, Button, App } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import type { AuthState } from "../api/auth";
import { logout as apiLogout } from "../api/auth";
import { useSessions } from "../hooks/useSessions";
import type { AgentInfo } from "../api/sessions";
import { getAgentTemplateList } from "../api/sessions";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";
import AdminPanel from "./AdminPanel";
import ChangePasswordModal from "./ChangePasswordModal";

interface Props {
  auth: AuthState;
  onLogout: () => void;
}

const MOBILE_BREAKPOINT = 768;

export default function ChatLayout({ auth, onLogout }: Props) {
  const {
    sessions,
    currentId,
    pendingIds,
    selectSession,
    createNewSession,
    persistSession,
    deleteSessionById,
    renameSessionById,
  } = useSessions(auth.token);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    getAgentTemplateList(auth.token).then(setAgents).catch(() => {});
  }, [auth.token]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = useCallback(async () => {
    await apiLogout(auth.token);
    onLogout();
  }, [auth.token, onLogout]);

  const handleCreate = useCallback(async (agentId: string) => {
    await createNewSession(agentId);
    if (isMobile) setDrawerOpen(false);
  }, [createNewSession, isMobile]);

  const handleSelect = useCallback(
    (id: string) => {
      selectSession(id);
      if (isMobile) setDrawerOpen(false);
    },
    [selectSession, isMobile]
  );

  const sidebarContent = (
    <Sidebar
      auth={auth}
      sessions={sessions}
      currentId={currentId}
      agents={agents}
      onSelect={handleSelect}
      onCreate={handleCreate}
      onDelete={deleteSessionById}
      onRename={renameSessionById}
      onLogout={handleLogout}
      onAdmin={() => {
        setAdminOpen(true);
        if (isMobile) setDrawerOpen(false);
      }}
      onChangePassword={() => {
        setPwdOpen(true);
        if (isMobile) setDrawerOpen(false);
      }}
    />
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#615CED",
          colorBgContainer: "#1a1a1a",
          colorBgElevated: "#2a2a2a",
          colorBorder: "rgba(255,255,255,0.06)",
          colorText: "#ddd",
        },
      }}
    >
      <App>
        <div
          style={{
            display: "flex",
            height: "100vh",
            width: "100vw",
            overflow: "hidden",
            background: "#141414",
          }}
        >
          {/* Desktop sidebar */}
          {!isMobile && (
            <div style={{ width: 280, flexShrink: 0 }}>{sidebarContent}</div>
          )}

          {/* Main chat area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
            {/* Mobile header bar */}
            {isMobile && (
              <div
                style={{
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: "#1a1a1a",
                  flexShrink: 0,
                }}
              >
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={() => setDrawerOpen(true)}
                  style={{ color: "#ccc" }}
                />
                <span style={{ color: "#ddd", marginLeft: 12, fontSize: 15, fontWeight: 500 }}>
                  XSearchs Agent
                </span>
              </div>
            )}

            <ChatArea
              token={auth.token}
              sessionId={currentId}
              isPending={currentId ? pendingIds.has(currentId) : false}
              agentId={
                currentId
                  ? sessions.find((s) => s.id === currentId)?.agent_id
                  : undefined
              }
              onSessionUsed={selectSession}
              onCreateSession={() => createNewSession("simple-react-agent")}
              onPersistSession={(id, name, agentId) =>
                persistSession(id, name, agentId || "simple-react-agent")
              }
            />
          </div>

          {/* Mobile drawer */}
          {isMobile && (
            <Drawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              placement="left"
              width={280}
              styles={{
                body: { padding: 0, background: "#1a1a1a" },
                header: { display: "none" },
              }}
              style={{ background: "#1a1a1a" }}
            >
              {sidebarContent}
            </Drawer>
          )}
        </div>

        <AdminPanel
          open={adminOpen}
          token={auth.token}
          onClose={() => setAdminOpen(false)}
        />
        <ChangePasswordModal
          open={pwdOpen}
          token={auth.token}
          onClose={() => setPwdOpen(false)}
        />
      </App>
    </ConfigProvider>
  );
}
