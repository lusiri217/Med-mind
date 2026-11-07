import type { Graph, GraphNode } from '../types';
import type { GuideLine, LayoutFn, LayoutResult, NodePlacement } from './types';
import { circlePoints, segment, SUN_COLOR, vec, NEUTRAL_LINE } from './types';

/** ⑤ 知识域聚类 · 五个范畴各成球状簇，整幅图绕 Y 轴缓慢自转 */
const CLUSTER_RING = 400;
const GOLDEN_ANGLE = 2.39996323;

export const clusterLayout: LayoutFn = (graph: Graph): LayoutResult => {
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

  const guides: GuideLine[] = [];
  const spinSpeed = 0.000055; // 统一角速度 → 整幅图刚性自转，簇结构不散
  catIds.forEach((cat, ci) => {
    const a = (ci / Math.max(catIds.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(a) * CLUSTER_RING;
    const cz = Math.sin(a) * CLUSTER_RING;
    const cy = ci % 2 ? 70 : -70;
    guides.push({ points: circlePoints(126, cy, 96, cx, cz), color: colorOf(cat), opacity: 0.28 });
    guides.push({ points: segment(vec(0, 0, 0), vec(cx, cy, cz)), color: NEUTRAL_LINE, opacity: 0.18 });
    const arr = groups.get(cat) || [];
    const total = Math.max(arr.length, 1);
    arr.forEach((n, j) => {
      const k = j + 0.5;
      const r = 106 * Math.cbrt(k / total);
      const phi = Math.acos(1 - (2 * k) / total);
      const theta = j * GOLDEN_ANGLE;
      const x = cx + r * Math.sin(phi) * Math.cos(theta);
      const y = cy + r * Math.cos(phi);
      const z = cz + r * Math.sin(phi) * Math.sin(theta);
      placements[n.id] = {
        id: n.id,
        position: vec(x, y, z),
        // 角度取节点实际方位角、半径取到 Y 轴距离 → 自转时形状完全保持
        orbit: { radius: Math.hypot(x, z), angle: Math.atan2(z, x), speed: spinSpeed, y },
      };
    });
  });

  return {
    placements,
    guides,
    rotates: true,
    camera: { position: vec(0, 520, 1000), lookAt: vec(0, 0, 0) },
    hints: [
      ...catIds.map(id => ({ color: colorOf(id), label: `${nameOf(id)} · 知识簇` })),
      { color: SUN_COLOR, label: '中心 · 解决方案' },
    ],
    showPrerequisiteLinks: true,
    linkOpacity: 0.22,
  };
};
