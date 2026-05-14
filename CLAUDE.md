# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

面向企业的多用户、多 Agent、可扩展 AI 对话系统。核心能力：多 Agent 模板切换、MCP 支付清算工具集成、Holographic 长期记忆（零 Embedding 依赖）、Web UI。

## Architecture

```
xsearchs_agent/
├── data/                       # 用户数据（运行时产生/可编辑，与 agent 代码分离）
│   ├── config.yaml             # 模型(DeepSeek/MiniMax)、MCP 服务器、全息记忆配置
│   ├── templates/              # Agent 模板(.md)，manage 可编缉，agent 只读
│   │   ├── simple-react-agent.md
│   │   ├── payment-system-architect.md
│   │   └── deep-research-agent.md
│   └── memory.db               # SQLite（会话 + 全息记忆，两后端共享）
├── chat/                       # 对话后端 :8090 — Agent 推理 + SSE 流式响应（只读 data/）
│   ├── main.py                 # AgentApp 入口，/process 端点，ensure_session()，agent 路由
│   ├── config.py               # AppConfig / ModelConfig / MemoryConfig / HolographicConfig
│   ├── agent/                  # Agent 工厂
│   │   ├── react_agent_factory.py      # ReActAgent + 长期记忆集成
│   │   ├── deep_research_agent_factory.py  # DeepResearchAgent 工厂
│   │   ├── user_memory.py              # HolographicLongTermMemory 工厂
│   │   ├── holographic_memory.py       # 全息记忆实现（n-gram 随机投影 + SQLite）
│   │   ├── model_factory.py            # LLM 模型创建（AnthropicChatModel / OpenAIChatModel）
│   │   └── deep_research/              # DeepResearchAgent 提示词和工具
│   └── session/                # 数据访问层
│       ├── __init__.py         # 导出 get_db
│       └── message_store.py    # get_db() — 连接工厂
├── manage/                     # 管理后端 :8091 — 用户/认证/会话 CRUD + DB 初始化
│   ├── main.py                 # FastAPI + CORS，启动时调用 init_db()
│   ├── database.py             # init_db() — 建表 + 初始 admin, get_db()
│   ├── auth.py                 # 明文密码、HTTP Basic Auth、Depends
│   └── routes/                 # /auth /users /sessions /agent-templates
├── web-ui/                     # 前端 :5173 — Vite + React + TypeScript + Ant Design 5
│   ├── src/App.tsx             # 登录→设密→聊天 状态机
│   ├── src/api/                # auth/sessions/users HTTP 封装
│   ├── src/components/         # ChatLayout, ChatArea, Sidebar, MessageList 等
│   └── vite.config.ts          # proxy: /api/manage→8091 /api/chat→8090
├── restart.sh                  # 重启脚本（chat + manage + web-ui）
└── pyproject.toml              # Python 依赖
```

## Environment

| 变量 | 默认值 | 说明 |
|---|---|---|
| `XSEARCHS_USER_DATA` | `<project_root>/data` | 用户数据目录，含 config.yaml、templates/、memory.db、memory/ |

两后端各自独立读取此变量（chat/ 和 manage/ 各有自己的 `get_data_dir()`）。不设则回退到项目根下的 `data/`。通过设置不同的 `XSEARCHS_USER_DATA` 可以达到多租户数据隔离。

## Startup

```bash
# 一键重启
bash restart.sh

# 或手动启动
source .venv/bin/activate && PYTHONPATH=. python chat/main.py     # 对话后端 :8090
source .venv/bin/activate && PYTHONPATH=. python manage/main.py   # 管理后端 :8091
cd web-ui && npm run dev                                           # 前端 :5173
```

## Database (SQLite)

