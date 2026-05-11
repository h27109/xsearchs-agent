import { useState, useMemo, useCallback } from "react";
import {
  AgentScopeRuntimeWebUI,
  IAgentScopeRuntimeWebUISession,
  IAgentScopeRuntimeWebUISessionAPI,
} from "@agentscope-ai/chat";
import { Button, Space, Dropdown } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { AuthState, logout, clearAuth } from "../api/auth";
import {
  getSessionList,
  getSessionMessages,
  createSession,
  updateSessionName,
  deleteSession,
} from "../api/sessions";
import AdminPanel from "./AdminPanel";
import ChangePasswordModal from "./ChangePasswordModal";

const CHAT_URL = "/api/chat/process";

interface ChatAppProps {
  auth: AuthState;
  onLogout: () => void;
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");
  return content
    .map((block: Record<string, unknown>) => {
      switch (block.type) {
        case "text":
          return block.text || "";
        case "thinking":
          return `> 💭 **Thinking**\n>\n> ${String(block.thinking || "").replace(/\n/g, "\n> ")}`;
        case "tool_use": {
          const inputStr = JSON.stringify(block.input || {}, null, 2)
            .replace(/\n/g, "\n> ");
          return `> 🔧 **Tool: ${block.name || ""}**\n>\n> \`\`\`json\n> ${inputStr}\n> \`\`\``;
        }
        case "tool_result":
          return `> 📋 **Tool Result**\n>\n> ${block.content || ""}`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

class BackendSessionApi implements IAgentScopeRuntimeWebUISessionAPI {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getSessionList(): Promise<IAgentScopeRuntimeWebUISession[]> {
    const sessions = await getSessionList(this.token);
    return sessions.map((s) => ({
      id: s.id,
      name: s.name || `会话 ${s.id.slice(0, 8)}`,
      messages: [],
    }));
  }

  async getSession(
    sessionId: string
  ): Promise<IAgentScopeRuntimeWebUISession> {
    if (!sessionId) {
      return { id: "", name: "", messages: [] };
    }
    const messages = await getSessionMessages(this.token, sessionId);
    return {
      id: sessionId,
      name: "",
      messages: messages.map(
        (m: Record<string, unknown>) => {
          const { _index: _i, content, ...rest } = m as Record<string, unknown> & {
            _index: number;
            content: unknown;
          };
          return {
            ...rest,
            content: flattenContent(content),
          };
        }
      ) as IAgentScopeRuntimeWebUISession["messages"],
    };
  }

  async createSession(
    session: Partial<IAgentScopeRuntimeWebUISession>
  ): Promise<IAgentScopeRuntimeWebUISession[]> {
    if (!session.id) {
      session.id = crypto.randomUUID();
    }
    await createSession(this.token, session.name || "", session.id);
    return this.getSessionList();
  }

  async updateSession(
    session: Partial<IAgentScopeRuntimeWebUISession>
  ): Promise<IAgentScopeRuntimeWebUISession[]> {
    if (session.id && session.name) {
      await updateSessionName(this.token, session.id, session.name);
    }
    return this.getSessionList();
  }

  async removeSession(
    session: Partial<IAgentScopeRuntimeWebUISession>
  ): Promise<IAgentScopeRuntimeWebUISession[]> {
    if (session.id) {
      await deleteSession(this.token, session.id);
    }
    return this.getSessionList();
  }
}

export default function ChatApp({ auth, onLogout }: ChatAppProps) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const sessionApi = useMemo(
    () => new BackendSessionApi(auth.token),
    [auth.token]
  );

  const handleLogout = useCallback(async () => {
    await logout(auth.token);
    clearAuth();
    onLogout();
  }, [auth.token, onLogout]);

  const userMenuItems = [
    {
      key: "change-password",
      icon: <KeyOutlined />,
      label: "修改密码",
      onClick: () => setPwdOpen(true),
    },
    ...(auth.is_admin
      ? [
          {
            key: "admin",
            icon: <TeamOutlined />,
            label: "用户管理",
            onClick: () => setAdminOpen(true),
          },
        ]
      : []),
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "登出",
      onClick: handleLogout,
    },
  ];

  const rightHeader = (
    <Space>
      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Button icon={<UserOutlined />}>{auth.user_id}</Button>
      </Dropdown>
    </Space>
  );

  const options = useMemo(
    () => {
      console.log('[DEBUG] rightHeader:', typeof rightHeader, !!rightHeader, rightHeader);
      return {
        api: {
          baseURL: CHAT_URL,
          token: auth.token,
        },
        theme: {
          darkMode: true,
          colorPrimary: "#615CED",
          rightHeader,
          leftHeader: {
            logo: "https://img.alicdn.com/imgextra/i2/O1CN01lmoGYn1kjoXATy4PX_!!6000000004720-2-tps-200-200.png",
            title: "XSearchs Agent",
          },
        },
        welcome: {
          greeting: "你好，有什么可以帮助你的?",
          description:
            "我是支付清算助手，可以帮你查询商户信息、交易对账、清算结算等业务。",
          avatar:
            "https://img.alicdn.com/imgextra/i2/O1CN01lmoGYn1kjoXATy4PX_!!6000000004720-2-tps-200-200.png",
          prompts: [
            { value: "你好" },
            { value: "帮我查询商户信息" },
            { value: "查询交易流水" },
          ],
        },
        session: {
          multiple: true,
          api: sessionApi,
        },
      };
    },
    [auth.token, sessionApi, rightHeader]
  );

  console.log('[DEBUG] options.theme keys:', Object.keys(options.theme), 'rightHeader:', !!options.theme.rightHeader);
  return (
    <div style={{ height: "100vh" }}>
      <AgentScopeRuntimeWebUI options={options as unknown as Record<string, unknown>} />
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
    </div>
  );
}
