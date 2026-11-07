import type { CardDoc } from './types';

/** 每张作品一份独立的撤销/重做栈，key 为 CardDoc.id */
export type CardHistory = { past: CardDoc[]; future: CardDoc[] };
export type HistoryMap = Record<string, CardHistory>;
export const HISTORY_LIMIT = 60;

export const EMPTY_HISTORY: CardHistory = { past: [], future: [] };

const snap = (doc: CardDoc): CardDoc => JSON.parse(JSON.stringify(doc)) as CardDoc;

export function historyOf(map: HistoryMap, docId: string): CardHistory {
  return map[docId] ?? EMPTY_HISTORY;
}

/** 记录一次可撤销的修改：before 是修改前的完整快照，after 是当前文档 */
export function commit(map: HistoryMap, docId: string, before: CardDoc, after: CardDoc): HistoryMap {
  if (JSON.stringify(before) === JSON.stringify(after)) return map;
  const h = historyOf(map, docId);
  return {
    ...map,
    [docId]: { past: [...h.past, snap(before)].slice(-HISTORY_LIMIT), future: [] },
  };
}

export function canUndo(map: HistoryMap, docId: string): boolean {
  return historyOf(map, docId).past.length > 0;
}
export function canRedo(map: HistoryMap, docId: string): boolean {
  return historyOf(map, docId).future.length > 0;
}

export function undo(map: HistoryMap, docId: string, current: CardDoc): { map: HistoryMap; doc: CardDoc } | null {
  const h = historyOf(map, docId);
  if (!h.past.length) return null;
  const doc = h.past[h.past.length - 1];
  return {
    map: { ...map, [docId]: { past: h.past.slice(0, -1), future: [...h.future, snap(current)].slice(-HISTORY_LIMIT) } },
    doc: snap(doc),
  };
}

export function redo(map: HistoryMap, docId: string, current: CardDoc): { map: HistoryMap; doc: CardDoc } | null {
  const h = historyOf(map, docId);
  if (!h.future.length) return null;
  const doc = h.future[h.future.length - 1];
  return {
    map: { ...map, [docId]: { past: [...h.past, snap(current)].slice(-HISTORY_LIMIT), future: h.future.slice(0, -1) } },
    doc: snap(doc),
  };
}
