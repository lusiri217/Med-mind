import {
  CARD_COLORS, CARD_DEFAULT_H, CARD_DEFAULT_W, CARD_MAX_H, CARD_MAX_W,
  CARD_MIN_H, CARD_MIN_W,
  type Card, type CardDoc, type CardLibrary, type CardLink,
} from './types';

/** 卡片作品独立使用一个 localStorage key，和银河（medmind-harness-v1）互不干扰 */
export const CARDS_STORAGE_KEY = 'medmind-cards-v1';
const MAX_DOCS = 40;
const MAX_TEXT = 8000;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function uid(prefix = 'c'): string {
  try {
    const g = globalThis as any;
    if (g.crypto?.randomUUID) return `${prefix}_${g.crypto.randomUUID()}`;
  } catch { /* 非安全上下文下退化 */ }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function createCard(patch: Partial<Card> = {}): Card {
  return {
    id: uid('card'), x: num(patch.x), y: num(patch.y),
    w: clamp(num(patch.w, CARD_DEFAULT_W), CARD_MIN_W, CARD_MAX_W),
    h: clamp(num(patch.h, CARD_DEFAULT_H), CARD_MIN_H, CARD_MAX_H),
    text: String(patch.text ?? '').slice(0, MAX_TEXT),
    color: CARD_COLORS.some(c => c.value === patch.color) ? patch.color! : CARD_COLORS[0].value,
    createdAt: num(patch.createdAt, Date.now()),
  };
}

export function createDoc(title = '未命名卡片画布', cards: Card[] = [], links: CardLink[] = []): CardDoc {
  return { id: uid('doc'), title: String(title).slice(0, 60) || '未命名卡片画布', savedAt: Date.now(), cards, links };
}

/** 把任意来源（localStorage / 导入文件）的 JSON 清洗成可信的 CardDoc；非法则返回 null */
export function normalizeDoc(raw: any): CardDoc | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null;
  const seen = new Set<string>();
  const cards: Card[] = raw.cards.slice(0, 300).map((c: any) => {
    let id = typeof c?.id === 'string' && c.id ? c.id : uid('card');
    if (seen.has(id)) id = uid('card');
    seen.add(id);
    return {
      id,
      x: clamp(num(c?.x), -20000, 20000), y: clamp(num(c?.y), -20000, 20000),
      w: clamp(num(c?.w, CARD_DEFAULT_W), CARD_MIN_W, CARD_MAX_W),
      h: clamp(num(c?.h, CARD_DEFAULT_H), CARD_MIN_H, CARD_MAX_H),
      text: String(c?.text ?? '').slice(0, MAX_TEXT),
      color: CARD_COLORS.some(k => k.value === c?.color) ? c.color : CARD_COLORS[0].value,
      createdAt: num(c?.createdAt, Date.now()),
    };
  });
  const linkSeen = new Set<string>();
  const rawLinks: any[] = Array.isArray(raw.links) ? raw.links : [];
  const links: CardLink[] = rawLinks
    .filter((l: any) => l && typeof l.source === 'string' && typeof l.target === 'string'
      && l.source !== l.target && seen.has(l.source) && seen.has(l.target))
    .map((l: any): CardLink => ({ id: typeof l.id === 'string' && l.id ? l.id : uid('link'), source: l.source, target: l.target }))
    .filter((l: CardLink) => {
      const key = `${l.source}>${l.target}`, rev = `${l.target}>${l.source}`;
      if (linkSeen.has(key) || linkSeen.has(rev)) return false;
      linkSeen.add(key); return true;
    });
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('doc'),
    title: String(raw.title ?? '未命名卡片画布').slice(0, 60) || '未命名卡片画布',
    savedAt: num(raw.savedAt, Date.now()), cards, links,
  };
}

/** 首次访问给一张可直接上手的示例画布；不自动切视图、不自动转 3D */
export function createStarterDoc(): CardDoc {
  const a = createCard({ x: 90,  y: 110, text: '主诉与病例线索\n把脱敏后的病例要点写在这里，一张卡只放一个想法。', color: CARD_COLORS[0].value });
  const b = createCard({ x: 400, y: 60,  text: '假设与鉴别诊断\n列出 2–3 个最可能的假设，以及支持/反对的证据。', color: CARD_COLORS[4].value });
  const c = createCard({ x: 400, y: 300, text: '下一步检查与决策\n需要什么检查来区分假设？结果会怎样改变处置？', color: CARD_COLORS[1].value });
  return {
    ...createDoc('我的第一张卡片画布', [a, b, c]),
    links: [{ id: uid('link'), source: a.id, target: b.id }, { id: uid('link'), source: b.id, target: c.id }],
  };
}

export function loadCardLibrary(): CardLibrary {
  const ls = storage();
  if (!ls) { const starter = createStarterDoc(); return { docs: [starter], activeId: starter.id }; }
  try {
    const raw = ls.getItem(CARDS_STORAGE_KEY);
    if (!raw) {
      const starter = createStarterDoc();
      const lib: CardLibrary = { docs: [starter], activeId: starter.id };
      ls.setItem(CARDS_STORAGE_KEY, JSON.stringify(lib));
      return lib;
    }
    const p = JSON.parse(raw);
    const docs = (Array.isArray(p?.docs) ? p.docs : [])
      .map(normalizeDoc).filter((d: CardDoc | null): d is CardDoc => !!d).slice(0, MAX_DOCS);
    const activeId = docs.some((d: CardDoc) => d.id === p?.activeId) ? p.activeId : (docs[0]?.id ?? null);
    return { docs, activeId };
  } catch {
    const starter = createStarterDoc();
    return { docs: [starter], activeId: starter.id };
  }
}

export function saveCardLibrary(lib: CardLibrary): void {
  const ls = storage();
  if (!ls) return;
  try { ls.setItem(CARDS_STORAGE_KEY, JSON.stringify(lib)); }
  catch { /* 隐私模式 / 配额不足时保持内存态 */ }
}

export function toJson(doc: CardDoc): string {
  return JSON.stringify({ ...doc, format: 'medmind-cards', version: 1 }, null, 2);
}

export function parseDocJson(text: string): CardDoc {
  let p: any;
  try { p = JSON.parse(text); } catch { throw new Error('不是有效的 JSON 文件'); }
  const doc = normalizeDoc(p);
  if (!doc) throw new Error('文件里没有找到 cards 卡片数组，请导入本工具导出的 .json');
  return doc;
}

/** 导入时生成新的 id，避免和本机已有作品/卡片撞车 */
export function cloneDocForImport(doc: CardDoc, title?: string): CardDoc {
  const idMap = new Map<string, string>();
  const cards = doc.cards.map(c => { const id = uid('card'); idMap.set(c.id, id); return { ...c, id }; });
  const links = doc.links
    .filter(l => idMap.has(l.source) && idMap.has(l.target))
    .map(l => ({ id: uid('link'), source: idMap.get(l.source)!, target: idMap.get(l.target)! }));
  return { ...createDoc(title ?? doc.title, cards, links) };
}

export function downloadDoc(doc: CardDoc): void {
  const safe = doc.title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'cards';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toJson(doc)], { type: 'application/json' }));
  a.download = `${safe}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readDocFile(file: File): Promise<CardDoc> {
  if (!/\.json$/i.test(file.name)) throw new Error('请选择 .json 文件');
  if (file.size > 2 * 1024 * 1024) throw new Error('文件过大（上限 2 MB）');
  return parseDocJson(await file.text());
}
