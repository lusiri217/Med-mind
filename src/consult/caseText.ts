import type { GalaxyItem, Graph } from '../types';

/**
 * 神经元里的预置/已存图谱没有原始病例全文，这里把标题、中心方案与节点要点
 * 拼成一份结构化病例摘要喂给患者模型；上传了原文时一律优先用原文（调用方决定）。
 */
export function graphToCaseText(g: Graph): string {
  const lines: string[] = [
    `病例名称：${g.caseTitle}`,
    `病例摘要（依据问题图谱整理）：`,
  ];
  const byLayer: Record<number, string[]> = { 3: [], 2: [], 1: [] };
  g.nodes.forEach(n => {
    const bucket = byLayer[n.layer];
    if (!bucket) return;
    const q = (n.question || n.title || '').trim();
    const c = (n.assessment?.answer || n.content || '').trim().split('\n')[0];
    if (q) bucket.push(`- ${q}${c ? `：${c}` : ''}`);
  });
  const L: [number, string][] = [
    [3, '基础背景与解剖生理'], [2, '病理机制与检查诊断'], [1, '临床决策与处置'],
  ];
  L.forEach(([layer, name]) => {
    const arr = (byLayer[layer] || []).slice(0, 14);
    if (arr.length) lines.push(`【${name}】`, ...arr);
  });
  lines.push('', `【教学用最终方案要点（患者本人不应掌握，仅供背景一致性校验）】${(g.centerSolution?.content || '').slice(0, 600)}`);
  return lines.join('\n').slice(0, 24000);
}

export function galaxyItemToCaseText(item: GalaxyItem): string {
  return graphToCaseText(item.graph);
}

/** 从任意文本里取一个简短标题 */
export function titleFromText(text: string, fallback = '临床案例'): string {
  const first = text.split('\n').map(s => s.trim()).find(Boolean) || '';
  return (first.replace(/^病例名称[:：]\s*/, '').slice(0, 40) || fallback);
}
