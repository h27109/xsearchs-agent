import { useState } from "react";
import { Button, Input, Form, App, Card, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login, setAuth, AuthState } from "../api/auth";

const { Title } = Typography;

interface Props {
  onLogin: (auth: AuthState) => void;
  onNeedSetPassword: (userId: string) => void;
}

export default function LoginPage({ onLogin, onNeedSetPassword }: Props) {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const handleSubmit = async (values: { id: string; password: string }) => {
    setLoading(true);
    try {
      const result = await login(values.id, values.password);
      if (result.need_set_password) {
        onNeedSetPassword(result.user_id);
      } else {
        const auth: AuthState = {
          user_id: result.user_id,
          password: values.password,
          is_admin: result.is_admin || false,
        };
        setAuth(auth);
        onLogin(auth);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#141414",
      }}
    >
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: "center", marginBottom: 24 }}>
          XSearchs Agent
        </Title>
        <Form onFinish={handleSubmit} layout="vertical" size="large">
          <Form.Item
            name="id"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
            />
          </Form.Item>
          <Form.Item name="password" label="密码">
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="输入密码（首次登录可留空）"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
