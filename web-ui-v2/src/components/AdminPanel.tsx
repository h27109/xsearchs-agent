import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Table,
  Button,
  Input,
  Space,
  Popconfirm,
  App,
} from "antd";
import {
  UserAddOutlined,
  KeyOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  UserInfo,
} from "../api/users";

interface Props {
  open: boolean;
  token: string;
  onClose: () => void;
}

export default function AdminPanel({ open, token, onClose }: Props) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const { message } = App.useApp();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUsers(token);
      setUsers(data);
    } catch {
      message.error("加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [token, message]);

  useEffect(() => {
    if (open) fetchUsers();
  }, [open, fetchUsers]);

  const handleAddUser = async () => {
    if (!newUserId.trim()) return;
    setAdding(true);
    try {
      await createUser(token, newUserId.trim());
      message.success(`用户 "${newUserId.trim()}" 创建成功`);
      setNewUserId("");
      fetchUsers();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (user: UserInfo) => {
    try {
      await updateUser(token, user.id, { is_active: !user.is_active });
      message.success(
        user.is_active ? `已禁用用户 "${user.id}"` : `已启用用户 "${user.id}"`
      );
      fetchUsers();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      await resetUserPassword(token, userId);
      message.success(`已重置用户 "${userId}" 的密码`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "重置失败");
    }
  };

  const columns = [
    { title: "用户名", dataIndex: "id", key: "id" },
    {
      title: "角色",
      dataIndex: "is_admin",
      key: "is_admin",
      render: (v: boolean) => (v ? "管理员" : "普通用户"),
    },
    {
      title: "状态",
      dataIndex: "is_active",
      key: "is_active",
      render: (v: boolean) => (
        <span style={{ color: v ? "#52c41a" : "#ff4d4f" }}>
          {v ? "正常" : "已禁用"}
        </span>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, record: UserInfo) =>
        record.id !== "admin" ? (
          <Space>
            <Button
              size="small"
              type="link"
              icon={<KeyOutlined />}
              onClick={() => handleResetPassword(record.id)}
            >
              重置密码
            </Button>
            <Popconfirm
              title={record.is_active ? "确定禁用该用户?" : "确定启用该用户?"}
              onConfirm={() => handleToggleActive(record)}
            >
              <Button
                size="small"
                type="link"
                danger={record.is_active}
                icon={
                  record.is_active ? <StopOutlined /> : <CheckCircleOutlined />
                }
              >
                {record.is_active ? "禁用" : "启用"}
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <Modal
      title="用户管理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnClose
    >
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="新用户名"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          onPressEnter={handleAddUser}
          style={{ width: 200 }}
        />
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          loading={adding}
          onClick={handleAddUser}
        >
          添加用户
        </Button>
      </Space>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />
    </Modal>
  );
}
