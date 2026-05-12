# XSearchs Agent

面向企业的多用户、多 Agent、可扩展 AI 对话系统，集成支付清算 MCP 工具和长期记忆（自动学习）能力。

## 设计目标

| 目标 | 当前实现 |
|------|---------|
| **多用户** | 独立用户认证、会话隔离、记忆隔离 |
| **多 Agent** | 模板驱动的 ReActAgent / DeepResearchAgent，运行时切换 |
| **可扩展** | MCP 协议工具集成，YAML 配置驱动，模板热加载 |
| **企业级** | Bearer Token 认证、管理员管控、数据持久化 |
| **自动学习** | Mem0 长期记忆 + 向量语义检索，跨会话积累用户知识 |

## 架构

```
xsearchs-agent/
├── chat/                         # 对话后端 :8090 — Agent 推理 + SSE 流式
│   ├── main.py                   # AgentApp 入口
│   ├── config.py                 # AppConfig / MemoryConfig / ModelConfig
│   ├── agent/
│   │   ├── react_agent_factory.py            # ReActAgent 工厂
│   │   ├── deep_research_agent_factory.py    # DeepResearchAgent 工厂
│   │   ├── user_memory.py                    # Mem0 长期记忆
│   │   ├── model_factory.py                  # LLM 模型创建
│   │   └── deep_research/                    # 深度研究子 Agent 流程
│   └── session/message_store.py   # SQLite 数据访问层
├── manage/                       # 管理后端 :8091 — 用户/认证/会话 CRUD
│   ├── main.py                   # FastAPI 入口
│   ├── database.py               # init_db() 建表 + 初始 admin
│   ├── auth.py                   # Bearer Token 鉴权
│   └── routes/                   # /auth /users /sessions /agent-templates
├── web-ui/                       # 前端 :5173 — Vite + React + TypeScript
│   └── src/
│       ├── App.tsx               # 登录 → 设密 → 聊天 状态机
│       ├── api/                  # HTTP 请求封装
│       └── components/           # ChatLayout, Sidebar, AdminPanel 等
├── data/                         # 用户数据（与代码分离）
│   ├── config.yaml               # 模型 / MCP / 长期记忆 配置
│   ├── .env                      # API Key（不入 git）
│   ├── templates/                # Agent 模板 (.md)
│   └── memory/                   # 向量数据库存储（运行时）
├── restart.sh                    # 一键重启脚本
└── pyproject.toml                # Python 依赖
```

## 快速开始

### 环境要求

- Python >= 3.12
- Node.js >= 18
- 可选：本地 Ollama（如需离线 embedding）

### 1. 配置

```bash
# data/.env（已加入 .gitignore）
MINIMAX_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx
GLM_API_KEY=xxx.xxx
MCP_CLEAR_TOKEN=xxx
MCP_CSAS_TOKEN=xxx
```

`data/config.yaml` 中已预置 DeepSeek 和 MiniMax 两个模型 provider，可按需调整。

### 2. 启动

```bash
bash restart.sh        # 一键启动 chat + manage + web-ui
```

### 3. 访问

| 服务 | 地址 |
|------|------|
| Web UI | `http://localhost:5173` |
| 对话 API | `http://localhost:8090` |
| 管理 API | `http://localhost:8091` |

初始管理员 `admin`，首次登录设置密码。

## 多用户体系

- 管理员创建用户（初始无密码），用户首次登录自行设置密码
- 每个用户独立的会话列表和历史消息
- 长期记忆按 `user_id` 隔离，用户间互不可见
- 24 小时 Token 过期机制

## 多 Agent 体系

Agent 通过 `data/templates/*.md` 模板定义，YAML frontmatter 声明 provider、模型、工具、MCP 服务器：

```markdown
---
name: "支付系统架构师"
description: "设计、开发、测试、排查支付系统"
provider: "deepseek"
model: "deepseek-v4-pro"
color: "blue"
tools:
  - "execute_python_code"
  - "execute_shell_command"
mcp:
  - "清算接口"
  - "商户接口"
---

你是一个专业的支付系统架构师...
```

| 内置模板 | Agent 类型 | Provider | 特点 |
|---------|-----------|----------|------|
| `simple-react-agent` | ReActAgent | MiniMax | 清算 + 商户 MCP，通用助手 |
| `payment-system-architect` | ReActAgent | DeepSeek | 支付系统架构师 |
| `deep-research-agent` | DeepResearchAgent | DeepSeek | 多步骤深度研究，子任务分解 |

## MCP 工具集成

