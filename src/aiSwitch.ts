/**
 * AI 紧急停止总闸（API 抹除）—— 纯静态版
 *
 * 1. 全局代理 window.fetch：只要目标是使用者配置的模型端点或常见 LLM 路径就会被拦下。
 * 2. 锁状态写在独立的 localStorage 键里，刷新、重开浏览器、其他标签页都生效。
 * 3. 所有在途 AI 请求登记 AbortController，触发停止时立即 abort。
 * 4. 静态站没有服务端，熔断完全在浏览器内生效；密钥抹除由 config/byok.ts 负责。
 */
export const AI_LOCK_KEY = 'medmind-ai-lock-v1';
export const BYOK_STORAGE_KEY = 'medmind-api-settings';

const AI_URL_PATTERNS = [
  '/chat/completions',
  '/v1/messages',
  '/messages',
  '/v1/completions',
  '/embeddings',
];

const inFlight = new Set<AbortController>();
let installed = false;

function requestUrl(input: any): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input && input.url) || '';
}

/** 使用者在设置面板填的 API Base URL；优先新的 BYOK 键，兼容旧版 harness 字段 */
function configuredApiBase(): string {
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY);
    if (raw) {
      const base = JSON.parse(raw)?.baseUrl;
      if (typeof base === 'string' && base.trim()) return base.trim().replace(/\/+$/, '');
    }
    const legacy = localStorage.getItem('medmind-harness-v1');
    const old = legacy ? JSON.parse(legacy)?.state?.harness?.apiBaseUrl : '';
    return typeof old === 'string' ? old.trim().replace(/\/$/, '') : '';
  } catch { return ''; }
}

export function isAiRequest(url: string): boolean {
  if (!url) return false;
  if (AI_URL_PATTERNS.some(p => url.includes(p))) return true;
  const base = configuredApiBase();
  return !!base && (url === base || url.startsWith(base + '/') || url.startsWith(base + '?'));
}

export function isAiLocked(): boolean {
  try { return localStorage.getItem(AI_LOCK_KEY) === '1'; } catch { return false; }
}

/** 写总闸；开启时同时中止所有在途 AI 请求 */
export function setAiLocked(locked: boolean): void {
  try {
    if (locked) localStorage.setItem(AI_LOCK_KEY, '1');
    else localStorage.removeItem(AI_LOCK_KEY);
  } catch { /* 隐私模式 / 存储禁用时退化为内存态 */ }
  if (locked) abortAllAi();
}

export function trackAiRequest(): AbortController {
  const controller = new AbortController();
  inFlight.add(controller);
  return controller;
}

export function releaseAiRequest(controller: AbortController): void {
  inFlight.delete(controller);
}

export function abortAllAi(): void {
  inFlight.forEach(c => { try { c.abort(); } catch { /* noop */ } });
  inFlight.clear();
}

/** 在应用入口安装一次；重复调用无副作用（React StrictMode 安全） */
export function installAiKillSwitch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: any, init?: RequestInit) => {
    if (isAiLocked() && isAiRequest(requestUrl(input))) {
      return Promise.reject(new Error('AI 功能已紧急停止（API 已抹除），请在「设置 → 模型调试」中恢复。'));
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;
}
