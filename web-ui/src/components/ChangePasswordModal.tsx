import { useState } from "react";
import { Modal, Input, Form, App } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { changePassword } from "../api/auth";

interface Props {
  open: boolean;
  token: string;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, token, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (values.new_password !== values.confirm) {
        message.error("两次输入的密码不一致");
        return;
      }
      setLoading(true);
      await changePassword(token, values.old_password, values.new_password);
      message.success("密码修改成功");
      form.resetFields();
      onClose();
    } catch (e: unknown) {
      if (e instanceof Error) {
        message.error(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="old_password"
          label="旧密码"
          rules={[{ required: true, message: "请输入旧密码" }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="输入旧密码"
          />
        </Form.Item>
        <Form.Item
          name="new_password"
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
          rules={[{ required: true, message: "请确认新密码" }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="确认新密码"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
