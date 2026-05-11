import { useState } from "react";
import { Button, Popconfirm, Input, Typography, Dropdown } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  TeamOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import type { SessionInfo } from "../api/sessions";
import type { AuthState } from "../api/auth";

const { Text } = Typography;

interface Props {
  auth: AuthState;
  sessions: SessionInfo[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onLogout: () => void;
  onAdmin: () => void;
  onChangePassword: () => void;
}

export default function Sidebar({
  auth,
  sessions,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onLogout,
  onAdmin,
  onChangePassword,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const userMenuItems = [
    {
      key: "change-password",
      icon: <KeyOutlined />,
      label: "修改密码",
      onClick: onChangePassword,
    },
    ...(auth.is_admin
      ? [
          {
            key: "admin",
            icon: <TeamOutlined />,
            label: "用户管理",
            onClick: onAdmin,
          },
        ]
      : []),
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "登出",
      danger: true,
      onClick: onLogout,
    },
  ];

  const handleFinishEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#171717",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 12px 8px",
        }}
      >
        <Button
          block
          icon={<PlusOutlined />}
          onClick={onCreate}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#ccc",
            height: 36,
          }}
        >
          新对话
        </Button>
      </div>

      {/* Session list */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 8px",
        }}
      >
        {sessions.map((session) => {
          const isActive = currentId === session.id;
          const isHovered = hoveredId === session.id;
          const isEditing = editingId === session.id;

          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                borderRadius: 8,
                marginBottom: 2,
                background: isActive
                  ? "rgba(97,94,205,0.12)"
                  : isHovered
                    ? "rgba(255,255,255,0.04)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <MessageOutlined
                  style={{ fontSize: 12, color: "#666", flexShrink: 0 }}
                />
                {isEditing ? (
                  <Input
                    size="small"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onPressEnter={handleFinishEdit}
                    onBlur={handleFinishEdit}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      color: "#fff",
                      borderRadius: 4,
                    }}
                  />
                ) : (
                  <Text
                    ellipsis
                    style={{
                      color: isActive ? "#e0e0e0" : "#999",
                      fontSize: 13,
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingId(session.id);
                      setEditName(session.name);
                    }}
                  >
                    {session.name || `会话 ${session.id.slice(0, 8)}`}
                  </Text>
                )}
              </div>

              {/* Action buttons on hover */}
              {(isHovered || isActive) && (
                <div
                  style={{ display: "flex", gap: 0, flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Popconfirm
                    title="确定删除此会话?"
                    onConfirm={() => onDelete(session.id)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      style={{ color: "#666", fontSize: 11 }}
                    />
                  </Popconfirm>
                </div>
              )}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#555",
              fontSize: 13,
              padding: "40px 0",
            }}
          >
            暂无对话
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Dropdown menu={{ items: userMenuItems }} placement="topRight">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "transparent";
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(97,94,205,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UserOutlined style={{ color: "#615CED", fontSize: 13 }} />
            </div>
            <Text style={{ color: "#aaa", fontSize: 13 }}>{auth.user_id}</Text>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
