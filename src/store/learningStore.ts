import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ByokConfig, CardDoc, GalaxyItem, Graph, GraphNode, Harness, TemplateId } from '../types';
import { abortAllAi, setAiLocked } from '../aiSwitch';
import { clearByok, EMPTY_BYOK, loadByok, saveByok } from '../config/byok';
import { normalizeTemplateId } from '../layouts';
import { buildPresetItems } from '../presets';
import { cloneDocForImport, createDoc, loadCardLibrary, saveCardLibrary } from '../cards/io';
import { DEFAULT_PATIENT_PROMPT } from '../consult/prompt';
import { loadConsultSession, saveConsultSession } from '../consult/storage';
import type { ConsultSession } from '../consult/types';

// 卡片作品独立存一份 localStorage，不写进 medmind-harness-v1，也不占银河的 10 个名额
const bootCards = loadCardLibrary();

const initialHarness: Harness = { model: 'mock-medmind', temperature: 0.3, top_p: 0.9, max_tokens: 4096, preset: '临床推理模式', systemPrompt: '基于用户上传的案例和明确指定的教材生成教学问题。不得编造教材引文；没有页码依据时标记“待教师补充”。逐层设置前置知识。医学内容仅供教学辅助。' };

const MAX_GALAXY = 10;

/** 右侧抽屉面板的入口；左侧栏只负责导航，不承载表单 */
export type PanelId = 'upload' | 'neuron' | 'cards' | 'model' | 'graph' | 'consultPrompt';

type Store = {
  harness: Harness; graph: Graph | null; selectedId: string | null;
  viewed: string[]; completed: string[]; outline: boolean; collapsed: boolean; search: string;
  galaxy: GalaxyItem[];
  orbitPaused: boolean;                 // 3D 公转暂停（不持久化，刷新后恢复运行）
  byok: ByokConfig;                     // 当前会话配置；持久化由 config/byok.ts 单独负责
  templateId: TemplateId;               // 3D 布局模板（全局视图偏好，持久化）
  aiLocked: boolean;                    // AI 紧急停止总闸（持久化）
  aiStoppedAt: number | null;
  presetsSeeded: boolean;               // 预置案例已注入过；删掉示例后不再自动灌回
  lastOpenedId: string | null;          // 最近打开的银河条目，刷新后自动回看
  /* ── 第 5 步：2D 卡片画布 ── */
  cardsMode: boolean;                   // 第三态视图；与 outline 互斥
  cardDocs: CardDoc[];                  // 独立作品库（由 cards/io.ts 单独持久化）
  activeCardDocId: string | null;
  panel: PanelId | null;               // 右侧抽屉当前显示的面板；与节点详情互斥
  /* ── 第 7 步：模拟问诊（第四态，默认首屏） ──
     consultMode 不持久化：每次打开都先看到「左侧栏 + 聊天框」。
     会话本身存独立 medmind-consult-v1，不占神经元名额。 */
  consultMode: boolean;
  consultPrompt: string;               // 患者提示词，可在「设置 → 问诊提示词」编辑
  consult: ConsultSession | null;      // 当前问诊会话；null = 尚未载入案例
  setHarness: (h: Partial<Harness>) => void; setGraph: (g: Graph, templateId?: TemplateId) => void;
  select: (id: string | null) => void; markViewed: (id: string) => void; complete: (id: string) => void;
  setOutline: (b: boolean) => void; setCollapsed: (b: boolean) => void; setSearch: (s: string) => void;
  resetProgress: () => void;
  loadFromGalaxy: (id: string) => void; removeFromGalaxy: (id: string) => void;
  setOrbitPaused: (b: boolean) => void;
  setTemplateId: (id: TemplateId) => void;
  seedPresets: () => boolean;
  setByok: (p: Partial<ByokConfig>) => void;
  saveByokConfig: () => void;
  eraseApi: () => void; restoreAi: () => void;
  setCardsMode: (b: boolean) => void;
  createCardDoc: (title?: string) => string;
  openCardDoc: (id: string) => void;
  removeCardDoc: (id: string) => void;
  updateCardDoc: (doc: CardDoc) => void;
  importCardDoc: (doc: CardDoc) => string;
  setPanel: (p: PanelId | null) => void;
  setConsultMode: (b: boolean) => void;
  setConsultPrompt: (v: string) => void;
  resetConsultPrompt: () => void;
  setConsult: (up: (prev: ConsultSession | null) => ConsultSession | null) => void;
  clearConsult: () => void;
};

