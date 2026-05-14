# XSearchs Agent

面向企业的多用户、多 Agent、可扩展 AI 对话系统，集成支付清算 MCP 工具和长期记忆（自动学习）能力。

## 设计目标

| 目标 | 当前实现 |
|------|---------|
| **多用户** | 独立用户认证、会话隔离、记忆隔离 |
| **多 Agent** | 模板驱动的 ReActAgent / DeepResearchAgent，运行时切换 |
| **可扩展** | MCP 协议工具集成，YAML 配置驱动，模板热加载 |
| **企业级** | HTTP Basic Auth 认证、管理员管控、数据持久化 |
| **自动学习** | Holographic 长期记忆（零 Embedding 依赖），跨会话积累用户知识 |

## 架构

```
xsearchs-agent/
├── chat/                         # 对话后端 :8090 — Agent 推理 + SSE 流式
│   ├── main.py                   # AgentApp 入口
│   ├── config.py                 # AppConfig / MemoryConfig / ModelConfig
│   ├── agent/
│   │   ├── react_agent_factory.py            # ReActAgent 工厂
│   │   ├── deep_research_agent_factory.py    # DeepResearchAgent 工厂
│   │   ├── user_memory.py                    # 全息长期记忆工厂
│   │   ├── model_factory.py                  # LLM 模型创建
│   │   └── deep_research/                    # 深度研究子 Agent 流程
│   └── session/message_store.py   # SQLite 数据访问层
├── manage/                       # 管理后端 :8091 — 用户/认证/会话 CRUD
│   ├── main.py                   # FastAPI 入口
│   ├── database.py               # init_db() 建表 + 初始 admin
│   ├── auth.py                   # HTTP Basic Auth 鉴权
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
│   └── memory.db                 # SQLite（会话 + 全息记忆）
├── restart.sh                    # 一键重启脚本
└── pyproject.toml                # Python 依赖
```

## 快速开始

### 环境要求

- Python >= 3.12
- Node.js >= 18

### 1. 配置

```bash
# data/.env（已加入 .gitignore）
MINIMAX_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx
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
- HTTP Basic Auth 认证（user_id + password）

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
  - "mcp-clear"
  - "mcp-csas"
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
  mcp-clear:
    url: "https://ai.xsearchs.com/mcp-clear/mcp"
    type: "streamable_http"
    headers:
      Authorization: ${MCP_CLEAR_TOKEN}
```

支持 Streamable HTTP 协议、HTTP Basic Auth，运行时动态注册到 Agent 工具箱。

## 长期记忆（自动学习）

Agent 在对话中自主记录用户偏好、习惯、事实到长期记忆，后续跨会话自动检索。基于 **Holographic Reduced Representations (HRR)**，通过 n-gram 随机投影将文本编码为高维向量，无需 Embedding API，零外部依赖。

```yaml
memory:
  enabled: true
  holographic:
    dims: 1024       # 向量维度
    ngram_min: 2     # n-gram 最小长度
    ngram_max: 4     # n-gram 最大长度
```

工作流程：

```
用户输入 → Agent 判断 → record_to_memory("用户喜欢拿铁")
                      → retrieve_from_memory(["咖啡偏好"])
                      → 注入检索结果到上下文
```

| 特性 | 实现 |
|------|------|
| 记忆后端 | Holographic HRR（n-gram 随机投影） |
| 编码方式 | 确定性随机向量叠加（中文字符级 n-gram） |
| 存储 | SQLite（`holographic_memory` 表） |
| 用户隔离 | 按 user_id 过滤，跨会话共享 |
| 全息迹 | 所有记忆叠加为单一迹向量 |
| 触发模式 | `agent_control`：Agent 自主决定读写时机 |

### 原理

```
文本 → n-gram 切分 → 每个 n-gram hash → 确定性随机向量
    → 向量叠加 → 归一化 → 1024 维编码向量

检索时：查询编码 → 与所有存储向量求余弦相似度 → 排序返回
全息迹：所有记忆向量累加 → 单向量代表全部记忆（Holographic 特性）
```

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
| `/auth/set-password` | POST | Basic | 设置初始密码 |
| `/auth/change-password` | POST | Basic | 修改密码 |
| `/auth/verify` | GET | Basic | 验证认证 |
| `/users` | GET/POST | admin | 用户列表 / 创建 |
| `/users/:id` | PATCH | admin | 修改权限 / 状态 |
| `/users/:id/reset-password` | POST | admin | 重置密码 |
| `/sessions` | GET/POST | Basic | 会话列表 / 创建 |
| `/sessions/:id` | PATCH/DELETE | Basic | 重命名 / 删除 |
| `/sessions/:id/messages` | GET | Basic | 历史消息 |
| `/agent-templates` | GET | 无 | 可用 Agent 列表 |

## 数据库

SQLite，位于 `data/memory.db`：

| 表 | 用途 |
|----|------|
| `users` | 用户（id, passwd, is_admin, is_active） |
| `session` | 会话（id, user_id, name, agent_id） |
| `message` | 消息（id, msg JSON, session_id, index） |
| `message_mark` | 消息标记（压缩等） |
| `holographic_memory` | 全息长期记忆（id, user_id, content, vector_json, created_at） |
| — | HTTP Basic Auth，无需令牌表 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `XSEARCHS_USER_DATA` | 用户数据目录，默认 `./data` |
| `MINIMAX_API_KEY` | MiniMax API Key |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `MCP_CLEAR_TOKEN` | 清算 MCP Bearer Token |
| `MCP_CSAS_TOKEN` | 商户 MCP Bearer Token |

## 技术栈

| 层 | 技术 |
|----|------|
| Agent 框架 | AgentScope 1.0 + agentscope-runtime |
| LLM | DeepSeek V4, MiniMax M2.5/M2.7 |
| 长期记忆 | Holographic HRR（n-gram 随机投影，零 Embedding 依赖） |
| 后端 | FastAPI（管理端）+ AgentApp（对话端） |
| 前端 | Vite 8 + React 19 + TypeScript + Ant Design 5 |
| 数据库 | SQLite（aiosqlite + SQLAlchemy） |
| 消息协议 | SSE 流式响应 |
| MCP | Streamable HTTP + Bearer Token |

## 许可证

MIT
