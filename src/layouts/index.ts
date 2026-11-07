import type { Graph, TemplateId } from '../types';
import type { LayoutFn, LayoutResult, TemplateMeta } from './types';
import { orbitLayout } from './orbit';
import { radialLayout } from './radial';
import { timelineLayout } from './timeline';
import { treeLayout } from './tree';
import { clusterLayout } from './cluster';

/** 五套模板的注册表：几何形态互不重复，分别代表一种思维模式 */
export const TEMPLATES: TemplateMeta[] = [
  { id: 'orbit', name: '星系同心轨道', mode: '分层递进', description: '知识点按基础→机制→决策分列三条同心轨道，内圈快外圈慢，适合按学习顺序逐级推进。', rotates: true },
  { id: 'radial', name: '方案中心发散', mode: '中心辐射', description: '以最终解决方案为核，五个知识范畴各占一个扇区，临床决策最内、基础知识最外。', rotates: false },
  { id: 'timeline', name: '诊疗时间轴', mode: '流程推进', description: '以 DNA 双螺旋呈现临床路径：五个阶段化作碱基对横档沿双链上升，两条骨架链最终收束于病例最终解决方案。', rotates: false },
  { id: 'tree', name: '分层推理树', mode: '演绎拆解', description: '最终方案为根节点，自上而下逐层分叉，连线即真实的前置依赖，适合复盘推理链。', rotates: false },
  { id: 'cluster', name: '知识域聚类', mode: '横向盘点', description: '五个范畴各成球状知识簇，整幅图缓慢自转，适合横向比较与查漏补缺。', rotates: true },
];

export const TEMPLATE_IDS: TemplateId[] = TEMPLATES.map(t => t.id);

const LAYOUTS: Record<TemplateId, LayoutFn> = {
  orbit: orbitLayout,
  radial: radialLayout,
  timeline: timelineLayout,
  tree: treeLayout,
  cluster: clusterLayout,
};

/** 兼容旧 localStorage 里的非法值，始终回退星系 */
export function normalizeTemplateId(v: unknown): TemplateId {
  return TEMPLATE_IDS.includes(v as TemplateId) ? (v as TemplateId) : 'orbit';
}

export function getTemplate(v: unknown): TemplateMeta {
  const id = normalizeTemplateId(v);
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}

/** 全站唯一布局入口：同一份 Graph 数据可套任意模板 */
export function getLayout(graph: Graph, id: unknown): LayoutResult {
  return LAYOUTS[normalizeTemplateId(id)](graph);
}

export type { LayoutResult, GuideLine, LayoutHint, NodePlacement, OrbitSpec, Vec3, TemplateMeta, LayoutFn } from './types';
export { orbitPosition, SUN_COLOR, NEUTRAL_LINE, circlePoints, segment, vec } from './types';
