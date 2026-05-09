# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XSearchs Agent 是基于 agentscope-runtime 的 AI Agent 对话系统，集成 MCP 支付清算工具，支持多用户管理、会话持久化和 Web UI。

## Architecture

```
xsearchs_agent/
├── data/                       # 用户数据（运行时产生/可编辑，与 agent 代码分离）
│   ├── config.yaml             # 模型(DeepSeek/MiniMax)、MCP 服务器、SQLite
│   ├── templates/              # Agent 模板(.md)，manage 可编缉，agent 只读
│   │   ├── simple-react-agent.md
│   │   └── payment-system-architect.md
│   └── memory.db               # SQLite（两后端共享）
├── src/                        # 对话后端 :8090 — Agent 推理 + SSE 流式响应（只读 data/）
│   ├── main.py                 # AgentApp 入口，/process 端点
│   ├── config.py               # AppConfig / ModelConfig + get_data_dir()
│   ├── agent/                  # Agent 工厂，读取 data/templates/
│   │   ├── react_agent_factory.py
│   │   └── model_factory.py
│   └── session/                # 数据访问层（仅 get_db + message_store）
│       ├── database.py         # get_db() — 连接工厂
│       └── message_store.py    # load_messages / update_session_name
├── manage/                     # 管理后端 :8091 — 用户/认证/会话 CRUD + DB 初始化
│   ├── main.py                 # FastAPI + CORS，启动时调用 init_db()
│   ├── database.py             # init_db() — 建表 + 初始 admin
│   ├── auth.py                 # 明文密码、Bearer Token、Depends
│   └── routes/                 # /auth /users /sessions
└── web-ui/                     # 前端 :5173 — Vite + React + TypeScript
    ├── src/App.tsx             # 登录→设密→聊天 状态机
    ├── src/api/                # auth/sessions/users HTTP 封装
    ├── src/components/Chat/    # AgentScopeRuntimeWebUI + BackendSessionApi
    └── vite.config.ts          # proxy: /api/manage→8091 /api/chat→8090
```

## Environment

| 变量 | 默认值 | 说明 |
|---|---|---|
| `XSEARCHS_USER_DATA` | `<project_root>/data` | 用户数据目录，含 config.yaml、templates/、memory.db |

两后端通过 `src.config.get_data_dir()` 统一读取此变量。不设则回退到项目根下的 `data/`。

## Startup

```bash
cd /data/home/jlpayops/code/third/xsearchs_agent

# 可选：指定用户数据目录
export XSEARCHS_USER_DATA=/path/to/data

# 对话后端
source .venv/bin/activate && PYTHONPATH=. python src/main.py

# 管理后端
source .venv/bin/activate && PYTHONPATH=. python manage/main.py

# 前端
cd web-ui && npm run dev
```

## Database (SQLite)

| 表 | 关键列 | 说明 |
|---|---|---|
| users | id, passwd, is_admin, is_active | 内置 admin(is_admin=1)，明文密码 |
| auth_tokens | token(UUID), user_id, created_at | 24h TTL |
| session | id, user_id, name | 按用户隔离 |
| message | id, msg(JSON), session_id, index | agentscope Msg.to_dict() 格式 |
| message_mark | msg_id, mark | |

`manage/database.py` 的 `init_db()` 执行建表 + `INSERT OR IGNORE admin`，仅 manage 后端在启动时调用。
`src/session/database.py` 的 `get_db()` 提供连接，两个后端共用。

## API

### 管理后端 (8091)

| 端点 | 鉴权 | 说明 |
|---|---|---|
| POST /auth/login | 无 | {id,password} → {token,is_admin} 或 {need_set_password} |
| POST /auth/set-password | token | passwd 为空时设置 |
| POST /auth/change-password | token | 改自己密码 |
| GET /users | admin | 列出所有用户 |
| POST /users | admin | 创建用户(无密码) |
| POST /users/:id/reset-password | admin | 清空密码 |
| GET /sessions | token | 当前用户的会话(ORDER BY rowid DESC) |
| POST /sessions | token | 创建会话，可传 {id} |
| DELETE /sessions/:id | token | 删会话(验证归属) |
| GET /sessions/:id/messages | token | 读历史消息 |

### 对话后端 (8090)

| 端点 | 说明 |
|---|---|
| POST /process | {input,session_id,stream} → SSE 流 |
| GET /health | {"status":"healthy"} |

## Agent 对话流程

1. POST /process → `query_func` → `load_react_agent()` 创建 ReActAgent
2. `AsyncSQLAlchemyMemory` 从 SQLite 加载历史
3. LLM 推理(DeepSeek/MiniMax)，需要时调用 MCP 工具
4. SSE 流式返回，消息自动持久化到 message 表

## Key Pitfalls

1. **data/ 目录是用户数据与代码的边界**：config.yaml、templates/、memory.db 都在 data/ 下。src/ 中的代码只读取它们，不修改。未来 manage/ 可提供编缉模板的能力。
2. **antd 必须 v5**，v6 与 @agentscope-ai/chat 不兼容
3. **`BackendSessionApi.createSession()` 必须 mutate `session.id`** 注入 UUID，否则库 `setCurrentSessionId(undefined)` 导致 New Chat 无法切换
4. **`getSession(undefined)` 必须返回空会话**，库初始化时会传 undefined
5. **前端 API 用相对路径**（/api/manage, /api/chat），通过 Vite proxy 转发，否则远程浏览器把 0.0.0.0 解析为本机
6. **localStorage 中 `agent-scope-runtime-webui-options`** 可能缓存旧 session API 配置，导致库用 defaultSessionApi。清掉可修复
7. **消息历史格式**: 存储为 agentscope ContentBlock 数组，前端 `flattenContent()` 转 Markdown 展示
