import type { Graph, GraphNode } from '../types';
import type { LayoutFn, LayoutResult, NodePlacement } from './types';
import { circlePoints, SUN_COLOR, vec } from './types';

/** ① 星系同心轨道 · 分层递进（第一轮太阳系布局，1:1 平移） */
const ORBIT_GAP = 155;
const ORBIT_TINT: Record<number, string> = { 1: '#C08A6E', 2: '#9AAF94', 3: '#94A6BE' };

export const orbitLayout: LayoutFn = (graph: Graph): LayoutResult => {
  const placements: Record<string, NodePlacement> = {
    node_0: { id: 'node_0', position: vec(0, 0, 0) },
  };
  const byLayer = new Map<number, GraphNode[]>();
  graph.nodes.forEach(n => {
    const arr = byLayer.get(n.layer) || [];
    arr.push(n);
    byLayer.set(n.layer, arr);
  });
  byLayer.forEach((arr, layer) => {
    const radius = layer * ORBIT_GAP;
    const speed = 0.00018 / Math.sqrt(layer); // 弧度 / 毫秒，内圈快外圈慢
    arr.forEach((n, i) => {
      const angle = (i / Math.max(arr.length, 1)) * Math.PI * 2 + layer * 0.4;
      placements[n.id] = {
        id: n.id,
        position: vec(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
        orbit: { radius, angle, speed, y: 0 },
      };
    });
  });

  return {
    placements,
    guides: [1, 2, 3].map(layer => ({
      points: circlePoints(layer * ORBIT_GAP),
      color: ORBIT_TINT[layer],
      opacity: 0.5,
    })),
    rotates: true,
    camera: { position: vec(0, 600, 960), lookAt: vec(0, 0, 0) },
    hints: [
      { color: ORBIT_TINT[3], label: '轨道 3 · 基础知识' },
      { color: ORBIT_TINT[2], label: '轨道 2 · 机制与诊断' },
      { color: ORBIT_TINT[1], label: '轨道 1 · 临床决策' },
      { color: SUN_COLOR, label: '中心 · 解决方案' },
    ],
    showPrerequisiteLinks: true,
    linkOpacity: 0.3,
  };
};
