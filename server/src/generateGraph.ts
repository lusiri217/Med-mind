import type { Graph, GraphNode } from './types.ts';
const cats = [
  { id: 'physiology', name: '生理', color: '#7C9A82', shape: 'sphere' },
  { id: 'pathology', name: '病理', color: '#C4776B', shape: 'octahedron' },
  { id: 'diagnosis', name: '诊断', color: '#C79A5B', shape: 'box' },
  { id: 'treatment', name: '治疗', color: '#7C93B8', shape: 'tetrahedron' },
  { id: 'pharm', name: '药理', color: '#A98BB0', shape: 'dodecahedron' }
];
const bank = [
 ['疾病的基本概念是什么？','描述该疾病的基本定义及核心特征。','pathology'],['相关器官的正常结构有哪些？','概述与病例相关器官的主要解剖结构。','physiology'],['正常生理过程如何运行？','说明该系统正常情况下的生理调节过程。','physiology'],['关键指标的正常范围是什么？','列出病例涉及指标的常见参考范围，并说明适用条件。','physiology'],['主要病理变化是什么？','解释该病发生时的主要组织或功能改变。','pathology'],['危险因素有哪些？','归纳病例可能涉及的危险因素及证据。','pathology'],['该症状的可能机制是什么？','从生理和病理角度解释病例中的核心症状。','pathology'],['首选检查是什么？','结合病例信息，选择能验证关键假设的检查。','diagnosis'],['检查结果如何解读？','解释检查结果的意义、局限及可能干扰因素。','diagnosis'],['诊断标准有哪些？','列出诊断该疾病时需要综合判断的要点。','diagnosis'],['需要考虑哪些鉴别诊断？','提出主要鉴别诊断并说明区分线索。','diagnosis'],['最可能的诊断是什么？','整合症状、体征与检查，形成工作诊断。','diagnosis'],['病情严重度如何分层？','根据病例提供的信息，判断严重度与风险。','diagnosis'],['治疗目标是什么？','说明本病例近期和后续治疗目标。','treatment'],['首选治疗方案是什么？','根据病例背景提出治疗方案并说明依据。','treatment'],['药物作用机制是什么？','说明相关药物的作用靶点与预期效应。','pharm'],['常见不良反应有哪些？','识别治疗中需监测的不良反应和预警信号。','pharm'],['有哪些禁忌或慎用情形？','结合患者背景检查药物禁忌和相互作用。','pharm'],['疗效如何评估？','制定可观察、可复核的疗效评估指标。','treatment'],['如何安排随访？','提出随访节点、复查项目和调整条件。','treatment'],['出现恶化时如何处理？','识别紧急恶化信号并给出初步处置优先级。','treatment'],['如何进行患者教育？','用患者可理解的语言解释疾病管理与注意事项。','treatment'],['本病例最关键的证据是什么？','指出支持当前判断的关键病例线索。','diagnosis'],['哪些信息仍需补充？','列出尚缺少且可能改变诊疗决策的信息。','diagnosis'],['如何制定个体化方案？','结合合并症、偏好和风险优化诊疗安排。','treatment'],['多学科协作何时必要？','识别需要转诊或团队协作的情形。','treatment'],['预后受哪些因素影响？','归纳影响短期及长期预后的因素。','pathology'],['如何降低复发或并发症风险？','制定针对性预防和长期管理要点。','treatment'],['如何复盘临床推理？','回顾关键决策节点，并指出可改进之处。','diagnosis']
] as const;
export function generateMockGraph(text: string, title: string, caseId: string): Graph {
  const words = text.replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  const snippet = words.slice(0, 18).join(' ') || '病例文本尚未提供';
  const titleHint = (title || words.slice(0, 5).join(' ') || '临床示例案例').slice(0, 56);
  const nodes: GraphNode[] = bank.map(([q, content, category], i) => {
    const layer = i < 8 ? 3 : i < 18 ? 2 : 1;
    const prerequisites = i < 8 ? [] : layer === 2 ? [`node_${1 + ((i - 8) % 8)}`] : [`node_${9 + ((i - 18) % 10)}`, `node_${1 + ((i - 18) % 8)}`];
    return { id: `node_${i + 1}`, title: q.replace(/[？?]/g,''), question: q, category, layer, content: `${content}\n\n病例线索：${snippet}\n\n教学提示：此内容为 Mock 占位，须结合上传病例与指定教材核实。`, sourceRefs: ['待教师补充：请核对指定教材及病例原文'], prerequisites, assessment: { question: q, options: ['符合病例证据的判断','与病例无关的判断','忽略禁忌证的判断','缺少依据的判断'], answer: '符合病例证据的判断', passScore: 0.8 }, status: 'locked' };
  });
  const edges: Graph['edges'] = [];
  nodes.forEach(n => { edges.push({ source: 'node_0', target: n.id, type: 'radial' }); n.prerequisites.forEach(p => edges.push({ source: p, target: n.id, type: 'prerequisite' })); });
  return { caseId, caseTitle: titleHint, centerSolution: { id: 'node_0', title: '病例最终解决方案', content: `请综合病例信息形成可解释的临床决策：${snippet}\n\n此 Mock 结果不构成临床建议，需教师审核。`, sourceRefs: ['待教师补充：请核对指定教材及病例原文'] }, categories: cats, nodes, edges };
}
