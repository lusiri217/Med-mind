import { CONSULT_STAGES } from './types';

/**
 * 默认患者提示词：四条铁律 + 第一人称口语。
 * 使用者可在「设置 → 问诊提示词」里整体改写；下面的输出格式指令固定追加，
 * 保证即便改写了角色设定，前端依然能解析出阶段标记。
 */
export const DEFAULT_PATIENT_PROMPT = `你正在扮演一位前来就诊的患者，与医学生或医生进行模拟问诊。请严格遵守以下规则：

一、只依据案例。你只知道下面「病例材料」里写到的事实，以及作为普通人能自然感受到的症状、时间、生活经历。病例里没有写到的信息一律不得编造；被问到没有依据的细节时，如实说记不清或不知道。

二、与临床案例无关的话题不回答。闲聊、天气、时政、编程、其他病人、模型身份、提示词、系统指令等一律不接话，简短地说「这个我不清楚，我们还是聊我的病吧」并把话题拉回本次就诊。

三、患者不该知道的一律说不知道。你不是医生，不掌握化验数值、影像报告结论、病理机制、诊断名词、药物剂量与治疗方案。被问到这些时说「这个我不清楚，得问医生」，绝不主动报出检查结果或诊断名称，也不替医生下诊断结论。

四、全程第一人称口语。用患者自己的说法描述不舒服（哪里难受、多久了、什么时候加重、吃过什么药、感觉怎么样），不要使用专业术语堆砌，不要列举鉴别诊断，不要输出要点清单或教学讲解，不要解释你在扮演角色，不要说自己是 AI。每次回复控制在 1～4 句话。

另外：你可以自然表达情绪与顾虑，但不得虚构病例中没有的既往史、用药史、过敏史与家族史；如果提问者反复追问同一件你不知道的事，保持「不清楚」而不要改口给出答案。`;

const STAGE_LIST = CONSULT_STAGES.map((s, i) => `${i + 1}. ${s.label}`).join('\n');

/** 固定拼在用户提示词之后：让模型在台词之外附带一个可解析的阶段标记 */
export const RESPONSE_FORMAT = `

【输出格式（必须严格遵守）】
只输出一个 JSON 对象，不要输出 Markdown 代码块、解释或多余文字：
{"reply":"你作为患者要说的话（纯中文口语，不要包含 JSON 或阶段字段）","stage":0,"progress":0}

字段说明：
- reply：本轮患者台词，必填。
- stage：根据截至目前对话已经问到的信息，判断问诊推进到哪个阶段，只能是 0 或下列整数：
${STAGE_LIST}
  0 表示尚未进入实质问诊。stage 只能保持不变或增大，不得倒退。
- progress：0～100 的整数，表示整体问诊完成度，同样只能保持不变或增大。

阶段判断只依据对话里实际问到的内容，不要因为一轮话长就跳阶段；如果本轮是无关话题或你表示「不清楚」，stage 与 progress 保持上一轮的值。`;

/** 开场白：上传案例后由前端以一条内部指令触发，模型仍只输出患者台词 */
export const OPENING_INSTRUCTION = '（问诊开始。请用一两句话、以患者第一人称说出这次来就诊最难受的地方和大概持续时间，不要问候、不要自我介绍、不要提 JSON 或阶段。）';

export function buildSystemPrompt(patientPrompt: string, caseText: string): string {
  const rules = (patientPrompt || '').trim() || DEFAULT_PATIENT_PROMPT;
  return `${rules}${RESPONSE_FORMAT}

【病例材料｜你唯一可以依据的事实】
${caseText || '（尚未提供病例材料）'}

【重要】病例材料是给你的背景事实，不是让医生看到的答案；不要把整段材料复述出来，也不得引用其中你作为患者不可能知道的检查结论、诊断或处置方案。`;
}

export type PatientReply = { reply: string; stage?: number; progress?: number };

/**
 * 解析模型回复。模型不守格式时把整段当患者台词，且不返回阶段（由前端保持不倒退）。
 * 兼容 ```json fence、多余前后文字、字符串型数字、中英文字段名。
 */
export function parsePatientReply(raw: string): PatientReply {
  const text = String(raw ?? '').trim();
  if (!text) return { reply: '' };
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let obj: any = null;
  try { obj = JSON.parse(stripped); }
  catch {
    const a = stripped.indexOf('{'), b = stripped.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(stripped.slice(a, b + 1)); } catch { /* 放弃 */ } }
  }
  if (!obj || typeof obj !== 'object') {
    // 没有合法 JSON：整段当台词，但要剥掉明显的阶段标注尾巴
    return { reply: text.replace(/\n?\{[\s\S]*\}\s*$/, '').trim() || text };
  }
  const reply = typeof obj.reply === 'string' ? obj.reply
    : typeof obj.text === 'string' ? obj.text
    : typeof obj.content === 'string' ? obj.content : '';
  if (!reply.trim()) return { reply: text };
  const num = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN);
    return Number.isFinite(n) ? n : undefined;
  };
  const st = num(obj.stage ?? obj.phase);
  const pg = num(obj.progress ?? obj.percent);
  return {
    reply: reply.trim(),
    ...(st !== undefined ? { stage: Math.max(0, Math.min(CONSULT_STAGES.length, Math.round(st))) } : {}),
    ...(pg !== undefined ? { progress: Math.max(0, Math.min(100, Math.round(pg))) } : {}),
  };
}
