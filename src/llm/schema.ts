import type { Category, Graph, GraphNode, TemplateId } from '../types';
import { getTemplate } from '../layouts';
import { TEMPLATE_CONTENT_RULES } from './templatePrompt';

/**
 * 结构化输出契约。
 * 模型只输出「知识节点内容」，色板 / 边 / 状态 / ID 一律由前端补全，
 * 这样输出量小、结构必定合法，也便于第 2 步接入 5 套模板时复用同一份数据。
 */
const CATS: Category[] = [
  { id: 'physiology', name: '生理', color: '#7C9A82', shape: 'sphere' },
  { id: 'pathology', name: '病理', color: '#C4776B', shape: 'octahedron' },
  { id: 'diagnosis', name: '诊断', color: '#C79A5B', shape: 'box' },
  { id: 'treatment', name: '治疗', color: '#7C93B8', shape: 'tetrahedron' },
  { id: 'pharm', name: '药理', color: '#A98BB0', shape: 'dodecahedron' },
];
const CAT_IDS = new Set(CATS.map(c => c.id));
const DEFAULT_OPTIONS = ['符合病例证据的判断', '与病例无关的判断', '忽略禁忌证的判断', '缺少依据的判断'];

const FORMAT = `只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块。格式：
{
  "caseTitle": "简短病例标题",
  "solution": "病例最终解决方案（2-4 句，教学用途）",
  "nodes": [
    {
      "title": "知识点短标题",
      "question": "用于主动回忆的提问（带问号）",
      "content": "该知识点的简明讲解，须结合病例线索",
      "category": "physiology | pathology | diagnosis | treatment | pharm 之一",
      "layer": 1,
      "prerequisites": [1, 2],
      "options": ["正确判断", "与病例相关的干扰项 1", "干扰项 2", "干扰项 3"],
      "answer": "正确判断"
    }
  ]
}
规则：
- nodes 输出 16 到 26 个（若本次模板规则给了更窄区间，以模板规则为准）。
- layer 只能是 1、2、3：3=基础知识，2=机制与诊断，1=临床决策。
- prerequisites 用数字表示「前面第几个节点」（1 表示第 1 个节点），只能引用更靠前的节点，每个最多 3 个；第一个节点用空数组 []。
- 每个节点必须给 options（恰好 4 个，其中只有一个正确）和 answer（必须是 options 中某一条的原样文本）。干扰项要与病例相关但明显不能成立，不要用「以上都对」这类无法判分的选项。
- 医学内容仅供教学辅助，不得编造教材页码或病例中不存在的检查数值；无依据处写「待教师补充」。
- 每个知识点须与所给病例相关，不要输出与病例无关的泛泛内容。`;