| 表 | 关键列 | 说明 |
|---|---|---|
| users | id, passwd, is_admin, is_active | 内置 admin(is_admin=1)，明文密码 |
| session | id, user_id, name, agent_id | 按用户隔离，agent_id 对应 data/templates/*.md 的 name |
| message | id, msg(JSON), session_id, index | agentscope Msg.to_dict() 格式 |
| message_mark | msg_id, mark | 消息标记（压缩等） |
| holographic_memory | id, user_id, content, vector_json(JSON), created_at | 全息长期记忆，按用户隔离 |

`manage/database.py` 的 `init_db()` 执行建表 + `INSERT OR IGNORE admin`，仅 manage 后端在启动时调用。
`chat/session/message_store.py` 的 `get_db()` 提供 chat 后端的连接，两后端各自管理自己的 DB 访问。

## API

### 管理后端 (8091)

| 端点 | 鉴权 | 说明 |
|---|---|---|
| POST /auth/login | 无 | {id,password} → {user_id,is_admin} 或 {need_set_password} |
| POST /auth/set-password | Basic | passwd 为空时设置 |
| POST /auth/change-password | Basic | 改自己密码 |
| GET /auth/verify | Basic | 验证认证有效性 |
| GET /agent-templates | 无 | 列出可用智能体模板（读取 data/templates/*.md 的 YAML frontmatter） |
| GET /users | admin | 列出所有用户 |
| POST /users | admin | 创建用户(无密码) |
| PATCH /users/:id | admin | 修改用户 is_admin/is_active（admin 自身不可修改） |
| POST /users/:id/reset-password | admin | 清空密码 |
| GET /sessions | Basic | 当前用户的会话(ORDER BY rowid DESC) |
| POST /sessions | Basic | 创建会话，可传 {id, agent_id} |
| PATCH /sessions/:id | Basic | 修改会话名称 |
| DELETE /sessions/:id | Basic | 删会话(验证归属) |
| GET /sessions/:id/messages | Basic | 读历史消息 |

### 对话后端 (8090)

| 端点 | 说明 |
|---|---|
| POST /process | {input,session_id,stream,agent_id} → SSE 流 |
| GET /health | {"status":"healthy"} |

## Agent 对话流程

1. POST /process → `query_func` → 根据 agent_id 路由
2. agent_id == "deep-research-agent" → `load_deep_research_agent()`，其余 → `load_react_agent()`
3. `ensure_session()` 自动创建 session 行（如不存在）
4. 如 memory 启用，`create_long_term_memory()` 创建 HolographicLongTermMemory（n-gram 随机投影 + SQLite）
5. `AsyncSQLAlchemyMemory` 从 SQLite 加载历史
6. ReActAgent 推理(DeepSeek/MiniMax)，需要时调用 MCP 工具
7. agent_control 模式下 Agent 自主调用 record_to_memory / retrieve_from_memory
8. SSE 流式返回，消息自动持久化到 message 表

## 长期记忆 (Holographic)

通过 `create_long_term_memory()` 创建 `HolographicLongTermMemory`，配置从 `data/config.yaml` 的 `memory` 段读取。

- **编码方式**: n-gram 随机投影，每个 n-gram hash 映射为确定性随机单位向量，叠加后归一化
- **存储**: SQLite 表 `holographic_memory`，向量序列化为 JSON，按 user_id 隔离
- **全息迹**: 所有记忆向量累加为单一 `_trace` 向量（Holographic 特性），启动时从 DB 重建
- **检索**: 查询编码后与所有存储向量求余弦相似度，排序返回 top-k
- **触发模式**: `agent_control`，Agent 自主调用 `record_to_memory` / `retrieve_from_memory`
- **零外部依赖**: 不需要 Embedding API，不需要 Qdrant，仅依赖 numpy + sqlite3

### 配置

```yaml
memory:
  enabled: true
  holographic:
    dims: 1024       # 向量维度（越大精度越高，存储开销越大）
    ngram_min: 2     # n-gram 最小长度
    ngram_max: 4     # n-gram 最大长度
```

## Key Pitfalls

1. **data/ 目录是用户数据与代码的边界**：config.yaml、templates/、memory.db 都在 data/ 下。chat/ 中的代码只读取它们，不修改。manage 可提供编缉模板的能力。
2. **chat/ 和 manage/ 是两个独立项目**，不共用代码模块，各自管理自己的 DB 连接和配置读取
3. **antd 必须 v5**，v6 与 @agentscope-ai/chat 不兼容
4. **前端 API 用相对路径**（/api/manage, /api/chat），通过 Vite proxy 转发
5. **消息历史格式**: 存储为 agentscope ContentBlock 数组，前端 `flattenContent()` 转 Markdown 展示
6. **DeepSeek 两种端点都严格校验 MCP tool schema**，`_fix_schema_for_deepseek()` 递归修补 JSON Schema 兼容性
7. **模板 frontmatter 必须有 `provider` 字段**，否则 `react_agent_factory.py` 抛 ValueError
8. **全息记忆 dims 变更**：修改 dims 后，旧记忆的向量维度不匹配，检索时会因 numpy shape 不匹配报错。如需变更维度，需清空 `holographic_memory` 表
9. **n-gram 编码精度**：对同义词/语义改写检索效果弱于 Embedding 方案，建议 Agent 记录记忆时使用具体关键词（人名、日期、项目名等）
10. **同步 sqlite3**：HolographicLongTermMemory 使用同步 sqlite3 + `asyncio.to_thread`，与 chat 后端的 aiosqlite（SQLAlchemy）通过 WAL 模式共存，不会互相阻塞
11. **deep_research_agent 不使用长记忆**，仅 `react_agent_factory` 集成
12. **.env 已加入 .gitignore**，不要提交 API Key

## 添加新 Agent 模板

在 `data/templates/` 下创建 `.md` 文件，YAML frontmatter 格式：

```yaml
---
name: "助手名称"
description: "简要描述"
provider: "deepseek"      # 引用 config.yaml models 中的 key
model: "deepseek-v4-pro"  # 可选，默认取 provider 的第一个模型
color: "blue"             # 前端展示颜色
tools:                    # 内置工具
  - "execute_python_code"
mcp:                      # 引用的 MCP 服务器
  - "mcp-clear"
---
系统提示词正文...
```

## 调整全息记忆编码参数

修改 `data/config.yaml` 的 `memory.holographic` 段：

- **dims**: 提高到 2048 可增加精度（更多随机投影基），降低到 512 减少存储和计算开销
- **ngram_min/ngram_max**: 对中文建议 2-4，对英文可调整为 3-5

注意：修改 dims 需要清空 `holographic_memory` 表，否则旧向量维度不匹配。
