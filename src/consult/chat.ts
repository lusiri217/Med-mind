/**
 * 模拟问诊专用的多轮对话出口。
 * 与 src/llm/client.ts 的 callLLM 完全独立：那边是单轮 system+user 的图谱生成，
 * 这边要多轮 messages；新增文件而不改动原有函数，避免影响已上线的生成逻辑。
 * 请求仍受全局 AI 急停（fetch 代理 + AbortController）管辖。
 */
import { LlmError } from '../llm/client';
import type { ByokConfig } from '../types';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatCall = {
  system: string;
  turns: ChatTurn[];
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
};

function endpoint(base: string, protocol: ByokConfig['protocol']): string {
  const b = base.replace(/\/+$/, '');
  if (protocol === 'anthropic') {
    if (b.endsWith('/messages')) return b;
    return b.endsWith('/v1') ? b + '/messages' : b + '/v1/messages';
  }
  if (b.endsWith('/chat/completions')) return b;
  return b + '/chat/completions';
}

function isKillSwitchError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.message.includes('紧急停止'));
}

export async function chatLLM(c: ByokConfig, call: ChatCall): Promise<string> {
  if (!c.baseUrl.trim() || !c.model.trim() || !c.apiKey.trim()) {
    throw new LlmError('config', '请先填写 API Base URL、模型名称和 API Key');
  }
  const url = endpoint(c.baseUrl, c.protocol);
  const maxTokens = call.maxTokens ?? 1024;
  const temperature = call.temperature ?? 0.7;
  const turns = call.turns.slice(-24);   // 只带最近 24 轮，控制请求体积

  let init: RequestInit;
  if (c.protocol === 'anthropic') {
    // Anthropic 要求 user / assistant 严格交替；合并连续同角色发言
    const merged: ChatTurn[] = [];
    turns.forEach(t => {
      const last = merged[merged.length - 1];
      if (last && last.role === t.role) last.content += `\n${t.content}`;
      else merged.push({ ...t });
    });
    if (!merged.length || merged[0].role !== 'user') merged.unshift({ role: 'user', content: '（继续问诊）' });
    init = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': c.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: c.model, max_tokens: maxTokens, temperature, system: call.system, messages: merged,
      }),
    };
  } else {
    init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model, max_tokens: maxTokens, temperature, stream: false,
        messages: [{ role: 'system', content: call.system }, ...turns],
      }),
    };
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: call.signal });
  } catch (e) {
    if (isKillSwitchError(e)) throw e;   // 急停 / abort 原样抛给界面
    throw new LlmError('cors', '无法连接该 API：可能地址填错、网络不通，或被浏览器跨域(CORS)策略拦截', e instanceof Error ? e.message : String(e));
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) throw new LlmError('auth', 'API Key 无效或没有权限（401/403），请检查密钥', detail.slice(0, 240));
    if (response.status === 404) throw new LlmError('model', '接口地址或模型名不存在（404），请检查 Base URL 与模型名称', detail.slice(0, 240));
    if (response.status === 429) throw new LlmError('rate', '请求过于频繁或额度不足（429），请稍后重试', detail.slice(0, 240));
    if (response.status >= 500) throw new LlmError('unknown', `模型服务返回 ${response.status}，请稍后重试`, detail.slice(0, 240));
    throw new LlmError('unknown', `接口返回 ${response.status}`, detail.slice(0, 240));
  }

  const data: any = await response.json().catch(() => null);
  const text = c.protocol === 'anthropic'
    ? (Array.isArray(data?.content) ? data.content.find((x: any) => x?.type === 'text')?.text : '')
    : (data?.choices?.[0]?.message?.content ?? '');
  if (typeof text !== 'string' || !text.trim()) throw new LlmError('response', '模型返回内容为空或格式无法识别');
  return text;
}
