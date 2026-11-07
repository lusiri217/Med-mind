import type { Graph, GraphNode } from '../types';
import type { GuideLine, LayoutFn, LayoutResult, NodePlacement } from './types';
import { circlePoints, segment, SUN_COLOR, vec, NEUTRAL_LINE } from './types';

/** ② 方案中心发散 · 以最终解决方案为核心，按知识范畴分扇区、按层级由内向外辐射 */
const SECTOR_SPAN = (Math.PI * 2) / 5;

export const radialLayout: LayoutFn = (graph: Graph): LayoutResult => {
  const placements: Record<string, NodePlacement> = {
    node_0: { id: 'node_0', position: vec(0, 0, 0) },
  };
  const catIds = graph.categories.length
    ? graph.categories.map(c => c.id)
    : ['physiology', 'pathology', 'diagnosis', 'treatment', 'pharm'];
  const colorOf = (id: string) => graph.categories.find(c => c.id === id)?.color || '#9AAF94';
  const nameOf = (id: string) => graph.categories.find(c => c.id === id)?.name || id;
  const groups = new Map<string, GraphNode[]>();
  catIds.forEach(id => groups.set(id, []));
  graph.nodes.forEach(n => {
    const key = groups.has(n.category) ? n.category : catIds[0];
    groups.get(key)!.push(n);
  });

  const rays: GuideLine[] = [];
  catIds.forEach((cat, ci) => {
    const arr = groups.get(cat) || [];
    const base = (ci / Math.max(catIds.length, 1)) * Math.PI * 2 - Math.PI / 2;
    rays.push({
      points: segment(vec(0, 0, 0), vec(Math.cos(base) * 640, 0, Math.sin(base) * 640)),
      color: colorOf(cat),
      opacity: 0.32,
    });
    arr.forEach((n, j) => {
      const ring = Math.max(0, Math.min(2, n.layer - 1)); // 临床决策最内，基础知识最外
      const radius = 165 + ring * 150 + (j % 4) * 20;
      const spread = arr.length > 1 ? (j / (arr.length - 1) - 0.5) * 0.82 : 0;
      const angle = base + spread;
      placements[n.id] = {
        id: n.id,
        position: vec(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
      };
    });
  });

  return {
    placements,
    guides: [
      ...[165, 315, 465].map(r => ({ points: circlePoints(r), color: NEUTRAL_LINE, opacity: 0.16 } as GuideLine)),
      ...rays,
    ],
    rotates: false,
    camera: { position: vec(0, 720, 820), lookAt: vec(0, 0, 0) },
    hints: [
      ...catIds.map(id => ({ color: colorOf(id), label: `${nameOf(id)} · 知识扇区` })),
      { color: SUN_COLOR, label: '中心 · 解决方案' },
    ],
    showPrerequisiteLinks: false,
    linkOpacity: 0,
  };
};
