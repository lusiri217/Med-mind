import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, FileJson2, FlaskConical, FolderOpen, KeyRound, LayoutGrid, LoaderCircle,
  Network, Pause, Play, Plus, RotateCcw, ScrollText, Search, Settings2, ShieldAlert,
  Sparkles, Upload, Wifi, X,
} from 'lucide-react';
import { useLearningStore, type PanelId } from '../store/learningStore';
import { generateGraph } from '../graph/createGraph';
import { testConnection } from '../llm/client';
import { isByokComplete } from '../config/byok';
import { releaseAiRequest, trackAiRequest } from '../aiSwitch';
import EmergencyStop from './EmergencyStop';
import { TEMPLATES, getTemplate } from '../layouts';
import type { TemplateId } from '../types';
import { suggestTemplate, type TemplateChoice } from '../llm/templatePrompt';
import { DEFAULT_PATIENT_PROMPT } from '../consult/prompt';
import { loadCaseText, saveCaseText } from '../consult/storage';
// Vite 会把 pdf.js 的 module worker 原样打包进 dist/assets，
// 不再从 cdnjs 动态拉取 —— 离线 / 内网 / 无外网环境也能解析 PDF。
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const presets: Record<string, string> = {
  '严格教材模式': '只依据上传案例与用户提供教材信息提问。不得补造教材原文、页码或病例事实；无可靠来源写“待教师补充”。问题逐层递进，先基础再临床。',
  '苏格拉底提问模式': '以循序追问引导学习者解释证据与因果。知识只来自上传案例或明确教材引用；没有引用时标注待教师补充。',
  '临床推理模式': '围绕病例线索、假设、鉴别、检查与处置建立问题链。不得将生成内容当作真实临床建议；引用不充分需标注待教师补充。',
  '考试模式': '生成客观、可判分的问题并提供答案要点。不得编造教材页码；所有知识应可回溯到上传案例或指定教材，无依据时标记待教师补充。',
};

const META: Record<PanelId, { kicker: string; title: string }> = {
  upload: { kicker: 'CASE INPUT', title: '案例上传与生成' },
  neuron: { kicker: 'CASE LIBRARY', title: '神经元 · 案例图谱' },
  cards: { kicker: 'MY CANVAS', title: '我的卡片 · 2D 画布' },
  model: { kicker: 'SETTINGS / MODEL', title: '模型调试' },
  graph: { kicker: 'SETTINGS / GRAPH', title: '图谱设置' },
  consultPrompt: { kicker: 'SETTINGS / CONSULT', title: '问诊提示词' },
};

/**
 * 右侧抽屉：左侧栏只做导航，所有表单都在这里显示。
 * 本组件在 App 中常驻挂载（panel 为 null 时只返回 null、不卸载），
 * 因此切换面板或关闭再打开，已输入的案例文本 / 模板 JSON / 推荐结果都不会丢。
 */
