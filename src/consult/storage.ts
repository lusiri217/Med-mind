/** 问诊会话与「当前案例文本」的独立持久化：不写进 medmind-harness-v1，不占神经元 10 个名额 */
import { emptySession, type ConsultMessage, type ConsultRole, type ConsultSession, type ConsultSource } from './types';

export const CONSULT_STORAGE_KEY = 'medmind-consult-v1';
export const CASE_TEXT_KEY = 'medmind-case-text-v1';

const MAX_MESSAGES = 200;
const MAX_CASE = 24000;
const MAX_TEXT = 6000;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function normalizeMessage(raw: any): ConsultMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const role: ConsultRole = raw.role === 'user' || raw.role === 'patient' || raw.role === 'system' ? raw.role : 'system';
  const text = String(raw.text ?? '').slice(0, MAX_TEXT);
  if (!text) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `m_${Math.random().toString(36).slice(2, 9)}`,
    role, text, at: num(raw.at, Date.now()),
    stage: typeof raw.stage === 'number' ? clamp(Math.round(raw.stage), 0, 5) : undefined,
  };
}

/** 读取本机问诊会话；数据损坏或首次访问时返回 null（不自动造会话） */
export function loadConsultSession(): ConsultSession | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(CONSULT_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    const caseText = String(p.caseText ?? '').slice(0, MAX_CASE);
    if (!caseText.trim()) return null;
    const messages: ConsultMessage[] = (Array.isArray(p.messages) ? p.messages : [])
      .map(normalizeMessage).filter((m: ConsultMessage | null): m is ConsultMessage => !!m)
      .slice(-MAX_MESSAGES);
    const source: ConsultSource = ['upload', 'paste', 'current', 'neuron'].includes(p.source) ? p.source : 'upload';
    return {
      caseTitle: String(p.caseTitle ?? '临床案例').slice(0, 120) || '临床案例',
      caseText, source,
      startedAt: num(p.startedAt, Date.now()),
      messages,
      stage: clamp(Math.round(num(p.stage)), 0, 5),
      progress: clamp(Math.round(num(p.progress)), 0, 100),
      helix3D: p.helix3D !== false,
    };
  } catch { return null; }
}

export function saveConsultSession(session: ConsultSession | null): void {
  const ls = storage();
  if (!ls) return;
  try {
    if (!session) { ls.removeItem(CONSULT_STORAGE_KEY); return; }
    ls.setItem(CONSULT_STORAGE_KEY, JSON.stringify(session));
  } catch { /* 隐私模式 / 配额不足时退化为内存态 */ }
}

export function freshSession(patch: Partial<ConsultSession> = {}): ConsultSession {
  return { ...emptySession(), ...patch };
}

export type CaseTextSnapshot = { text: string; fileName: string };

/** 「使用当前案例」：左侧上传面板的文本同步在这里，聊天框只读 */
export function loadCaseText(): CaseTextSnapshot {
  const ls = storage();
  if (!ls) return { text: '', fileName: '' };
  try {
    const raw = ls.getItem(CASE_TEXT_KEY);
    if (!raw) return { text: '', fileName: '' };
    const p = JSON.parse(raw);
    return {
      text: String(p?.text ?? '').slice(0, MAX_CASE),
      fileName: String(p?.fileName ?? '').slice(0, 120),
    };
  } catch { return { text: '', fileName: '' }; }
}

export function saveCaseText(v: CaseTextSnapshot): void {
  const ls = storage();
  if (!ls) return;
  try { ls.setItem(CASE_TEXT_KEY, JSON.stringify({ text: String(v.text ?? '').slice(0, MAX_CASE), fileName: String(v.fileName ?? '').slice(0, 120) })); }
  catch { /* noop */ }
}
