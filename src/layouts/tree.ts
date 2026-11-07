import type { Graph, GraphNode } from '../types';
import type { GuideLine, LayoutFn, LayoutResult, NodePlacement } from './types';
import { segment, SUN_COLOR, vec } from './types';

/** ④ 分层推理树 · 顶部为最终方案，逐层向下分叉，边为真实父子依赖 */
const TREE_Y: Record<number, number> = { 1: 190, 2: -30, 3: -250 };
const TREE_TINT: Record<number, string> = { 1: '#C08A6E', 2: '#9AAF94', 3: '#94A6BE' };

export const treeLayout: LayoutFn = (graph: Graph): LayoutResult => {
  const placements: Record<string, NodePlacement> = {
    node_0: { id: 'node_0', position: vec(0, 400, 0) },
  };
  const byLayer = new Map<number, GraphNode[]>();
  graph.nodes.forEach(n => {
    const arr = byLayer.get(n.layer) || [];
    arr.push(n);
    byLayer.set(n.layer, arr);
  });
  byLayer.forEach((arr, layer) => {
    const spacing = Math.min(150, 1180 / Math.max(arr.length, 1));
    arr.forEach((n, i) => {
      placements[n.id] = {
        id: n.id,
        position: vec(
          (i - (arr.length - 1) / 2) * spacing,
          (TREE_Y[layer] ?? 0) + (i % 2 ? 14 : -14),
          ((i % 3) - 1) * 30,
        ),
      };
    });
  });

  const guides: GuideLine[] = [
    ...[1, 2, 3].map(layer => ({
      points: segment(vec(-600, TREE_Y[layer], 0), vec(600, TREE_Y[layer], 0)),
      color: TREE_TINT[layer], opacity: 0.2,
    })),
    { points: segment(vec(0, 400, 0), vec(0, 190, 0)), color: SUN_COLOR, opacity: 0.32 },
  ];

  return {
    placements,
    guides,
    rotates: false,
    camera: { position: vec(0, 80, 1180), lookAt: vec(0, 60, 0) },
    hints: [
      { color: SUN_COLOR, label: '根节点 · 解决方案' },
      { color: TREE_TINT[1], label: '第 1 层 · 临床决策' },
      { color: TREE_TINT[2], label: '第 2 层 · 机制与诊断' },
      { color: TREE_TINT[3], label: '第 3 层 · 基础知识' },
    ],
    showPrerequisiteLinks: true,
    linkOpacity: 0.45,
  };
};
