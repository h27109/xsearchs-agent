import { useState } from "react";
import { Button, Input, Form, App, Card, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { login, setAuth, AuthState } from "../api/auth";

const { Title } = Typography;

interface Props {
  userId: string;
  onSuccess: (auth: AuthState) => void;
}

export default function SetPasswordPage({ userId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const handleSubmit = async (values: {
    password: string;
    confirm: string;
  }) => {
    if (values.password !== values.confirm) {
      message.error("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const result = await login(userId, values.password);
      if (result.token) {
        const auth: AuthState = {
          token: result.token,
          user_id: result.user_id,
          is_admin: result.is_admin || false,
        };
        setAuth(auth);
        onSuccess(auth);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "设置密码失败");
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
          首次登录 - 设置密码
        </Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: "center" }}
        >
          用户 "{userId}" 首次登录，请设置密码
        </Typography.Paragraph>
        <Form onFinish={handleSubmit} layout="vertical" size="large">
          <Form.Item
            name="password"
            label="新密码"
            rules={[{ required: true, message: "请输入新密码" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="输入新密码"
            />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            rules={[{ required: true, message: "请确认密码" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="确认新密码"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              设置密码并登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
