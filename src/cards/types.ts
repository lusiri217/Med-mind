/* ── 第 5 步：2D 卡片画布的数据模型（零依赖，纯类型 + 常量） ──
   卡片作品与「银河」完全独立：单独存储、单独命名、不占用 10 个名额。 */

export const CARD_COLORS = [
  { id: 'clay',   name: '陶土', value: '#C15F3C' },
  { id: 'sage',   name: '苔绿', value: '#6E8B62' },
  { id: 'amber',  name: '赭黄', value: '#A97E3E' },
  { id: 'lilac',  name: '灰紫', value: '#9A86A8' },
  { id: 'slate',  name: '蓝灰', value: '#7C93A6' },
] as const;

/** 建议上限：超过只提示、不阻断，避免复杂画布在浏览器里变慢 */
export const CARD_SOFT_LIMIT = 30;

export const CARD_DEFAULT_W = 224;
export const CARD_DEFAULT_H = 148;
export const CARD_MIN_W = 170;
export const CARD_MIN_H = 108;
export const CARD_MAX_W = 520;
export const CARD_MAX_H = 460;

export type Card = {
  id: string;
  x: number; y: number;          // 世界坐标（画布坐标，不含平移缩放）
  w: number; h: number;
  text: string;                  // 卡片正文；第一行为标题
  color: string;                 // CARD_COLORS 中的色值
  createdAt: number;
};

export type CardLink = {
  id: string;
  source: string;                // 起点卡片 id
  target: string;                // 终点卡片 id
};

export type CardDoc = {
  id: string;
  title: string;
  savedAt: number;
  cards: Card[];
  links: CardLink[];
};

export type CardLibrary = { docs: CardDoc[]; activeId: string | null };

export function firstLine(text: string): string {
  const line = String(text || '').split('\n').find(l => l.trim()) || '';
  return line.trim().slice(0, 42) || '空白卡片';
}