/** 请求 B：按选定模板注入内容组织规则；模板只影响内容，不改变输出结构 */
export function buildPrompts(
  systemPrompt: string,
  caseText: string,
  title: string,
  templateId: TemplateId = 'orbit',
): { system: string; user: string } {
  const meta = getTemplate(templateId);
  const system = [
    systemPrompt || '你是医学案例教学图谱生成器，依据上传病例生成逐级递进的问题链。',
    FORMAT,
    `【本次思维模板：${meta.name} · ${meta.mode}】\n${TEMPLATE_CONTENT_RULES[meta.id]}\n请在不违反上述通用规则的前提下，优先遵循本模板对节点数量、分层、范畴配额、排列顺序与依赖形态的要求。`,
  ].join('\n\n');
  const user = `病例标题：${title || '未命名病例'}\n\n病例文本（节选）：\n${caseText.slice(0, 6000)}\n\n请按「${meta.name}」这一思维模式组织内容，并按上述 JSON 格式输出图谱。`;
  return { system, user };
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/** 把模型输出的松散 JSON 规范化为一定合法的 Graph，再交给 validateGraph 复核 */
export function parseGraphPayload(raw: string, fallback: { caseId: string; caseTitle: string }): Graph {
  let s = String(raw ?? '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('模型输出中找不到 JSON 对象');
  let payload: any;
  try { payload = JSON.parse(s.slice(a, b + 1)); }
  catch { throw new Error('模型输出的 JSON 无法解析'); }

  const drafts: any[] = Array.isArray(payload?.nodes) ? payload.nodes : [];
  if (drafts.length < 6) throw new Error(`模型只输出了 ${drafts.length} 个节点，少于最低要求 6 个`);
  const list = drafts.slice(0, 30);

  const nodes: GraphNode[] = list.map((d, i) => {
    const title = asString(d?.title, `知识点 ${i + 1}`).slice(0, 60) || `知识点 ${i + 1}`;
    const question = asString(d?.question, `${title}？`).slice(0, 200) || `${title}？`;
    const content = asString(d?.content, '（模型未提供说明，待教师补充）').slice(0, 900) || '（模型未提供说明，待教师补充）';
    const category = CAT_IDS.has(d?.category) ? d.category : 'diagnosis';
    const rawLayer = Number(d?.layer);
    const layer = [1, 2, 3].includes(rawLayer) ? rawLayer : (i < list.length / 3 ? 3 : i < list.length * 2 / 3 ? 2 : 1);

    let options = Array.isArray(d?.options) ? d.options.map((x: unknown) => asString(x)).filter(Boolean).slice(0, 4) : [];
    if (options.length < 2) options = [...DEFAULT_OPTIONS];
    const wanted = asString(d?.answer);
    const answer = options.includes(wanted) ? wanted : options[0];

    // 依赖只允许指向更靠前的节点，天然无环；无效序号直接丢弃
    const deps: string[] = [];
    const rawDeps = Array.isArray(d?.prerequisites) ? d.prerequisites : [];
    for (const p of rawDeps) {
      const n = typeof p === 'number' ? p : (typeof p === 'string' ? Number(String(p).replace(/^node_/, '')) : NaN);
      if (Number.isInteger(n) && n >= 1 && n <= i && !deps.includes(`node_${n}`)) deps.push(`node_${n}`);
      if (deps.length >= 3) break;
    }
    if (!deps.length && i >= 6) deps.push(`node_${i - 2}`);

    return {
      id: `node_${i + 1}`, title, question, category, layer, content,
      sourceRefs: ['AI 生成 · 需教师审核并核对教材与病例原文'],
      prerequisites: deps,
      assessment: { question, options, answer, passScore: 0.8 },
      status: 'locked',
    };
  });

  // 模型偶尔会把所有节点标成同一层（或某一层缺失），这会让轨道 / 树 / 时间轴模板退化成一条直线。
  // 检测到分布失衡时按节点顺序重新均分 3→2→1，只纠正层级、不改动任何文字内容。
  const layerCount = new Map<number, number>();
  nodes.forEach(n => layerCount.set(n.layer, (layerCount.get(n.layer) || 0) + 1));
  if (layerCount.size < 3 || [...layerCount.values()].some(c => c < 2)) {
    nodes.forEach((n, i) => {
      n.layer = i < nodes.length / 3 ? 3 : i < nodes.length * 2 / 3 ? 2 : 1;
    });
  }

  const edges: Graph['edges'] = [];
  nodes.forEach(n => {
    edges.push({ source: 'node_0', target: n.id, type: 'radial' });
    n.prerequisites.forEach(p => edges.push({ source: p, target: n.id, type: 'prerequisite' }));
  });

  const solution = asString(payload?.solution, '请综合病例信息形成可解释的临床决策，并结合指定教材核实。');
  return {
    caseId: fallback.caseId,
    caseTitle: asString(payload?.caseTitle, fallback.caseTitle).slice(0, 56) || fallback.caseTitle,
    centerSolution: {
      id: 'node_0',
      title: '病例最终解决方案',
      content: solution.slice(0, 900) + '\n\n此内容由你配置的模型生成，仅供教学辅助，需教师审核。',
      sourceRefs: ['AI 生成 · 需教师审核并核对教材与病例原文'],
    },
    categories: CATS,
    nodes,
    edges,
  };
}
