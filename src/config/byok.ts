import type { ByokConfig } from '../types';

/**
 * BYOK 配置的唯一持久化入口。
 * 不预置任何厂商地址；密钥按用户选择写入 localStorage 或仅保留在当前会话。
 */
export const BYOK_KEY = 'medmind-api-settings';

export const EMPTY_BYOK: ByokConfig = {
  baseUrl: '', apiKey: '', model: '', protocol: 'openai', remember: true,
};

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function normalizeByok(c: Partial<ByokConfig>): ByokConfig {
  return {
    baseUrl: String(c.baseUrl ?? '').trim().replace(/\/+$/, ''),
    apiKey: String(c.apiKey ?? '').trim(),
    model: String(c.model ?? '').trim(),
    protocol: c.protocol === 'anthropic' ? 'anthropic' : 'openai',
    remember: c.remember !== false,
  };
}

/** 读取本机保存的配置；兼容旧版只存 { baseUrl, model } 的数据 */
export function loadByok(): ByokConfig {
  const ls = storage();
  if (!ls) return { ...EMPTY_BYOK };
  try {
    const raw = ls.getItem(BYOK_KEY);
    if (!raw) return { ...EMPTY_BYOK };
    const p = JSON.parse(raw);
    return normalizeByok({
      baseUrl: p.baseUrl ?? '',
      apiKey: p.apiKey ?? '',
      model: p.model ?? p.modelName ?? '',
      protocol: p.protocol,
      remember: p.remember,
    });
  } catch { return { ...EMPTY_BYOK }; }
}

/** 保存配置。remember=false 时密钥不落盘，仅保留在当前页面会话（刷新后需重填）。 */
export function saveByok(c: ByokConfig): ByokConfig {
  const next = normalizeByok(c);
  const ls = storage();
  if (ls) {
    try {
      ls.setItem(BYOK_KEY, JSON.stringify({
        baseUrl: next.baseUrl,
        model: next.model,
        protocol: next.protocol,
        remember: next.remember,
        apiKey: next.remember ? next.apiKey : '',
      }));
    } catch { /* 隐私模式 / 配额不足时退化为内存态 */ }
  }
  return next;
}

/** 紧急停止时调用：抹除本机保存的密钥与全部连接信息 */
export function clearByok(): void {
  const ls = storage();
  if (ls) { try { ls.removeItem(BYOK_KEY); } catch { /* noop */ } }
}

export function isByokComplete(c: ByokConfig): boolean {
  return !!(c.baseUrl && c.model && c.apiKey);
}