export default function SidePanel() {
  const s = useLearningStore();
  const panel = s.panel;
  const input = useRef<HTMLInputElement>(null);
  const bootCase = useRef(loadCaseText()).current;
  const [text, setText] = useState(bootCase.text);
  const [fileName, setFileName] = useState(bootCase.fileName);
  // 同步一份独立快照给模拟问诊的「使用当前案例」，不改上传表单本身的逻辑
  useEffect(() => { saveCaseText({ text, fileName }); }, [text, fileName]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [template, setTemplate] = useState('{\n  "caseTitle": "临床示例病例",\n  "layers": ["中心决策", "临床问题", "诊断与机制", "基础知识"]\n}');
  const [showKey, setShowKey] = useState(false);
  const [tplMode, setTplMode] = useState<'auto' | 'manual'>('auto');
  const [manualTpl, setManualTpl] = useState<TemplateId>(s.templateId);
  const [suggestion, setSuggestion] = useState<TemplateChoice | null>(null);
  const [chosenTpl, setChosenTpl] = useState<TemplateId>(s.templateId);

  const byokReady = isByokComplete(s.byok);
  const tpl = getTemplate(s.templateId);
  const close = () => s.setPanel(null);

  const parseFile = async (file: File) => {
    setError(''); setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith('.txt')) setText(await file.text());
      else if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        let out = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          out += (await page.getTextContent()).items.map((i: any) => i.str).join(' ') + '\n';
        }
        setText(out);
      } else throw new Error('仅支持 PDF 和 TXT 文件');
    } catch (e: any) { setError(e.message || '文件解析失败'); }
  };

  const caseTitle = () => fileName.replace(/\.[^.]+$/, '') || text.trim().slice(0, 20) || '临床案例';
  const checkInput = () => {
    try { JSON.parse(template); if (!text.trim()) throw new Error('请先上传或输入案例文本'); return true; }
    catch (e: any) { setError(e.message || '模板 JSON 格式错误'); return false; }
  };
  const runGenerate = async (tplId: TemplateId) => {
    if (s.aiLocked) { setError('AI 功能已紧急停止：请先在「设置 → 模型调试」中恢复'); return; }
    setBusy(true); setSuggestion(null); setError('');
    try {
      const res = await generateGraph({ text, title: caseTitle(), byok: s.byok, systemPrompt: s.harness.systemPrompt, onProgress: setStatus, templateId: tplId });
      s.setGraph(res.graph, res.templateId);
      setStatus(res.source === 'ai' ? `AI 生成完成 · 已按「${getTemplate(res.templateId).name}」收进神经元` : (res.reason || '演示图谱已生成 · 已自动收进神经元'));
      if (res.reason && res.reason.includes('失败')) setError(res.reason);
      else { s.setPanel(null); s.setConsultMode(false); }   // 生成成功后回到 3D 视图，直接看到新图谱
    } catch (e: any) { setError(e?.name === 'AbortError' ? '生成请求已被紧急停止中止' : (e.message || '生成失败')); setStatus(''); }
    finally { setBusy(false); }
  };
  const startGenerate = async () => {
    if (s.aiLocked) { setError('AI 功能已紧急停止：请先在「设置 → 模型调试」中恢复'); return; }
    if (!checkInput()) return;
    setError(''); setStatus(''); setSuggestion(null);
    if (!byokReady || tplMode === 'manual') { await runGenerate(tplMode === 'manual' ? manualTpl : s.templateId); return; }
    setBusy(true);
    const ctrl = trackAiRequest();
    try {
      setStatus('正在让模型判断最适合的思维模板…');
      const choice = await suggestTemplate(s.byok, { text, title: caseTitle(), current: s.templateId, signal: ctrl.signal });
      setSuggestion(choice); setChosenTpl(choice.templateId);
      setStatus(choice.fallback ? `模板推荐未成功：${choice.reason}` : `AI 推荐：${getTemplate(choice.templateId).name} · ${choice.reason}`);
    } catch (e: any) {
      if (e?.name === 'AbortError') { setError('生成请求已被紧急停止中止'); setStatus(''); }
      else {
        setError(`模板推荐失败（${e.message || '模板推荐失败'}），可沿用当前模板继续生成`);
        setSuggestion({ templateId: s.templateId, reason: '推荐请求未成功，已沿用当前模板', fallback: true });
        setChosenTpl(s.templateId);
      }
    } finally { releaseAiRequest(ctrl); setBusy(false); }
  };

  const save = () => {
    if (s.aiLocked) { setError('AI 功能已停止，无法保存 API 配置'); return; }
    s.saveByokConfig(); setError('');
    setStatus(s.byok.remember ? '配置已保存在本机（含 API Key）' : '配置已保存在本机；API Key 仅保留到本次会话');
  };
  const clear = () => {
    if (s.aiLocked) { setError('AI 功能已停止，无法修改 API 配置'); return; }
    s.setByok({ baseUrl: '', apiKey: '', model: '', protocol: 'openai' });
    s.saveByokConfig(); setError(''); setStatus('已清除本机 API 配置');
  };
  const test = async () => {
    if (s.aiLocked) { setError('AI 功能已停止，无法进行连接测试'); return; }
    setError(''); setStatus('正在测试连接…');
    const ctrl = trackAiRequest();
    try { const r = await testConnection(s.byok, ctrl.signal); setStatus(`连接成功 · 模型回复：${r}`); }
    catch (e: any) { setStatus(''); setError(e?.name === 'AbortError' ? '测试请求已被紧急停止中止' : (e.message || '连接失败')); }
    finally { releaseAiRequest(ctrl); }
  };

  // 组件不卸载，只是不产生 DOM —— 上面所有本地 state 得以保留
  if (!panel) return null;

  const meta = META[panel];
  const isSettings = panel === 'model' || panel === 'graph' || panel === 'consultPrompt';

  const uploadBody = <>
    <div className="privacy-note"><span>●</span>请先对病例脱敏，不要上传姓名、证件号、联系方式等可识别信息。</div>
    <input ref={input} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} />
    <button className="dropzone" onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]); }}><Upload size={18} /><b>拖入文件，或点击上传</b><small>支持 PDF / TXT</small></button>
    {fileName && <div className="file-chip"><BookOpen size={13} /><span>{fileName} · {text.length.toLocaleString()} 字</span><button onClick={() => { setFileName(''); setText(''); }}><X size={13} /></button></div>}
    <label className="field-label">案例文本预览 / 编辑</label><textarea className="case-preview" placeholder="上传案例后显示解析文本，也可以直接粘贴案例…" value={text} onChange={e => setText(e.target.value)} />
    <label className="field-label">问题图谱模板 JSON</label><textarea className="template-input" value={template} onChange={e => setTemplate(e.target.value)} />
    <div className="template-strategy">
      <div className="strategy-head"><span>思维模板策略</span><small>共 {TEMPLATES.length} 种</small></div>
      <div className="strategy-tabs">
        <button className={`strategy-tab ${tplMode === 'auto' ? 'active' : ''}`} onClick={() => setTplMode('auto')}><Sparkles size={12} />AI 自动推荐</button>
        <button className={`strategy-tab ${tplMode === 'manual' ? 'active' : ''}`} onClick={() => setTplMode('manual')}><Network size={12} />手动指定</button>
      </div>
      {tplMode === 'manual' && <><label className="field-label">选择模板</label><select value={manualTpl} onChange={e => setManualTpl(e.target.value as TemplateId)}>{TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name} · {t.mode}</option>)}</select></>}
      <p className="strategy-hint">{byokReady ? 'AI 先判断病例适合哪种思维模式，你确认后再按该模板填入内容；五套只改变内容组织方式，图谱结构不变。' : '未配置 API：直接使用本地演示生成器，模板按当前视图偏好套用。'}</p>
    </div>
    <button className="generate-btn" disabled={busy || s.aiLocked} onClick={startGenerate}>{busy ? <LoaderCircle size={15} className="spin" /> : <Network size={15} />}{suggestion ? '重新推荐模板' : '生成 3D 问题图谱'}</button>
    {suggestion && <div className="template-suggest">
      <div className="suggest-head"><Sparkles size={12} />{suggestion.fallback ? '沿用当前模板' : 'AI 推荐模板'}<em>可改选</em></div>
      <div className="suggest-name">{getTemplate(chosenTpl).name}<small>{getTemplate(chosenTpl).mode}</small></div>
      <p className="suggest-reason">{suggestion.reason}</p>
      <label className="field-label">改选模板</label>
      <select value={chosenTpl} onChange={e => setChosenTpl(e.target.value as TemplateId)}>{TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name} · {t.mode}</option>)}</select>
      <div className="button-row"><button className="subtle-btn" onClick={() => { setSuggestion(null); setStatus(''); }}>取消</button><button className="generate-btn compact" disabled={busy || s.aiLocked} onClick={() => runGenerate(chosenTpl)}><Network size={13} />按此模板生成</button></div>
    </div>}
    {!byokReady && !s.aiLocked && <div className="mode-note">未配置 API · 将使用本地演示生成器</div>}
    {byokReady && !s.aiLocked && <div className="mode-note">已配置 · 将直连你填写的模型端点</div>}
    {s.aiLocked && <div className="error-line">AI 功能已停止，图谱生成不可用；请在「设置 → 模型调试」中恢复。</div>}
    {status && <div className="status-line">{status}</div>}{error && <div className="error-line">{error}</div>}
    <div className="mock-note"><FlaskConical size={13} />未配置 API 时使用本地演示生成器；配置后直连你自己的模型服务</div>
  </>;

  const neuronBody = s.galaxy.length === 0
    ? <p className="hint" style={{ marginTop: 10 }}>生成过的图谱会自动收纳在这里，最多保留 10 个，可随时回看。</p>
    : <>
      <div className="galaxy-list">{s.galaxy.map(item => <div className={`galaxy-item ${s.graph && s.graph.caseId === item.id ? 'active' : ''}`} key={item.id}>
        <button className="galaxy-open" onClick={() => { s.loadFromGalaxy(item.id); s.setConsultMode(false); close(); }}><span className="galaxy-dot" /><span className="galaxy-copy"><b><span className="galaxy-title">{item.title}</span>{item.preset && <em className="preset-tag">示例</em>}</b><small>{item.preset ? `示例 · ${item.nodeCount} 个知识点 · ${getTemplate(item.templateId).name}` : `${item.nodeCount} 个知识点 · ${new Date(item.savedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}</small></span></button>
        <button className="galaxy-remove" title="从神经元移除" onClick={() => s.removeFromGalaxy(item.id)}><X size={13} /></button>
      </div>)}</div>
      <p className="hint" style={{ marginTop: 8 }}>已收纳 {s.galaxy.length} / 10 · 其中 {s.galaxy.filter(x => x.preset).length} 个示例 · 超出后移除最早的一个</p>
    </>;

  const cardsBody = <>
    {s.cardDocs.length === 0
      ? <p className="hint" style={{ marginTop: 10 }}>还没有卡片作品，新建一个即可开始制作自己的 2D 思维导图。</p>
      : <div className="card-doc-list">{s.cardDocs.map(d => <div className={`card-doc-item ${s.activeCardDocId === d.id && s.cardsMode ? 'active' : ''}`} key={d.id}>
        <button className="card-doc-open" onClick={() => { s.openCardDoc(d.id); close(); }}><span className="card-doc-icon"><LayoutGrid size={12} /></span><span className="card-doc-copy"><b>{d.title}</b><small>{d.cards.length} 张卡片 · {d.links.length} 条连接</small></span></button>
        <button className="card-doc-remove" title="删除该作品" onClick={() => s.removeCardDoc(d.id)}><X size={12} /></button>
      </div>)}</div>}
    <div className="button-row"><button className="subtle-btn" onClick={() => { s.createCardDoc('未命名卡片画布'); close(); }}><Plus size={12} />新建卡片作品</button></div>
    <p className="hint">作品只保存在你的浏览器，与「神经元 · 案例图谱」分开存放、不占 10 个名额；画布顶部可导出 / 导入 JSON。</p>
  </>;

  const safetyBox = <div className={`safety-box ${s.aiLocked ? 'is-locked' : ''}`}>
    <div className="safety-section-title"><ShieldAlert size={13} />安全 · 紧急停止</div>
    <div className="safety-state"><span className="safety-dot" />{s.aiLocked ? 'AI 功能已停止' : 'AI 功能运行中'}</div>
    <p className="hint">一键抹除本机保存的 API Key 与连接信息，立即拦截一切 AI 请求并中止在途请求。停止状态会持久保存，刷新页面或换标签页依然有效。</p>
    <EmergencyStop />
    {s.aiLocked && s.aiStoppedAt && <p className="safety-time">停止于 {new Date(s.aiStoppedAt).toLocaleString('zh-CN')} · 恢复后需重新填写 API 连接信息</p>}
  </div>;

  const modelBody = <>
    <label className="field-label">生成模式</label>
    <select value={s.harness.preset} onChange={e => s.setHarness({ preset: e.target.value, systemPrompt: presets[e.target.value] || s.harness.systemPrompt })}>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}</select>
    <label className="field-label">模型</label><input value={s.harness.model} onChange={e => s.setHarness({ model: e.target.value })} />
    <div className="range-head"><label>Temperature</label><span>{s.harness.temperature.toFixed(2)}</span></div>
    <input className="range" type="range" min="0" max="1" step="0.05" value={s.harness.temperature} onChange={e => s.setHarness({ temperature: +e.target.value })} />
    <div className="two-fields"><div><label className="field-label">Top P</label><input type="number" min="0" max="1" step="0.05" value={s.harness.top_p} onChange={e => s.setHarness({ top_p: +e.target.value })} /></div><div><label className="field-label">Max tokens</label><input type="number" min="256" max="32000" step="256" value={s.harness.max_tokens} onChange={e => s.setHarness({ max_tokens: +e.target.value })} /></div></div>
    <label className="field-label">System Prompt</label><textarea className="prompt-input" value={s.harness.systemPrompt} onChange={e => s.setHarness({ systemPrompt: e.target.value })} />
    <div className="provider-title"><KeyRound size={13} /> 自定义模型 API（BYOK）</div>
    <label className="field-label">API Base URL</label>
    <input placeholder="https://your-endpoint/v1" value={s.byok.baseUrl} onChange={e => s.setByok({ baseUrl: e.target.value })} disabled={s.aiLocked} />
    <label className="field-label">模型名称</label>
    <input placeholder="你所用服务的模型 ID" value={s.byok.model} onChange={e => s.setByok({ model: e.target.value })} disabled={s.aiLocked} />
    <label className="field-label">接口协议</label>
    <select value={s.byok.protocol} onChange={e => s.setByok({ protocol: e.target.value as 'openai' | 'anthropic' })} disabled={s.aiLocked}>
      <option value="openai">OpenAI 兼容 · chat/completions</option><option value="anthropic">Anthropic · /v1/messages</option>
    </select>
    <label className="field-label">API Key <small>{s.byok.remember ? '保存在本机 localStorage' : '仅当前会话'}</small></label>
    <div className="secret-field"><input type={showKey ? 'text' : 'password'} placeholder="只保存在你的浏览器，不会上传" value={s.byok.apiKey} onChange={e => s.setByok({ apiKey: e.target.value })} disabled={s.aiLocked} /><button onClick={() => setShowKey(!showKey)} disabled={s.aiLocked}>{showKey ? '隐藏' : '显示'}</button></div>
    <label className="toggle-line byok-remember"><span>记住密钥（保存在本机）</span><input type="checkbox" checked={s.byok.remember} onChange={e => s.setByok({ remember: e.target.checked })} disabled={s.aiLocked} /></label>
    <p className="hint">不预置任何厂商地址，请填写你自己的服务。密钥只存于你的浏览器并直接用于请求该端点；若被浏览器跨域(CORS)拦截，连接测试会给出提示。触发紧急停止会立即抹除本机密钥并中止在途请求。</p>
    <div className="button-row"><button className="subtle-btn" onClick={test} disabled={s.aiLocked}><Wifi size={13} />连接测试</button><button className="subtle-btn" onClick={save} disabled={s.aiLocked}>保存配置</button><button className="subtle-btn" onClick={clear} disabled={s.aiLocked}>清除</button></div>
    {status && <div className="status-line">{status}</div>}{error && <div className="error-line">{error}</div>}
    {safetyBox}
  </>;

  const consultPromptBody = <>
    <div className="privacy-note"><span>●</span>这里只改「患者怎么说话」；阶段标记的输出格式由程序固定追加，改提示词不会破坏右侧模型进度。</div>
    <label className="field-label">患者角色与规则</label>
    <textarea className="prompt-input consult-prompt-input" value={s.consultPrompt} onChange={e => s.setConsultPrompt(e.target.value)} />
    <div className="button-row"><button className="subtle-btn" onClick={() => { s.resetConsultPrompt(); setStatus('已恢复默认患者提示词'); }}><RotateCcw size={12} />恢复默认</button></div>
    <div className="template-note"><b>默认四条铁律</b><span>① 只依据案例，不编造；② 与临床案例无关的话题不回答；③ 患者不该知道的一律说不知道；④ 不替医生下诊断结论、不发专业术语，全程第一人称口语。</span><small>修改后自动保存在本机，下一次发送消息即生效；清空文本框会回退到默认规则。</small></div>
    <p className="hint">问诊记录存于独立的 medmind-consult-v1，不写进神经元 · 案例图谱，也不占 10 个名额。</p>
    {status && <div className="status-line">{status}</div>}
  </>;

  const graphBody = <>
    <label className="toggle-line"><span>显示图例</span><input type="checkbox" defaultChecked /></label>
    <button className="subtle-btn wide" onClick={() => s.setOutline(!s.outline)}>{s.outline ? '切换到 3D 视图' : '切换到 2D 大纲'}</button>
    <button className="subtle-btn wide" onClick={() => { s.setCardsMode(true); close(); }}><LayoutGrid size={13} />打开 2D 卡片画布</button>
    <button className="subtle-btn wide" onClick={() => s.setOrbitPaused(!s.orbitPaused)}>{s.orbitPaused ? <Play size={13} /> : <Pause size={13} />}{s.orbitPaused ? '继续公转' : '暂停公转'}</button>
    <button className="subtle-btn wide" onClick={() => window.dispatchEvent(new Event('medmind-reset-view'))}><RotateCcw size={13} />重置视角</button>
    <label className="field-label">搜索节点</label><div className="searchbox"><Search size={14} /><input value={s.search} onChange={e => s.setSearch(e.target.value)} placeholder="输入关键词" /></div>
    <button className="subtle-btn wide" onClick={() => { if (s.graph) download(JSON.stringify(s.graph, null, 2), 'medmind-graph.json', 'application/json'); }}><FileJson2 size={14} />导出 JSON</button>
    <button className="subtle-btn wide disabled" title="预留导出接口">导出 SCORM（预留）</button>
    <button className="subtle-btn wide disabled" title="预留导出接口">iframe 嵌入链接（预留）</button>
    <button className="subtle-btn wide disabled" title="需获得平台授权后接入">学习通任务点（预留）</button>
    <p className="hint">节点状态由本机学习状态层管理，静态站不会向任何服务端同步进度。</p>
    <div className="template-note"><b>当前 3D 模板 · {tpl.name}</b><span>{tpl.mode}：{tpl.description}</span><small>共 {TEMPLATES.length} 种思维模式，可在 3D 视图顶部栏的下拉框中随时切换；切换只改变排布，同一份图谱数据不会改变。</small></div>
  </>;

  return <>
    <div className="detail-scrim side-scrim" onClick={close} />
    <aside className="detail-panel side-panel">
      <div className="side-head">
        <div className="side-head-copy"><small>{meta.kicker}</small><b>{meta.title}</b></div>
        <button className="icon-button" onClick={close} title="关闭面板"><X size={18} /></button>
      </div>
      {isSettings && <div className="side-tabs">
        <button className={panel === 'model' ? 'active' : ''} onClick={() => s.setPanel('model')}><Settings2 size={12} />模型调试</button>
        <button className={panel === 'graph' ? 'active' : ''} onClick={() => s.setPanel('graph')}><Network size={12} />图谱设置</button>
        <button className={panel === 'consultPrompt' ? 'active' : ''} onClick={() => s.setPanel('consultPrompt')}><ScrollText size={12} />问诊提示词</button>
      </div>}
      <div className="side-scroll"><div className="section-body side-body">
        {panel === 'upload' && uploadBody}
        {panel === 'neuron' && neuronBody}
        {panel === 'cards' && cardsBody}
        {panel === 'model' && modelBody}
        {panel === 'graph' && graphBody}
        {panel === 'consultPrompt' && consultPromptBody}
      </div></div>
      <div className="side-foot"><FolderOpen size={11} />左侧栏可随时切换其他项目</div>
    </aside>
  </>;
}

function download(data: string, name: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}
