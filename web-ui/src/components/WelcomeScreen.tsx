import { Button, Typography } from "antd";
import {
  RobotOutlined,
  SearchOutlined,
  AccountBookOutlined,
} from "@ant-design/icons";

const { Title, Paragraph } = Typography;

const QUICK_PROMPTS = [
  { label: "你好", icon: <RobotOutlined /> },
  { label: "帮我查询商户信息", icon: <SearchOutlined /> },
  { label: "查询交易流水", icon: <AccountBookOutlined /> },
];

interface Props {
  onPromptClick?: (text: string) => void;
}

export default function WelcomeScreen({ onPromptClick }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 40,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: "rgba(97,94,205,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <RobotOutlined style={{ fontSize: 36, color: "#615CED" }} />
      </div>
      <Title level={3} style={{ color: "#fff", marginBottom: 8 }}>
        XSearchs Agent
      </Title>
      <Paragraph
        type="secondary"
        style={{ fontSize: 16, marginBottom: 8, maxWidth: 400 }}
      >
        你好，有什么可以帮助你的?
      </Paragraph>
      <Paragraph
        type="secondary"
        style={{ fontSize: 13, marginBottom: 32, maxWidth: 400 }}
      >
        我是支付清算助手，可以帮你查询商户信息、交易对账、清算结算等业务。
      </Paragraph>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {QUICK_PROMPTS.map((p) => (
          <Button
            key={p.label}
            icon={p.icon}
            onClick={() => onPromptClick?.(p.label)}
            style={{
              borderRadius: 20,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#ccc",
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
