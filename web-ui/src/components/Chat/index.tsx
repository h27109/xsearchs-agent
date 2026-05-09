import { useMemo, useRef } from 'react';
import { AgentScopeRuntimeWebUI, IAgentScopeRuntimeWebUISession, IAgentScopeRuntimeWebUISessionAPI } from '@agentscope-ai/chat';
import { AuthState } from '../../api/auth';
import { getSessionList, createSession, deleteSession, getSessionMessages } from '../../api/sessions';

function genUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

class BackendSessionApi implements IAgentScopeRuntimeWebUISessionAPI {
  private token: string;
  onSessionCreated?: (id: string) => void;
  constructor(token: string) { this.token = token; }

  async getSessionList(): Promise<IAgentScopeRuntimeWebUISession[]> {
    const list = await getSessionList(this.token);
    return list.map(s => ({ id: s.id, name: s.name || `会话 ${s.id.slice(0, 8)}`, messages: [] }));
  }
  async getSession(sid: string): Promise<IAgentScopeRuntimeWebUISession> {
    if (!sid) return { id: '', name: '', messages: [] };
    const msgs = await getSessionMessages(this.token, sid);
    return {
      id: sid, name: '',
      messages: msgs.map((m: any) => {
        const { _index, content, ...rest } = m;
        return { ...rest, content: flattenContent(content) };
      }) as any,
    };
  }
  async createSession(s: Partial<IAgentScopeRuntimeWebUISession>): Promise<IAgentScopeRuntimeWebUISession[]> {
    if (!s.id) s.id = genUUID();
    await createSession(this.token, s.name || '', s.id);
    this.onSessionCreated?.(s.id);
    const list = await this.getSessionList();
    return list;
  }
  async updateSession(s: Partial<IAgentScopeRuntimeWebUISession>): Promise<IAgentScopeRuntimeWebUISession[]> {
    return this.getSessionList();
  }
  async removeSession(s: Partial<IAgentScopeRuntimeWebUISession>): Promise<IAgentScopeRuntimeWebUISession[]> {
    if (s.id) await deleteSession(this.token, s.id);
    return this.getSessionList();
  }
}

export default function Chat({ auth, onLogout }: { auth: AuthState; onLogout: () => void }) {
  const currentIdRef = useRef<string>('');
  const sessionApi = useMemo(() => {
    const api = new BackendSessionApi(auth.token);
    api.onSessionCreated = (id: string) => { currentIdRef.current = id; };
    return api;
  }, [auth.token]);

  const options = useMemo(() => ({
    api: {
      baseURL: '/api/chat/process',
      token: auth.token,
      // Custom fetch: library calls this instead of default POST
      fetch: async (data: { input: any[]; signal?: AbortSignal }) => {
        // Ensure we have a session ID
        if (!currentIdRef.current) {
          const id = genUUID();
          await createSession(auth.token, '', id);
          currentIdRef.current = id;
        }
        const resp = await fetch('/api/chat/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ input: data.input, session_id: currentIdRef.current, stream: true }),
          signal: data.signal,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp;
      },
    },
    session: { multiple: true, api: sessionApi },
    theme: { darkMode: true, colorPrimary: '#615CED', leftHeader: { title: 'XSearchs Agent' } },
    welcome: { greeting: '你好', description: '支付清算助手', prompts: [{ value: '你好' }, { value: '帮我查询商户信息' }] },
    sender: { disclaimer: 'AI 可能出错，请核实' },
  }), [auth.token, sessionApi]);

  return (
    <div style={{ height: '100vh' }}>
      <AgentScopeRuntimeWebUI options={options as any} />
    </div>
  );
}

function flattenContent(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content || '');
  return content.map((block: any) => {
    switch (block.type) {
      case 'text': return block.text || '';
      case 'thinking': return `\n> 💭 **Thinking**\n>\n> ${(block.thinking || '').replace(/\n/g, '\n> ')}\n`;
      case 'tool_use': return `\n> 🔧 **Tool: ${block.name || ''}**\n>\n> \`\`\`json\n> ${JSON.stringify(block.input || {}, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n`;
      case 'tool_result': return `\n> 📋 **Tool Result**\n>\n> ${typeof block.content === 'string' ? block.content : block.output || ''}\n`;
      default: return '';
    }
  }).join('\n');
}
