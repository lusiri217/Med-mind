/**
 * 问诊进度双螺旋的几何：参数与 src/layouts/timeline.ts 的 DNA 诊疗时间轴保持一致，
 * 但这里独立实现，不改动主图谱的布局函数（线上那版行为完全不受影响）。
 * 输出纯数字，3D（three）与 2D（SVG）共用同一套坐标。
 */
import { CONSULT_STAGES } from './types';

export type HVec = { x: number; y: number; z: number };
export type HRung = { a: HVec; b: HVec; t: number; index: number };

export const HELIX = {
  R: 88,
  Y_BOTTOM: -260,
  Y_TOP: 235,
  TURNS: 2.5,
  TAPER_FROM: 0.86,
  NODE_T_MAX: 0.86,
  SAMPLES: 120,
} as const;

export const vec = (x = 0, y = 0, z = 0): HVec => ({ x, y, z });

const radiusAt = (t: number) => t <= HELIX.TAPER_FROM
  ? HELIX.R : HELIX.R * Math.max(0, (1 - t) / (1 - HELIX.TAPER_FROM));
const yAt = (t: number) => HELIX.Y_BOTTOM + (HELIX.Y_TOP - HELIX.Y_BOTTOM) * t;
const angleAt = (t: number) => t * HELIX.TURNS * Math.PI * 2;

export function helixPoint(t: number, sign: 1 | -1): HVec {
  const a = angleAt(t), r = radiusAt(t);
  return vec(sign * Math.cos(a) * r, yAt(t), sign * Math.sin(a) * r);
}

export const HELIX_APEX = vec(0, HELIX.Y_TOP, 0);

export type HelixGeometry = {
  strandA: HVec[];
  strandB: HVec[];
  rungs: HRung[];
  joins: [HVec, HVec][];
  apex: HVec;
};

export function computeHelix(): HelixGeometry {
  const strandA: HVec[] = [];
  const strandB: HVec[] = [];
  for (let i = 0; i <= HELIX.SAMPLES; i++) {
    const t = i / HELIX.SAMPLES;
    strandA.push(helixPoint(t, 1));
    strandB.push(helixPoint(t, -1));
  }
  // 五个问诊阶段各占一根碱基对横档
  const n = CONSULT_STAGES.length;
  const rungs: HRung[] = CONSULT_STAGES.map((_, i) => {
    const t = ((i + 0.5) / n) * HELIX.NODE_T_MAX;
    return { a: helixPoint(t, 1), b: helixPoint(t, -1), t, index: i };
  });
  const joinT = 0.94;
  const joins: [HVec, HVec][] = [
    [helixPoint(joinT, 1), HELIX_APEX],
    [helixPoint(joinT, -1), HELIX_APEX],
  ];
  return { strandA, strandB, rungs, joins, apex: HELIX_APEX };
}

/** 按进度把一条骨架链切成「已点亮」/「未到达」两段，用于 3D 双色与 2D 渐变 */
export function splitStrand(points: HVec[], litT: number): { lit: HVec[]; dim: HVec[] } {
  const cut = Math.max(0, Math.min(1, litT));
  const idx = Math.max(1, Math.min(points.length, Math.round(cut * HELIX.SAMPLES) + 1));
  const head = points.slice(0, idx);
  const tail = points.slice(idx - 1);
  return { lit: head.length > 1 ? head : [], dim: tail.length > 1 ? tail : [] };
}

/** 2D 正交投影：忽略 z 得到经典 DNA 正弦曲线；z 只用于让「靠前」的横档略深一点 */
export function project(p: HVec, w: number, h: number): { x: number; y: number; depth: number } {
  const cx = w / 2, cy = h / 2;
  const scale = Math.min(w / 300, h / 590);
  return {
    x: cx + p.x * scale * 1.18,
    y: cy - (p.y + 12) * scale,
    depth: (p.z + HELIX.R) / (2 * HELIX.R),
  };
}
