import type { Graph } from './types.ts';
export function validateGraph(graph: Graph) {
  const errors: string[] = [];
  const ids = new Set<string>(['node_0']);
  if (!graph?.centerSolution || graph.centerSolution.id !== 'node_0') errors.push('中心节点必须且只能为 node_0');
  for (const n of graph.nodes ?? []) { if (ids.has(n.id)) errors.push(`节点 ID 重复：${n.id}`); ids.add(n.id); if (![1,2,3].includes(n.layer)) errors.push(`${n.id} layer 必须为 1、2 或 3`); if (!n.sourceRefs?.length) errors.push(`${n.id} 缺少来源引用`); }
  const categories = new Set((graph.categories ?? []).map(c => c.id));
  const categoryIds = new Set((graph.categories ?? []).map(c => c.id));
  for (const n of graph.nodes ?? []) { if (!categoryIds.has(n.category)) errors.push(`${n.id} 类别未定义：${n.category}`); for (const p of n.prerequisites ?? []) if (!ids.has(p) || p === 'node_0') errors.push(`${n.id} 前置节点不存在：${p}`); }
  for (const c of graph.categories ?? []) if (!/^#[0-9a-f]{6}$/i.test(c.color)) errors.push(`类别 ${c.id} 颜色格式错误`);
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string): boolean { if (visiting.has(id)) return false; if (visited.has(id)) return true; visiting.add(id); const n = nodeMap.get(id); for (const p of n?.prerequisites ?? []) if (!visit(p)) return false; visiting.delete(id); visited.add(id); return true; }
  for (const n of graph.nodes) if (!visit(n.id)) { errors.push('prerequisites 存在环'); break; }
  for (const n of graph.nodes ?? []) if (!n.assessment || n.assessment.options.length < 2 || !n.assessment.options.includes(n.assessment.answer)) errors.push(`${n.id} 测评答案或选项无效`);
  if (categories.size !== graph.categories.length) errors.push('类别 ID 重复');
  return { valid: errors.length === 0, errors };
}
