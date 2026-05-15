import { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  Input,
  Space,
  Popconfirm,
  App,
  Form,
  Select,
  Tag,
  Typography,
  Spin,
  ConfigProvider,
  theme,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  RobotOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import type { AgentInfo, TemplateContent, GenerateStreamEvent } from "../api/sessions";
import {
  getAgentTemplateList,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  generateTemplateStream,
} from "../api/sessions";
const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  onBack: () => void;
  onTemplatesChanged: () => void;
}

const EMPTY_TEMPLATE: TemplateContent = {
  name: "",
  description: "",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  color: "none",
  mcp: [],
  tools: [],
  system_prompt: "",
};

const COLOR_OPTIONS = [
  { value: "none", label: "无" },
  { value: "blue", label: "蓝" },
  { value: "green", label: "绿" },
  { value: "orange", label: "橙" },
  { value: "purple", label: "紫" },
  { value: "red", label: "红" },
];

export default function TemplateManager({ onBack, onTemplatesChanged }: Props) {
  const [templates, setTemplates] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const { message } = App.useApp();

  const [editForm] = Form.useForm();

  // Generate dialog
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStreamText, setGenStreamText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAgentTemplateList();
      setTemplates(data);
    } catch {
      message.error("加载模板列表失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSelect = async (name: string) => {
    if (changed && selectedName) {
      // Warn about unsaved changes? For now just switch.
    }
    try {
      const tmpl = await getTemplate(name);
      setSelectedName(name);
      editForm.setFieldsValue(tmpl);
      setChanged(false);
    } catch {
      message.error("获取模板详情失败");
    }
  };

  const handleNew = () => {
    setSelectedName(null);
    editForm.setFieldsValue(EMPTY_TEMPLATE);
    setChanged(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values: TemplateContent = await editForm.validateFields();
      if (selectedName) {
        await updateTemplate(selectedName, values);
        message.success(`模板 "${values.name}" 更新成功`);
        if (values.name !== selectedName) {
          setSelectedName(values.name);
        }
      } else {
        await createTemplate(values);
        message.success(`模板 "${values.name}" 创建成功`);
        setSelectedName(values.name);
      }
      setChanged(false);
      fetchTemplates();
      onTemplatesChanged();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteTemplate(name);
      message.success(`模板 "${name}" 已删除`);
      if (selectedName === name) {
        setSelectedName(null);
        editForm.setFieldsValue(EMPTY_TEMPLATE);
        setChanged(false);
      }
      fetchTemplates();
      onTemplatesChanged();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
  };

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setGenerating(true);
    setGenStreamText("");
    const abortController = new AbortController();
    abortRef.current = abortController;
    try {
      const result = await generateTemplateStream(
        genPrompt.trim(),
        (event: GenerateStreamEvent) => {
          if (event.event === "delta" && event.data.text) {
            setGenStreamText((prev) => prev + (event.data.text as string));
          }
        },
        abortController.signal
      );
      setGenOpen(false);
      setGenPrompt("");
      setGenStreamText("");
      editForm.setFieldsValue({
        ...EMPTY_TEMPLATE,
        name: result.identifier,
        description: result.when_to_use,
        system_prompt: result.system_prompt,
        provider: result.provider || "deepseek",
        model: result.model || "deepseek-v4-pro",
        color: result.color || "none",
        mcp: result.mcp || [],
        tools: result.tools || [],
      });
      setSelectedName(null);
      setChanged(true);
      message.success("AI 生成完成，请检查并保存");
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError" && e instanceof Error) {
        message.error(e.message);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const isSelected = (name: string) => selectedName === name;

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
          {/* Left: Template List */}
          <div
            style={{
              width: 300,
              flexShrink: 0,
              background: "#171717",
              borderRight: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={onBack}
                style={{ color: "#ccc" }}
              />
              <Text strong style={{ color: "#ddd", fontSize: 15 }}>
                Agent 模板
              </Text>
            </div>

            {/* Actions */}
            <div style={{ padding: "8px 12px", display: "flex", gap: 8 }}>
              <Button
                block
                size="small"
                icon={<PlusOutlined />}
                onClick={handleNew}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#ccc",
                }}
              >
                新建
              </Button>
              <Button
                block
                size="small"
                icon={<RobotOutlined />}
                onClick={() => setGenOpen(true)}
                style={{
                  background: "rgba(97,94,205,0.15)",
                  border: "1px solid rgba(97,94,205,0.25)",
                  color: "#a09cf7",
                }}
              >
                AI 生成
              </Button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <Spin size="small" />
                </div>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.name}
                    onClick={() => handleSelect(t.name)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      marginBottom: 2,
                      cursor: "pointer",
                      background: isSelected(t.name)
                        ? "rgba(97,94,205,0.12)"
                        : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected(t.name))
                        (e.currentTarget as HTMLDivElement).style.background =
                          "rgba(255,255,255,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected(t.name))
                        (e.currentTarget as HTMLDivElement).style.background =
                          "transparent";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          ellipsis
                          style={{
                            color: isSelected(t.name) ? "#e0e0e0" : "#bbb",
                            fontSize: 13,
                          }}
                        >
                          {t.name}
                        </Text>
                        <div>
                          <Text
                            ellipsis
                            style={{ fontSize: 11, color: "#666" }}
                          >
                            {t.description || t.provider}
                          </Text>
                        </div>
                      </div>
                      <Popconfirm
                        title={`确定删除 "${t.name}"?`}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDelete(t.name);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "#666", flexShrink: 0 }}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Editor */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Editor Header */}
            <div
              style={{
                padding: "10px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#1a1a1a",
                flexShrink: 0,
              }}
            >
              <Text style={{ color: "#999", fontSize: 13 }}>
                {selectedName ? `编辑: ${selectedName}` : "新建模板"}
                {changed && (
                  <Tag color="orange" style={{ marginLeft: 8, fontSize: 11 }}>
                    已修改
                  </Tag>
                )}
              </Text>
              <Space>
                <Button icon={<RobotOutlined />} onClick={() => setGenOpen(true)}>
                  AI 生成
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSave}
                >
                  保存
                </Button>
              </Space>
            </div>

            {/* Editor Body */}
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "24px 32px",
              }}
            >
              <Form
                form={editForm}
                layout="vertical"
                initialValues={EMPTY_TEMPLATE}
                onValuesChange={() => setChanged(true)}
              >
                <Space style={{ width: "100%" }} size={24}>
                  <Form.Item
                    name="name"
                    label="名称"
                    rules={[{ required: true, message: "请输入模板名称" }]}
                    style={{ width: 240 }}
                  >
                    <Input placeholder="如 code-reviewer" />
                  </Form.Item>
                  <Form.Item
                    name="provider"
                    label="Provider"
                    rules={[{ required: true }]}
                    style={{ width: 160 }}
                  >
                    <Select
                      options={[
                        { value: "deepseek", label: "deepseek" },
                        { value: "minimax", label: "minimax" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="model" label="Model" style={{ width: 240 }}>
                    <Input placeholder="如 deepseek-v4-pro" />
                  </Form.Item>
                  <Form.Item name="color" label="颜色" style={{ width: 100 }}>
                    <Select options={COLOR_OPTIONS} />
                  </Form.Item>
                </Space>

                <Form.Item
                  name="description"
                  label="描述"
                  rules={[{ required: true, message: "请输入描述" }]}
                >
                  <Input placeholder="简要描述 agent 的用途" />
                </Form.Item>

                <Space style={{ width: "100%" }} size={24}>
                  <Form.Item name="mcp" label="MCP 服务器" style={{ flex: 1 }}>
                    <Select
                      mode="tags"
                      placeholder="输入 MCP 服务器名后回车"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  <Form.Item name="tools" label="内置工具" style={{ flex: 1 }}>
                    <Select
                      mode="tags"
                      placeholder="输入工具名后回车"
                      style={{ width: "100%" }}
                      options={[
                        { value: "execute_python_code" },
                        { value: "execute_shell_command" },
                        { value: "view_text_file" },
                      ]}
                    />
                  </Form.Item>
                </Space>

                <Form.Item
                  name="system_prompt"
                  label="System Prompt"
                  rules={[{ required: true, message: "请输入 system prompt" }]}
                >
                  <TextArea
                    rows={20}
                    placeholder="Agent 的系统提示词..."
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </Form.Item>
              </Form>
            </div>
          </div>

          {/* AI Generate Modal */}
          {genOpen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => {
                setGenOpen(false);
                setGenPrompt("");
              }}
            >
              <div
                style={{
                  background: "#1e1e1e",
                  borderRadius: 12,
                  padding: 24,
                  width: 560,
                  maxWidth: "90vw",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Text
                  strong
                  style={{ color: "#ddd", fontSize: 15, display: "block", marginBottom: 16 }}
                >
                  AI 生成 Agent 模板
                </Text>
                <Text
                  type="secondary"
                  style={{ marginBottom: 12, display: "block", fontSize: 13 }}
                >
                  用自然语言描述你需要的 Agent，AI 将自动生成标识符、描述和 System Prompt，生成后可继续编辑。
                </Text>
                <TextArea
                  rows={4}
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="例如：帮我写一个代码审查的 agent，能检查 Python 代码的 PEP8 合规性、安全问题、和性能隐患"
                  autoFocus
                  onPressEnter={(e) => {
                    if (e.ctrlKey || e.metaKey) handleGenerate();
                  }}
                />
                <Text
                  type="secondary"
                  style={{ marginTop: 4, display: "block", fontSize: 11 }}
                >
                  Ctrl+Enter 发送
                </Text>
                {generating && (
                  <div style={{ padding: "16px 0 8px" }}>
                    {genStreamText ? (
                      <pre
                        style={{
                          background: "#111",
                          borderRadius: 8,
                          padding: 12,
                          maxHeight: 240,
                          overflow: "auto",
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: "#ccc",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          margin: 0,
                        }}
                      >
                        {genStreamText}
                      </pre>
                    ) : (
                      <div style={{ textAlign: "center", padding: "16px 0" }}>
                        <Spin size="default" />
                        <div style={{ marginTop: 8, color: "#999", fontSize: 13 }}>
                          正在调用 LLM 生成 Agent 配置...
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 20,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                  }}
                >
                  <Button
                    onClick={() => {
                      setGenOpen(false);
                      setGenPrompt("");
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    loading={generating}
                    onClick={handleGenerate}
                    disabled={!genPrompt.trim()}
                  >
                    生成
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </App>
    </ConfigProvider>
  );
}
