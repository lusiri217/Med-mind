import type { GalaxyItem, Graph, GraphNode } from '../types';
import { CATEGORIES, nodeSkeleton } from '../graph/mockGraph';
import { PRESET_CASES, type PresetCase } from './cases';

export { PRESET_CASES } from './cases';
export type { PresetCase, PresetTopic } from './cases';

/* 示例条目使用固定时间戳：只用于银河排序，界面上以「示例」标签显示而非具体时间 */
const PRESET_SAVED_AT = Date.UTC(2026, 0, 8, 1, 0, 0);

/** 把一套病例模板编译成标准 Graph：结构与 generateMockGraph 完全一致，
    但 29 个节点的问题、参考要点、测评选项与答案都来自该病例自身的模板库。 */
export function buildPresetGraph(p: PresetCase): Graph {
  const nodes: GraphNode[] = p.topics.map(([q, content, correct], i) => {
    const sk = nodeSkeleton(i);
    // 干扰项按索引轮换，正确答案的位置也随之轮换，避免答案永远在 A
    const others = [0, 1, 2].map(k => p.distractors[(i + k) % p.distractors.length]);
    const options = [...others];
    options.splice(i % 4, 0, correct);
    return {
      id: `node_${i + 1}`,
      title: q.replace(/[？?]/g, ''),
      question: q,
      category: sk.category,
      layer: sk.layer,
      content: `${content}\n\n病例线索：${p.summary}\n\n教学提示：本条目为预置教学示例，须结合指定教材核实，不构成临床建议。`,
      sourceRefs: ['预置教学案例：请核对指定教材及病例原文'],
      prerequisites: sk.prerequisites,
      assessment: { question: q, options, answer: correct, passScore: 0.8 },
      status: 'locked',
    };
  });
  const edges: Graph['edges'] = [];
  nodes.forEach(n => {
    edges.push({ source: 'node_0', target: n.id, type: 'radial' });
    n.prerequisites.forEach(pre => edges.push({ source: pre, target: n.id, type: 'prerequisite' }));
  });
  return {
    caseId: p.id,
    caseTitle: p.title,
    centerSolution: {
      id: 'node_0',
      title: '病例最终解决方案',
      content: p.solution,
      sourceRefs: ['预置教学案例：请核对指定教材及病例原文'],
    },
    categories: CATEGORIES,
    nodes,
    edges,
  };
}

/** 生成 5 个银河条目：绑定各自模板、标记为示例，顺序即模板展示顺序 */
export function buildPresetItems(): GalaxyItem[] {
  return PRESET_CASES.map((p, i) => ({
    id: p.id,
    title: p.title,
    savedAt: PRESET_SAVED_AT - i * 60_000,
    nodeCount: p.topics.length,
    graph: buildPresetGraph(p),
    templateId: p.templateId,
    preset: true,
  }));
}
