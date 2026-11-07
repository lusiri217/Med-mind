import type { ByokConfig, Graph, TemplateId } from '../types';
import { isByokComplete } from '../config/byok';
import { abortAllAi, isAiLocked, releaseAiRequest, trackAiRequest } from '../aiSwitch';
import { LlmError, callLLM } from '../llm/client';
import { buildPrompts, parseGraphPayload } from '../llm/schema';
import { suggestTemplate, type TemplateChoice } from '../llm/templatePrompt';
import { getTemplate, normalizeTemplateId } from '../layouts';
import { generateMockGraph, newCaseId } from './mockGraph';
import { validateGraph } from './validateGraph';

export type GenerateResult = {
  graph: Graph;
  source: 'ai' | 'mock';
  reason?: string;
  templateId: TemplateId;        // 本次生成所使用的模板（写入银河，回看时还原）
  templateReason?: string;       // AI 选模板给出的一句话理由
};

export type GenerateOptions = {
  text: string;
  title: string;
  byok: ByokConfig;
  systemPrompt?: string;
  onProgress?: (message: string) => void;
  /** 明确指定模板时，跳过内部自动选择（界面两段式交互走这条） */
  templateId?: TemplateId;
  /** 库能力：为 true 时内部先发请求 A 选模板、再发请求 B 填内容，两次共用一个 signal */
  autoTemplate?: boolean;
  onTemplateChoice?: (choice: TemplateChoice) => void;
};

/**
 * 静态站唯一的生成入口：
 *  - 未配置 / 未锁定 → 本地演示生成器，保证「打开链接即看」
 *  - 已配置 → 直连使用者填写的模型端点，解析 + 校验
 *  - autoTemplate → 请求 A（选模板）+ 请求 B（按模板填内容），两次请求都可被紧急停止中止
 *  - 连接/鉴权类错误 → 明确报错，不静默回退
 *  - 模型输出不合格 → 回退演示图谱并给出原因
 */
export async function generateGraph(opts: GenerateOptions): Promise<GenerateResult> {
  const { text, title, byok, systemPrompt, onProgress } = opts;
  if (isAiLocked()) {
    abortAllAi();
    throw new Error('AI 功能已紧急停止；请在「设置 → 模型调试」中恢复');
  }

  const caseId = newCaseId();
  let chosen: TemplateId = normalizeTemplateId(opts.templateId ?? 'orbit');
  let templateReason = '';
  const demo = (reason?: string, templateId: TemplateId = chosen): GenerateResult => ({
    graph: generateMockGraph(text, title, caseId), source: 'mock', reason, templateId,
  });

  if (!isByokComplete(byok)) return demo('未配置 API，已使用本地演示生成器');

  // 两次请求共用同一个 controller：紧急停止时一并 abort 在途请求
  const ctrl = trackAiRequest();
  try {
    if (opts.autoTemplate) {
      onProgress?.('正在让模型判断最适合的思维模板…');
      const choice = await suggestTemplate(byok, { text, title, current: chosen, signal: ctrl.signal });
      chosen = normalizeTemplateId(choice.templateId);
      templateReason = choice.reason;
      opts.onTemplateChoice?.(choice);
    }

    onProgress?.(`正在按「${getTemplate(chosen).name}」生成图谱内容…`);
    const prompts = buildPrompts(systemPrompt ?? '', text, title, chosen);
    const raw = await callLLM(byok, { ...prompts, signal: ctrl.signal, maxTokens: 8192 });
    onProgress?.('正在解析并校验图谱…');
    const graph = parseGraphPayload(raw, { caseId, caseTitle: title || '临床案例' });
    const check = validateGraph(graph);
    if (!check.valid) throw new Error(`模型输出未通过校验：${check.errors.slice(0, 3).join('；')}`);
    return { graph, source: 'ai', templateId: chosen, templateReason };
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('紧急停止'))) throw e;
    // 连接 / 鉴权 / 限流类错误必须让用户看见，不能伪装成生成成功
    if (e instanceof LlmError && ['config', 'cors', 'auth', 'model', 'rate'].includes(e.kind)) throw e;
    return demo(`AI 生成未成功，已回退演示图谱：${e instanceof Error ? e.message : '未知错误'}`, chosen);
  } finally {
    releaseAiRequest(ctrl);
  }
}
