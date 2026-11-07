/* 模拟问诊：独立数据类型。不复用 Graph / GalaxyItem，也不需要任何新依赖。 */

export type ConsultRole = 'user' | 'patient' | 'system';
export type ConsultSource = 'upload' | 'paste' | 'current' | 'neuron';

export type ConsultMessage = {
  id: string;
  role: ConsultRole;
  text: string;
  at: number;
  stage?: number;          // 患者发言附带的阶段标记
};

/** 一次问诊会话。独立存 medmind-consult-v1，不写进 medmind-harness-v1、不占神经元名额 */
export type ConsultSession = {
  caseTitle: string;
  caseText: string;
  source: ConsultSource;
  startedAt: number;
  messages: ConsultMessage[];
  stage: number;            // 0 = 尚未开始，1..5 = 五个问诊阶段
  progress: number;        // 0..100
  helix3D: boolean;        // 右侧模型 3D / 2D
};

export type ConsultStage = { key: string; label: string; color: string };

/** 五个问诊阶段：与右侧双螺旋的五根碱基对横档一一对应 */
export const CONSULT_STAGES: ConsultStage[] = [
  { key: 'chief', label: '主诉与现病史', color: '#7C9A82' },
  { key: 'history', label: '既往史与危险因素', color: '#C4776B' },
  { key: 'exam', label: '查体与生命体征', color: '#C79A5B' },
  { key: 'lab', label: '辅助检查', color: '#7C93B8' },
  { key: 'plan', label: '诊断与处置', color: '#A98BB0' },
];

export const SOLUTION_LABEL = '病例最终解决方案';
export const SOLUTION_COLOR = '#C15F3C';

export function emptySession(): ConsultSession {
  return {
    caseTitle: '', caseText: '', source: 'upload', startedAt: Date.now(),
    messages: [], stage: 0, progress: 0, helix3D: true,
  };
}

export function uid(prefix = 'm'): string {
  try {
    const g = globalThis as any;
    if (g.crypto?.randomUUID) return `${prefix}_${g.crypto.randomUUID()}`;
  } catch { /* 非安全上下文退化 */ }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
