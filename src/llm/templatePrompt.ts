import type { ByokConfig, TemplateId } from '../types';
import { TEMPLATES, getTemplate, normalizeTemplateId } from '../layouts';
import { LlmError, callLLM } from './client';

/** AI 选模板的结果。fallback=true 表示模型没给出可用判断，沿用当前模板。 */
export type TemplateChoice = {
  templateId: TemplateId;
  reason: string;
  fallback: boolean;
};

/**
 * 五套模板各自的内容规则。
 * 只约束 AI 填进 nodes 的「问题怎么组织」，不新增字段、不改 Graph 结构，
 * 因此 2D 大纲、答题解锁、5 个布局函数都无需适配。
 */
export const TEMPLATE_CONTENT_RULES: Record<TemplateId, string> = {
  orbit: `【星系同心轨道 · 分层递进】
- 输出 18~24 个节点；layer 3（基础知识）约占 40%、layer 2（机制与诊断）约 35%、layer 1（临床决策）约 25%。
- 节点严格按 layer 3 → 2 → 1 的顺序排列，同层内按学习先后排列，体现从基础到临床逐级推进。
- layer 2 与 layer 1 的节点，prerequisites 必须指向更靠前的基础层节点，形成逐级递进的依赖链。
- 五个 category 都要出现且数量大致均衡；question 用「是什么 / 为什么」的基础追问句式。`,

  radial: `【方案中心发散 · 中心辐射】
- 输出 20~26 个节点；physiology / pathology / diagnosis / treatment / pharm 五个 category 各 4~6 个，必须全部覆盖且数量接近。
- 按 category 分五组连续排列，每组内从基础到临床，并把该组最贴近决策的 layer 1 节点放在组末作为落点。
- 每个节点的 question 要显式指向「该知识点如何支撑或修正病例最终解决方案」，content 需点明与方案的关联。
- prerequisites 优先指向同组更靠前的节点，跨组依赖不超过 1 条，保持五个扇区各自成链。`,

  timeline: `【诊疗时间轴 · 流程推进】
- 输出 18~24 个节点，按临床路径分五段连续排列：① 基础背景与危险因素 ② 病理生理机制 ③ 检查与鉴别诊断 ④ 治疗处置决策 ⑤ 用药与随访。
- 用 layer 表达阶段：① 用 layer 3，②③ 用 layer 2，④⑤ 用 layer 1；category 按各段内容自然选择。
- 每个 title 以 ①②③④⑤ 之一开头标明阶段；question 用该阶段当时的决策口吻（如「此时应优先排除什么？」）。
- prerequisites 只能指向更早阶段的节点，不得跨阶段倒指，体现时间顺序。`,

  tree: `【分层推理树 · 演绎拆解】
- 输出 16~22 个节点，构成一棵可复盘的推理树：前 3~4 个为 layer 3 根问题，此后每个节点由 1~2 个更靠前的节点分叉而来。
- 除根节点外 prerequisites 不得为空，且每条依赖都要能从病例证据推导出来；layer 从 3 逐层降到 1，允许同层分叉。
- question 用「为什么 / 依据是什么 / 如何推出」的追问句式；content 必须点明所依据的上游节点结论。
- 避免并列罗列无关知识点，每个节点都应承接上一层推理。`,

  cluster: `【知识域聚类 · 横向盘点】
- 输出 20~26 个节点；五个 category 各成一簇，每簇 4~6 个，簇内节点连续排列且从基础到临床。
- 每簇内 layer 3、2、1 各至少 1 个；簇间 prerequisites 尽量少，簇内形成短依赖链。
- question 用该范畴的知识盘点句式（如「本病例涉及哪些…？」），便于横向比较与查漏补缺。
- content 需注明所属范畴，避免簇间内容混杂；同一知识点不要在两簇里重复出现。`,
};

/** 请求 A（轻量）：只让模型判断该用哪套思维模式，不给它生成整张图 */
export function buildTemplatePrompts(caseText: string, title: string, current: TemplateId): { system: string; user: string } {
  const system = [
    '你是医学案例教学图谱的模板选择器。根据病例特点，从下列 5 种思维模式中选出最合适的一种。',
    '只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块。格式：',
    '{"templateId":"orbit","reason":"一句话中文理由，不超过 40 字"}',
    'templateId 必须是下列 id 之一：',
    ...TEMPLATES.map(t => `- ${t.id}｜${t.name}（${t.mode}）：${t.description}`),
    '判断依据：病例呈明确时间进展或诊疗流程 → timeline；需围绕最终方案做多角度论证 → radial；强调逐级学习递进 → orbit；需复盘因果推理链 → tree；需横向盘点多个知识域 → cluster。',
    '难以判断时选 orbit。reason 必须具体提到病例里的线索，不要写空泛套话。',
  ].join('\n');
  const user = `病例标题：${title || '未命名病例'}\n\n病例文本（节选）：\n${caseText.slice(0, 3000)}\n\n当前界面选中的模板是 ${current}（${getTemplate(current).name}），但请独立判断，不要受它影响。`;
  return { system, user };
}

/** 容错解析：剥代码块、截取 JSON、非法 id 回退当前模板 */
export function parseTemplateChoice(raw: string, current: TemplateId): TemplateChoice {
  let s = String(raw ?? '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('模型输出中找不到 JSON 对象');
  let payload: any;
  try { payload = JSON.parse(s.slice(a, b + 1)); }
  catch { throw new Error('模板选择结果不是合法 JSON'); }
  const valid = TEMPLATES.some(t => t.id === payload?.templateId);
  if (!valid) throw new Error('模板 id 不在五套模板之内');
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim().slice(0, 80) : '';
  return {
    templateId: normalizeTemplateId(payload.templateId),
    reason: reason || `依据病例特点选用${getTemplate(payload.templateId).name}`,
    fallback: false,
  };
}

export type SuggestOptions = { text: string; title: string; current: TemplateId; signal?: AbortSignal };

/**
 * 请求 A 的唯一出口。
 * 模型返回内容异常 / 解析失败 → 回退当前模板（不中断生成流程）；
 * 连接、鉴权、限流、配置类错误 → 原样抛出，交给上层明确报错。
 */
export async function suggestTemplate(config: ByokConfig, opts: SuggestOptions): Promise<TemplateChoice> {
  const fallback = (reason: string): TemplateChoice => ({ templateId: normalizeTemplateId(opts.current), reason, fallback: true });
  let raw: string;
  try {
    const prompts = buildTemplatePrompts(opts.text, opts.title, opts.current);
    raw = await callLLM(config, { ...prompts, signal: opts.signal, maxTokens: 200 });
  } catch (e) {
    if (e instanceof LlmError && e.kind === 'response') return fallback('模型未给出可用的模板判断，已沿用当前模板');
    throw e;
  }
  try {
    return parseTemplateChoice(raw, opts.current);
  } catch {
    return fallback('模板选择结果无法解析，已沿用当前模板');
  }
}
