import type { ByokConfig } from '../types';

/** 全站唯一的大模型请求出口。地址、密钥、模型名全部来自使用者填写的配置。 */
export type LlmErrorKind = 'config' | 'cors' | 'auth' | 'model' | 'rate' | 'response' | 'unknown';

export class LlmError extends Error {
  constructor(public kind: LlmErrorKind, message: string, public detail = '') {
    super(message);
    this.name = 'LlmError';
  }
}

export type LlmCall = { system: string; user: string; signal?: AbortSignal; maxTokens?: number };

function endpoint(base: string, protocol: ByokConfig['protocol']): string {
  const b = base.replace(/\/+$/, '');
  if (protocol === 'anthropic') {
    if (b.endsWith('/messages')) return b;
    return b.endsWith('/v1') ? b + '/messages' : b + '/v1/messages';
  }
  if (b.endsWith('/chat/completions')) return b;
  return b + '/chat/completions';
}

export function buildRequest(c: ByokConfig, call: LlmCall): { url: string; init: RequestInit } {
  if (!c.baseUrl.trim() || !c.model.trim() || !c.apiKey.trim()) {
    throw new LlmError('config', '请先填写 API Base URL、模型名称和 API Key');
  }
  const maxTokens = call.maxTokens ?? 8192;
  const url = endpoint(c.baseUrl, c.protocol);

  if (c.protocol === 'anthropic') {
    return {
      url,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': c.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: c.model, max_tokens: maxTokens,
          system: call.system,
          messages: [{ role: 'user', content: call.user }],
        }),
      },
    };
  }
  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${c.apiKey}`,
      },
      body: JSON.stringify({
        model: c.model, max_tokens: maxTokens, temperature: 0.3, stream: false,
        messages: [
          { role: 'system', content: call.system },
          { role: 'user', content: call.user },
        ],
      }),
    },
  };
}

function isKillSwitchError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.message.includes('紧急停止'));
}

export async function callLLM(c: ByokConfig, call: LlmCall): Promise<string> {
  const { url, init } = buildRequest(c, call);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: call.signal });
  } catch (e) {
    if (isKillSwitchError(e)) throw e;
    throw new LlmError(
      'cors',
      '无法连接该 API：可能地址填错、网络不通，或被浏览器跨域(CORS)策略拦截',
      e instanceof Error ? e.message : String(e),
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new LlmError('auth', 'API Key 无效或没有权限（401/403），请检查密钥', detail.slice(0, 240));
    }
    if (response.status === 404) {
      throw new LlmError('model', '接口地址或模型名不存在（404），请检查 Base URL 与模型名称', detail.slice(0, 240));
    }
    if (response.status === 429) {
      throw new LlmError('rate', '请求过于频繁或额度不足（429），请稍后重试', detail.slice(0, 240));
    }
    if (response.status >= 500) {
      throw new LlmError('unknown', `模型服务返回 ${response.status}，请稍后重试`, detail.slice(0, 240));
    }
    throw new LlmError('unknown', `接口返回 ${response.status}`, detail.slice(0, 240));
  }

  const data: any = await response.json().catch(() => null);
  const text = c.protocol === 'anthropic'
    ? (Array.isArray(data?.content) ? data.content.find((x: any) => x?.type === 'text')?.text : '')
    : (data?.choices?.[0]?.message?.content ?? '');
  if (typeof text !== 'string' || !text.trim()) {
    throw new LlmError('response', '模型返回内容为空或格式无法识别');
  }
  return text;
}

/** 设置面板的「连通性测试」：用最小请求验证地址、密钥、模型名与跨域是否可用 */
export async function testConnection(c: ByokConfig, signal?: AbortSignal): Promise<string> {
  const reply = await callLLM(c, {
    system: 'You are a connectivity probe. Reply with the single word OK and nothing else.',
    user: 'Reply with exactly: OK',
    signal, maxTokens: 16,
  });
  return reply.trim().slice(0, 60) || 'OK';
}
