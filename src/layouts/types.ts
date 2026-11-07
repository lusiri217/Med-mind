import type { Graph, TemplateId } from '../types';

/**
 * 五套模板共用的布局契约。
 * 布局函数是纯函数：只读 Graph，输出「节点放在哪、怎么动、画什么辅助线、相机怎么看」，
 * 不依赖 three / DOM / React，Graph3D 只负责把结果画出来。
 */

export type Vec3 = { x: number; y: number; z: number };

/** 公转统一为绕 Y 轴的圆周运动：位置 = (cos(angle)*radius, y, sin(angle)*radius)。
 *  星系用它让同层节点沿轨道跑；聚类用它让整幅图缓慢自转（角度取节点实际方位角）。 */
export type OrbitSpec = { radius: number; angle: number; speed: number; y: number };

export type NodePlacement = {
  id: string;
  position: Vec3;
  orbit?: OrbitSpec;
};

/** 辅助几何统一用折线点列描述；闭合圆环由布局函数自行把首点追加到末尾 */
export type GuideLine = { points: Vec3[]; color: string; opacity: number };

export type LayoutHint = { color: string; label: string };

export type LayoutResult = {
  placements: Record<string, NodePlacement>;
  guides: GuideLine[];
  rotates: boolean;
  camera: { position: Vec3; lookAt: Vec3 };
  hints: LayoutHint[];
  showPrerequisiteLinks: boolean;
  linkOpacity: number;
};

export type TemplateMeta = {
  id: TemplateId;
  name: string;
  mode: string;
  description: string;
  rotates: boolean;
};

export type LayoutFn = (graph: Graph) => LayoutResult;

export const SUN_COLOR = '#C15F3C';
export const NEUTRAL_LINE = '#BDB6A8';

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function orbitPosition(o: OrbitSpec, angle = o.angle): Vec3 {
  return { x: Math.cos(angle) * o.radius, y: o.y, z: Math.sin(angle) * o.radius };
}

/** XZ 平面上的闭合圆环点列（首尾同点，可直接交给 THREE.Line） */
export function circlePoints(radius: number, y = 0, segments = 160, cx = 0, cz = 0): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * radius, y, z: cz + Math.sin(a) * radius });
  }
  return pts;
}

export function segment(a: Vec3, b: Vec3): Vec3[] {
  return [a, b];
}
