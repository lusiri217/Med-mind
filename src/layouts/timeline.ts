import type { Graph, GraphNode } from '../types';
import type { GuideLine, LayoutFn, LayoutResult, NodePlacement, Vec3 } from './types';
import { segment, SUN_COLOR, vec } from './types';

/**
 * ③ 诊疗时间轴 · DNA 双螺旋
 *
 * 模板名与 templateId 均沿用 timeline，只把几何从「X 轴五段直线」换成：
 *  - 两条相位相反的骨架链沿 Y 轴盘旋上升，顶端半径收束到 0；
 *  - 五个临床阶段各占一段高度，阶段内的知识点两两配对，落在横档两端（碱基对）；
 *  - 双链最终汇合于 node_0「病例最终解决方案」—— 即流程的终点。
 * 纯静态、不公转；Graph 数据、AI 模板推荐规则、其余四套模板均不受影响。
 */
const STAGES = [
  { cat: 'physiology', label: '基础与背景', color: '#7C9A82' },
  { cat: 'pathology', label: '病理机制', color: '#C4776B' },
  { cat: 'diagnosis', label: '检查与诊断', color: '#C79A5B' },
  { cat: 'treatment', label: '治疗与处置', color: '#7C93B8' },
  { cat: 'pharm', label: '用药与随访', color: '#A98BB0' },
] as const;

const STRAND_A = '#6E8FA6';
const STRAND_B = '#B08A79';
const TURNS = 2.5;          // 螺旋圈数
const R = 88;               // 螺旋半径
const Y_BOTTOM = -260;      // 起点高度（基础）
const Y_TOP = 235;          // 终点高度（最终方案）
const NODE_T_MAX = 0.86;    // 节点只占前 86% 高度，末段留给双链收束
const TAPER_FROM = 0.86;    // 半径开始收束的位置

export const timelineLayout: LayoutFn = (graph: Graph): LayoutResult => {
  const placements: Record<string, NodePlacement> = {
    node_0: { id: 'node_0', position: vec(0, Y_TOP, 0) },
  };
  const guides: GuideLine[] = [];

  const stageIndex: Record<string, number> = {};
  STAGES.forEach((s, i) => { stageIndex[s.cat] = i; });
  const ordered: GraphNode[] = [...graph.nodes].sort((a, b) =>
    (stageIndex[a.category] ?? 2) - (stageIndex[b.category] ?? 2) || a.layer - b.layer,
  );

  const radiusAt = (t: number) => t <= TAPER_FROM ? R : R * Math.max(0, (1 - t) / (1 - TAPER_FROM));
  const yAt = (t: number) => Y_BOTTOM + (Y_TOP - Y_BOTTOM) * t;
  const angleAt = (t: number) => t * TURNS * Math.PI * 2;
  const strandPoint = (t: number, sign: 1 | -1) => {
    const a = angleAt(t), r = radiusAt(t), y = yAt(t);
    return vec(sign * Math.cos(a) * r, y, sign * Math.sin(a) * r);
  };

  // 两条骨架链：连续采样成折线，顶端收束到中心球
  const samples = 120;
  const chainA: Vec3[] = [];
  const chainB: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    chainA.push(strandPoint(t, 1));
    chainB.push(strandPoint(t, -1));
  }
  guides.push({ points: chainA, color: STRAND_A, opacity: 0.82 });
  guides.push({ points: chainB, color: STRAND_B, opacity: 0.82 });

  // 按范畴归组，每组内两两配对成横档；节点落在横档两端
  const buckets: GraphNode[][] = STAGES.map(() => []);
  ordered.forEach(n => buckets[stageIndex[n.category] ?? 2].push(n));

  buckets.forEach((arr, si) => {
    const stage = STAGES[si];
    const rungs = Math.max(1, Math.ceil(arr.length / 2));
    for (let k = 0; k < rungs; k++) {
      // 组内均分高度，整体压到 NODE_T_MAX 以内，避免挤进收束段
      const t = ((si + (k + 0.5) / rungs) / STAGES.length) * NODE_T_MAX;
      const pa = strandPoint(t, 1);
      const pb = strandPoint(t, -1);
      const first = arr[k * 2], second = arr[k * 2 + 1];
      if (first) placements[first.id] = { id: first.id, position: pa };
      if (second) placements[second.id] = { id: second.id, position: pb };
      guides.push({ points: segment(pa, pb), color: stage.color, opacity: 0.72 });
    }
  });

  // 终点：两条短引导线接到中心球，强调「止于病例最终解决方案」
  const joinT = 0.94;
  guides.push({ points: segment(strandPoint(joinT, 1), vec(0, Y_TOP, 0)), color: SUN_COLOR, opacity: 0.5 });
  guides.push({ points: segment(strandPoint(joinT, -1), vec(0, Y_TOP, 0)), color: SUN_COLOR, opacity: 0.5 });

  return {
    placements,
    guides,
    rotates: false,
    camera: { position: vec(520, 110, 900), lookAt: vec(0, -10, 0) },
    hints: [
      ...STAGES.map((s, si) => ({ color: s.color, label: `${s.label} · 第 ${si + 1} 段` })),
      { color: STRAND_A, label: '骨架链 A' },
      { color: STRAND_B, label: '骨架链 B' },
      { color: SUN_COLOR, label: '终点 · 病例最终解决方案' },
    ],
    showPrerequisiteLinks: false,
    linkOpacity: 0,
  };
};
