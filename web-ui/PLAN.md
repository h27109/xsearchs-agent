# xsearchs-agent web-ui-v2 — 自建前端方案

## 目标
完全去掉 `@agentscope-ai/chat` 库依赖，自建前端，解决移动端侧边栏不可见问题。

## 目录结构
```
web-ui-v2/
  index.html
  package.json
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  vite.config.ts
  src/
    main.tsx               — 入口
    App.tsx                — 登录/聊天状态机
    api/
      auth.ts              — 认证 API（从旧 web-ui 复制）
      sessions.ts          — 会话 CRUD API（从旧 web-ui 复制）
      users.ts             — 用户管理 API（从旧 web-ui 复制）
    hooks/
      useChatStream.ts     — SSE 流式消息解析 hook
      useSessions.ts       — 会话列表管理 hook
    components/
      LoginPage.tsx        — 登录页（从旧 web-ui 复制）
      SetPasswordPage.tsx  — 设置密码页（从旧 web-ui 复制）
      ChangePasswordModal.tsx — 修改密码弹窗（从旧 web-ui 复制）
      AdminPanel.tsx       — 用户管理面板（从旧 web-ui 复制）
      ChatLayout.tsx       — 主布局：PC 左侧栏 + 右聊天区，移动端 Drawer 侧边栏
      Sidebar.tsx          — 会话列表侧边栏（PC 固定，移动 Drawer）
      ChatArea.tsx         — 聊天主区域
      MessageList.tsx      — 消息列表（自动滚底）
      MessageBubble.tsx    — 消息气泡：结构化渲染 text/thinking/tool_use/tool_result
      ChatInput.tsx        — 输入框 + 发送按钮
      WelcomeScreen.tsx    — 无会话时的欢迎页
```

## 后端 API 接口（已有，不能改）

### 认证
- `POST /api/manage/auth/login` — `{id, password}` → `{token, user_id, is_admin, need_set_password?}`
- `POST /api/manage/auth/set-password` — `{new_password}` + Bearer token
- `POST /api/manage/auth/change-password` — `{old_password, new_password}` + Bearer token
- `POST /api/manage/auth/logout` — Bearer token
- `GET /api/manage/auth/verify` — Bearer token → `{valid, user_id, is_admin}`

### 会话
- `GET /api/manage/sessions` — Bearer → `{sessions: [{id, user_id, name, msg_count}]}`
- `POST /api/manage/sessions` — `{name, id?}` + Bearer → session info
- `PATCH /api/manage/sessions/:id` — `{name}` + Bearer
- `DELETE /api/manage/sessions/:id` — Bearer
- `GET /api/manage/sessions/:id/messages` — Bearer → `{messages: [...]}`

### 聊天 SSE
- `POST /api/chat/process` — `{input, session_id, stream: true}` + Bearer → SSE stream

### SSE 格式
每条事件格式: `data: {JSON}\n\n`
JSON 是序列化后的 Event/AgentResponse 对象，主要字段:
```json
{
  "id": "resp-id",
  "object": "response" | "message" | "content",
  "status": "in_progress" | "completed" | "failed",
  "session_id": "xxx",
  "output": [
    {
      "id": "msg-id",
      "object": "message",
      "role": "assistant",
      "content": [
        {"type": "text", "text": "hello"},
        {"type": "thinking", "thinking": "..."},
        {"type": "tool_use", "id": "tool-id", "name": "tool_name", "input": {...}},
        {"type": "tool_result", "tool_use_id": "tool-id", "content": "result..."}
      ],
      "usage": {...}
    }
  ],
  "usage": {...}
}
```

流式增量：
- 初始事件: `{object: "response", status: "in_progress", session_id: "xxx"}`
- 消息增量事件: `{object: "content", type: "text", text: "delta...", index: 0, ...}` (每个 token)
- 完成事件: `{object: "response", status: "completed", output: [...完整消息], usage: {...}}`

### 用户管理
- `GET /api/manage/users` — Bearer → `{users: [{id, is_admin, is_active}]}`
- `POST /api/manage/users` — `{id}` + Bearer
- `PATCH /api/manage/users/:id` — `{is_admin?, is_active?}` + Bearer
- `POST /api/manage/users/:id/reset-password` — Bearer

## Vite 代理配置（同旧版）
```ts
server: {
  host: "0.0.0.0",
  port: 5174,
  proxy: {
    "/api/manage": { target: "http://127.0.0.1:8091", changeOrigin: true, rewrite: path => path.replace(/^\/api\/manage/, "") },
    "/api/chat": { target: "http://127.0.0.1:8090", changeOrigin: true, rewrite: path => path.replace(/^\/api\/chat/, "") },
  }
}
```

## 依赖（去掉 @agentscope-ai/chat）
```json
{
  "dependencies": {
    "@ant-design/icons": "^6.2.2",
    "antd": "^5.29.3",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "~6.0.2",
    "vite": "^8.0.10"
  }
}
```

## 关键组件说明

### ChatLayout.tsx
- PC(≥768px): 左侧固定 Sidebar(260px) + 右侧 ChatArea
- 移动(<768px): 全屏 ChatArea + 顶部汉堡菜单按钮 + antd Drawer 侧边栏
- 使用 antd ConfigProvider dark 主题

### Sidebar.tsx
- 顶部: "XSearchs Agent" 标题 + 新建会话按钮
- 中部: 会话列表（antd List），点击切换，当前高亮
- 每个会话项: 名称 + 删除按钮（Popconfirm）
- 底部: 用户信息 + 管理员入口 + 修改密码 + 登出

### useChatStream.ts
- 接收 token, sessionId
- 管理 messages 状态（Message[]）
- `sendMessage(text: string)` → POST /api/chat/process
- 解析 SSE:
  - 先用 `resp.body.getReader()` 读取流
  - 按 `\n\n` 分割事件
  - 解析 `data: {JSON}` 行
  - 增量文本追加到当前 assistant message
  - 完成时合并 output 中的完整消息
- 返回 `{ messages, isStreaming, sendMessage, loadHistory }`

### MessageBubble.tsx
- 根据 content block 的 `type` 分组件渲染:
  - `text`: 渲染 markdown（react-markdown + remark-gfm）
  - `thinking`: 折叠面板，显示思考过程
  - `tool_use`: 工具调用卡片，显示工具名和输入参数
  - `tool_result`: 工具结果卡片
- assistant 消息: 左对齐，深色背景
- user 消息: 右对齐，主色背景

### ChatInput.tsx
- antd Input.TextArea + 发送按钮
- Enter 发送，Shift+Enter 换行
- isStreaming 时禁用发送按钮，显示停止按钮

## 实现顺序
1. 创建项目骨架: package.json, vite.config.ts, tsconfig, index.html, main.tsx
2. 复制 api/ 目录（auth.ts, sessions.ts, users.ts 不变）
3. 复制 LoginPage, SetPasswordPage, ChangePasswordModal, AdminPanel（不变）
4. 实现 App.tsx（同旧版逻辑）
5. 实现 useChatStream.ts
6. 实现 useSessions.ts
7. 实现 Sidebar.tsx
8. 实现 MessageBubble.tsx
9. 实现 MessageList.tsx
10. 实现 ChatInput.tsx
11. 实现 WelcomeScreen.tsx
12. 实现 ChatArea.tsx
13. 实现 ChatLayout.tsx
14. npm install + 测试
