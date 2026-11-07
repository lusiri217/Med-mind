export type Assessment = { question: string; options: string[]; answer: string; passScore: number };
export type GraphNode = { id: string; title: string; question: string; category: string; layer: number; content: string; sourceRefs: string[]; prerequisites: string[]; assessment: Assessment; status: 'locked' | 'available' | 'completed' | 'teacher_unlocked' };
export type Category = { id: string; name: string; color: string; shape?: string };
export type Graph = { caseId: string; caseTitle: string; centerSolution: { id: 'node_0'; title: string; content: string; sourceRefs: string[] }; categories: Category[]; nodes: GraphNode[]; edges: { source: string; target: string; type: 'radial' | 'prerequisite' }[]; templateId?: TemplateId };
export type Harness = { model: string; temperature: number; top_p: number; max_tokens: number; systemPrompt: string; preset: string };
/* 第 3 步：预置教学案例在银河条目上带模板绑定与示例标记；Graph 结构保持不变 */
export type GalaxyItem = { id: string; title: string; savedAt: number; nodeCount: number; graph: Graph; templateId?: TemplateId; preset?: boolean };

/* ── 第 1 步：静态站 + 纯 BYOK 配置 ──
   不内置任何厂商地址；baseUrl / model / apiKey 全部由使用者自行填写。 */
export type LlmProtocol = 'openai' | 'anthropic';
export type ByokConfig = { baseUrl: string; apiKey: string; model: string; protocol: LlmProtocol; remember: boolean };

/* ── 第 2 步：五套 3D 模板（实现见 src/layouts/） ──
   orbit 星系同心轨道 / radial 方案中心发散 / timeline 诊疗时间轴
   tree 分层推理树 / cluster 知识域聚类 */
export type TemplateId = 'orbit' | 'radial' | 'timeline' | 'tree' | 'cluster';

/* ── 第 5 步：2D 卡片画布类型定义在 src/cards/types.ts（零依赖模块） ──
   这里保留同名导出，方便旧代码继续从 types 引用。 */
export type { Card, CardDoc, CardLink, CardLibrary } from './cards/types';
