import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { generateMockGraph } from './generateGraph.ts';
import { validateGraph } from './validateGraph.ts';
const app = express(); app.use(cors()); app.use(express.json({ limit: '8mb' }));
const progress = new Map<string, Set<string>>();

// AI 紧急停止：进程内熔断标记。浏览器端的总闸是持久化的，服务重启后浏览器会重新下发 off。
let aiDisabled = false;
app.post('/api/ai-lock', (req,res) => {
  const { action } = req.body ?? {};
  if (action === 'off') {
    aiDisabled = true;
    // 抹除本进程持有的模型凭据，避免任何后续逻辑再次读到
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.OPENAI_API_KEY;
  } else if (action === 'on') {
    aiDisabled = false;
  }
  res.json({ ok: true, aiDisabled, mode: aiDisabled ? 'stopped' : (process.env.LLM_API_KEY ? 'configured' : 'mock') });
});

app.get('/api/health', (_req,res) => res.json({ ok: true, aiDisabled, mode: aiDisabled ? 'stopped' : (process.env.LLM_API_KEY ? 'configured' : 'mock') }));
app.post('/api/generate-graph', (req,res) => {
  if (aiDisabled) return res.status(503).json({ error: 'AI 功能已紧急停止（API 已抹除）', code: 'AI_DISABLED' });
  const { text = '', title = '', harness = {} } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: '请提供案例文本' });
  const graph = generateMockGraph(text, title, randomUUID());
  const checked = validateGraph(graph);
  if (!checked.valid) return res.status(422).json({ error: '图谱校验失败', details: checked.errors });
  return res.json({ graph, validation: checked, mode: 'mock', message: '未配置服务端模型密钥，已使用 Mock 生成器。Harness 参数已接收。', receivedHarness: { model: harness.model, temperature: harness.temperature, top_p: harness.top_p, max_tokens: harness.max_tokens, systemPrompt: harness.systemPrompt, preset: harness.preset } });
});
app.post('/api/progress', (req,res) => {
  const { caseId, nodeId, action, prerequisites = [] } = req.body ?? {};
  if (!caseId || !nodeId) return res.status(400).json({ error: 'caseId 和 nodeId 必填' });
  const done = progress.get(caseId) ?? new Set<string>();
  if (action === 'complete' || action === 'teacher_unlock') {
    const unmet = prerequisites.filter((p: string) => !done.has(p));
    if (action === 'complete' && unmet.length) return res.status(409).json({ error: '前置节点尚未完成', unmet });
    done.add(nodeId); progress.set(caseId, done);
  }
  return res.json({ completed: [...done], available: prerequisites.every((p: string) => done.has(p)) });
});
app.listen(8787, () => console.log('MedMind API listening on http://localhost:8787'));