通过 `data/config.yaml` 的 `MCP` 段声明工具服务器，模板通过 `mcp` 字段引用：

```yaml
MCP:
  清算接口:
    url: "https://ai.jlpay.com/mcp-clear/mcp"
    type: "streamable_http"
    headers:
      Authorization: ${MCP_CLEAR_TOKEN}
```

支持 Streamable HTTP 协议、Bearer Token 认证，运行时动态注册到 Agent 工具箱。

## 长期记忆（自动学习）

Agent 在对话中自主记录用户偏好、习惯、事实到长期记忆，后续跨会话自动检索。

```yaml
memory:
  enabled: true               # 设为 true 开启
  model_provider: "deepseek"  # 记忆 LLM，复用模型配置
  embedding:
    provider: "glm"           # openai / dashscope / ollama
    model: "embedding-3"
    dimensions: 1024
```

工作流程：

```
用户输入 → Agent 判断 → record_to_memory("用户喜欢拿铁")
                      → retrieve_from_memory(["咖啡偏好"])
                      → 注入检索结果到上下文
```

| 特性 | 实现 |
|------|------|
| 记忆后端 | Mem0 + Qdrant 本地向量库 |
| 向量化 | GLM Embedding-3（默认 1024 维） |
| 用户隔离 | 按 user_id 过滤元数据，跨会话共享 |
| 存储路径 | `data/memory/qdrant/`，随 `XSEARCHS_USER_DATA` 切换 |
| 触发模式 | `agent_control`：Agent 自主决定读写时机 |

支持的 embedding provider：

| Provider | 配置 |
|----------|------|
| `glm` | 智谱 Embedding-3（默认） |
| `openai` | 任意 OpenAI 兼容 API |
| `dashscope` | 阿里云 DashScope |
| `ollama` | 本地 Ollama（免费、离线） |

## API 参考

### 对话后端 (8090)

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/process` | SSE 流式对话 |
| GET | `/health` | 健康检查 |

`POST /process` 参数：

```json
{
  "input": "用户消息",
  "session_id": "uuid",
  "agent_id": "simple-react-agent",
  "stream": true
}
```

### 管理后端 (8091)

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/auth/login` | POST | 无 | 登录 |
| `/auth/set-password` | POST | token | 设置初始密码 |
| `/auth/change-password` | POST | token | 修改密码 |
| `/auth/logout` | POST | 可选 | 注销 |
| `/auth/verify` | GET | token | 验证 token |
| `/users` | GET/POST | admin | 用户列表 / 创建 |
| `/users/:id` | PATCH | admin | 修改权限 / 状态 |
| `/users/:id/reset-password` | POST | admin | 重置密码 |
| `/sessions` | GET/POST | token | 会话列表 / 创建 |
| `/sessions/:id` | PATCH/DELETE | token | 重命名 / 删除 |
| `/sessions/:id/messages` | GET | token | 历史消息 |
| `/agent-templates` | GET | 无 | 可用 Agent 列表 |

## 数据库

SQLite，位于 `data/memory.db`：

| 表 | 用途 |
|----|------|
| `users` | 用户（id, passwd, is_admin, is_active） |
| `session` | 会话（id, user_id, name, agent_id） |
| `message` | 消息（id, msg JSON, session_id, index） |
| `message_mark` | 消息标记（压缩等） |
| `auth_tokens` | 认证令牌（24h 过期） |

## 环境变量

| 变量 | 说明 |
|------|------|
| `XSEARCHS_USER_DATA` | 用户数据目录，默认 `./data` |
| `MINIMAX_API_KEY` | MiniMax API Key |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `GLM_API_KEY` | 智谱 API Key（embedding） |
| `MCP_CLEAR_TOKEN` | 清算 MCP Bearer Token |
| `MCP_CSAS_TOKEN` | 商户 MCP Bearer Token |

## 技术栈

| 层 | 技术 |
|----|------|
| Agent 框架 | AgentScope 1.0 + agentscope-runtime |
| LLM | DeepSeek V4, MiniMax M2.5/M2.7 |
| Embedding | 智谱 Embedding-3（支持 OpenAI/DashScope/Ollama） |
| 向量数据库 | Qdrant（本地模式） |
| 后端 | FastAPI（管理端）+ AgentApp（对话端） |
| 前端 | Vite 8 + React 19 + TypeScript + Ant Design 5 |
| 数据库 | SQLite（aiosqlite + SQLAlchemy） |
| 消息协议 | SSE 流式响应 |
| MCP | Streamable HTTP + Bearer Token |

## 许可证

MIT