export const useLearningStore = create<Store>()(persist((set, get) => ({
  harness: initialHarness,
  graph: null, selectedId: null, viewed: [], completed: [],
  outline: typeof window !== 'undefined' && window.innerWidth < 760,
  collapsed: false, search: '', galaxy: [],
  orbitPaused: false, byok: loadByok(), templateId: 'orbit', aiLocked: false, aiStoppedAt: null,
  presetsSeeded: false, lastOpenedId: null,
  cardsMode: false, cardDocs: bootCards.docs, activeCardDocId: bootCards.activeId, panel: null,
  consultMode: true, consultPrompt: DEFAULT_PATIENT_PROMPT, consult: loadConsultSession(),

  setHarness: h => set(s => ({ harness: { ...s.harness, ...h } })),

  // 每次生成都自动收进银河，按 caseId 去重，最多保留 10 个（超出丢弃最早的）。
  // 生成时的模板一并写入条目，回看时能还原当时的形态；同时记住最近打开的作品。
  setGraph: (graph, templateId) => set(s => {
    const tpl = templateId ? normalizeTemplateId(templateId) : s.templateId;
    return {
      graph, selectedId: null, viewed: [], completed: [],   // 生成后不自动弹详情，先让用户看到完整图谱
      ...(templateId ? { templateId: tpl } : {}),
      lastOpenedId: graph.caseId,
      galaxy: [
        { id: graph.caseId, title: graph.caseTitle, savedAt: Date.now(), nodeCount: graph.nodes.length, graph, templateId: tpl },
        ...s.galaxy.filter(x => x.id !== graph.caseId),
      ].slice(0, MAX_GALAXY),
    };
  }),

  // 首访注入 5 个预置教学案例。只执行一次；用户删除示例后靠 presetsSeeded 保持不再复活
  seedPresets: () => {
    if (get().presetsSeeded) return false;
    const items = buildPresetItems();
    set(s => ({
      galaxy: [...items, ...s.galaxy.filter(x => !items.some(p => p.id === x.id))].slice(0, MAX_GALAXY),
      presetsSeeded: true,
    }));
    return true;
  },

  // 右侧抽屉与节点详情互斥：打开节点详情时收起面板
  select: selectedId => set(selectedId ? { selectedId, panel: null } : { selectedId }),
  markViewed: id => set(s => ({ viewed: s.viewed.includes(id) ? s.viewed : [...s.viewed, id] })),

  // 学习进度完全由本机状态层管理，静态站不再向任何 /api 上报
  complete: id => {
    const s = get(); if (!s.graph) return;
    const node = s.graph.nodes.find(n => n.id === id); if (!node) return;
    const unmet = node.prerequisites.filter(p => !s.completed.includes(p)); if (unmet.length) return;
    set(state => ({ completed: state.completed.includes(id) ? state.completed : [...state.completed, id] }));
  },

  // 三态视图互斥：进 2D 大纲或卡片画布时自动退出另一态，返回 3D 时两者都关
  setOutline: outline => set({ outline, ...(outline ? { cardsMode: false, consultMode: false } : {}) }),
  setCollapsed: collapsed => set({ collapsed }),
  setSearch: search => set({ search }),
  resetProgress: () => set({ viewed: [], completed: [] }),

  // 回看已存图谱，不重复计入银河；条目自带模板时自动切到对应形态
  loadFromGalaxy: id => set(s => {
    const item = s.galaxy.find(x => x.id === id);
    if (!item) return {};
    return {
      graph: item.graph, selectedId: null, viewed: [], completed: [],
      lastOpenedId: id,
      ...(item.templateId ? { templateId: normalizeTemplateId(item.templateId) } : {}),
    };
  }),
  removeFromGalaxy: id => set(s => ({
    galaxy: s.galaxy.filter(x => x.id !== id),
    ...(s.lastOpenedId === id ? { lastOpenedId: null } : {}),
  })),

  setOrbitPaused: orbitPaused => set({ orbitPaused }),
  setTemplateId: id => set({ templateId: normalizeTemplateId(id) }),
  setByok: p => set(s => ({ byok: { ...s.byok, ...p } })),
  saveByokConfig: () => set(s => ({ byok: saveByok(s.byok) })),

  // 抹除 API + 紧急停止：中止在途请求 → 落下总闸 → 抹除本机密钥与连接信息
  eraseApi: () => {
    abortAllAi();
    setAiLocked(true);
    clearByok();
    set({ aiLocked: true, aiStoppedAt: Date.now(), byok: { ...EMPTY_BYOK } });
  },

  // 恢复只解除锁定，不回填任何凭据 —— 需要用户重新填写
  restoreAi: () => {
    setAiLocked(false);
    set({ aiLocked: false, aiStoppedAt: null });
  },

  /* ── 第 5 步：卡片作品库（独立持久化，与银河互不占用名额） ── */
  setCardsMode: b => set({ cardsMode: b, ...(b ? { outline: false, consultMode: false, selectedId: null } : {}) }),

  createCardDoc: title => {
    const d = createDoc(title);
    set(s => {
      const docs = [d, ...s.cardDocs];
      saveCardLibrary({ docs, activeId: d.id });
      return { cardDocs: docs, activeCardDocId: d.id, cardsMode: true, consultMode: false, outline: false, selectedId: null };
    });
    return d.id;
  },

  openCardDoc: id => set(s => {
    if (!s.cardDocs.some(d => d.id === id)) return {};
    saveCardLibrary({ docs: s.cardDocs, activeId: id });
    return { activeCardDocId: id, cardsMode: true, consultMode: false, outline: false, selectedId: null };
  }),

  removeCardDoc: id => set(s => {
    const docs = s.cardDocs.filter(d => d.id !== id);
    const activeId = s.activeCardDocId === id ? (docs[0]?.id ?? null) : s.activeCardDocId;
    saveCardLibrary({ docs, activeId });
    return { cardDocs: docs, activeCardDocId: activeId };
  }),

  updateCardDoc: doc => set(s => {
    const docs = s.cardDocs.map(d => d.id === doc.id ? { ...doc, savedAt: Date.now() } : d);
    saveCardLibrary({ docs, activeId: s.activeCardDocId });
    return { cardDocs: docs };
  }),

  importCardDoc: doc => {
    const d = cloneDocForImport(doc);
    set(s => {
      const docs = [d, ...s.cardDocs];
      saveCardLibrary({ docs, activeId: d.id });
      return { cardDocs: docs, activeCardDocId: d.id, cardsMode: true, consultMode: false, outline: false, selectedId: null };
    });
    return d.id;
  },

  // 打开右侧面板时收起节点详情；关闭面板只清 panel，不动 selectedId
  setPanel: p => set(p ? { panel: p, selectedId: null } : { panel: null }),

  /* ── 模拟问诊 ── */
  // 进问诊时清掉另外三态与抽屉/详情，保证首屏只有「左侧栏 + 聊天框」
  setConsultMode: b => set(b
    ? { consultMode: true, cardsMode: false, outline: false, panel: null, selectedId: null }
    : { consultMode: false }),
  setConsultPrompt: v => set({ consultPrompt: v }),
  resetConsultPrompt: () => set({ consultPrompt: DEFAULT_PATIENT_PROMPT }),
  // 每次变更同步写入独立 key；会话不进入 medmind-harness-v1
  setConsult: up => set(s => {
    const next = up(s.consult);
    saveConsultSession(next);
    return { consult: next };
  }),
  clearConsult: () => {
    saveConsultSession(null);
    set({ consult: null });
  },
}), {
  name: 'medmind-harness-v1',
  partialize: s => ({ harness: s.harness, collapsed: s.collapsed, galaxy: s.galaxy, templateId: s.templateId, aiLocked: s.aiLocked, aiStoppedAt: s.aiStoppedAt, presetsSeeded: s.presetsSeeded, lastOpenedId: s.lastOpenedId, consultPrompt: s.consultPrompt }),
}));

export const isAvailable = (node: GraphNode, completed: string[]) => node.prerequisites.every(p => completed.includes(p));
