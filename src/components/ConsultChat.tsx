import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, FileText, FolderOpen, LoaderCircle, Paperclip, Plus, Stethoscope, X,
} from 'lucide-react';
import { useLearningStore } from '../store/learningStore';
import { isByokComplete } from '../config/byok';
import { releaseAiRequest, trackAiRequest } from '../aiSwitch';
import { chatLLM, type ChatTurn } from '../consult/chat';
import { buildSystemPrompt, OPENING_INSTRUCTION, parsePatientReply } from '../consult/prompt';
import { loadCaseText } from '../consult/storage';
import { galaxyItemToCaseText, titleFromText } from '../consult/caseText';
import {
  CONSULT_STAGES, SOLUTION_LABEL, uid,
  type ConsultMessage, type ConsultSource,
} from '../consult/types';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const SOURCE_LABEL: Record<ConsultSource, string> = {
  upload: '上传文件', paste: '粘贴文本', current: '当前案例', neuron: '神经元案例',
};

/** 中间栏：微信式聊天。案例载入前只有引导；载入后右侧模型由 App 自动展开。 */
export default function ConsultChat() {
  const s = useLearningStore();
  const session = s.consult;
  const [draft, setDraft] = useState('');
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width:680px)').matches,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width:680px)');
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const byokReady = isByokComplete(s.byok);
  const hasCase = !!session?.caseText?.trim();
  const stage = session?.stage ?? 0;
  const progress = session?.progress ?? 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [session?.messages.length, busy, hasCase]);

  /** 把一轮对话发给模型，并把患者台词与阶段标记写回会话 */
  const sendTurns = async (userText: string, caseText: string, base: ConsultMessage[], opening = false) => {
    setBusy(true); setNotice('');
    const ctrl = trackAiRequest();
    try {
      const turns: ChatTurn[] = base
        .filter(m => m.role === 'user' || m.role === 'patient')
        .map(m => m.role === 'user'
          ? { role: 'user' as const, content: m.text }
          // 历史里的患者发言也保持 JSON 形态，模型更容易稳定遵守输出格式
          : { role: 'assistant' as const, content: JSON.stringify({ reply: m.text, stage: m.stage ?? 0 }) });
      turns.push({ role: 'user', content: opening ? OPENING_INSTRUCTION : userText });

      const raw = await chatLLM(s.byok, {
        system: buildSystemPrompt(s.consultPrompt, caseText),
        turns, signal: ctrl.signal,
      });
      const parsed = parsePatientReply(raw);
      const prev = useLearningStore.getState().consult;
      // 阶段 / 进度只能前进，解析失败时保持上一轮
      const nextStage = Math.max(prev?.stage ?? 0, parsed.stage ?? prev?.stage ?? 0);
      const nextProgress = Math.max(prev?.progress ?? 0, parsed.progress ?? prev?.progress ?? 0);
      const reply: ConsultMessage = {
        id: uid('pt'), role: 'patient', text: parsed.reply || '……（患者沉默了一会儿）',
        at: Date.now(), stage: nextStage,
      };
      useLearningStore.getState().setConsult(p => p
        ? { ...p, messages: [...p.messages, reply], stage: nextStage, progress: nextProgress }
        : p);
    } catch (e: any) {
      const text = e?.name === 'AbortError'
        ? '问诊请求已被紧急停止中止'
        : (e.message || '问诊请求失败，请检查「设置 → 模型调试」里的 API 配置');
      useLearningStore.getState().setConsult(p => p
        ? { ...p, messages: [...p.messages, { id: uid('sys'), role: 'system', text, at: Date.now() }] }
        : p);
    } finally {
      releaseAiRequest(ctrl); setBusy(false);
    }
  };

  /** 载入案例 → 写入独立会话 → 有 Key 时自动以患者身份开场 */
  const startCase = async (text: string, title: string, source: ConsultSource) => {
    const clean = text.trim().slice(0, 24000);
    if (!clean) { setNotice('案例内容为空，请换一个文件或粘贴病例文本'); return; }
    const tip = s.aiLocked
      ? 'AI 功能已紧急停止，请先在「设置 → 模型调试」中恢复。'
      : byokReady ? '正在以患者身份开始问诊…' : '请先在「设置 → 模型调试」填写 API Base URL / 模型名称 / API Key 后发送消息。';
    const opening: ConsultMessage[] = [
      { id: uid('sys'), role: 'system', text: `已载入案例「${title}」（${SOURCE_LABEL[source]}）。${tip}`, at: Date.now() },
    ];
    useLearningStore.getState().setConsult(() => ({
      caseTitle: title, caseText: clean, source, startedAt: Date.now(),
      messages: opening, stage: 0, progress: 0,
      helix3D: useLearningStore.getState().consult?.helix3D ?? true,
    }));
    setDraft(''); setPaste(''); setNotice(''); setShowSources(false);
    if (!byokReady || s.aiLocked) return;
    await sendTurns(OPENING_INSTRUCTION, clean, opening, true);
  };

  const send = async () => {
    const q = draft.trim();
    if (!q || busy) return;
    if (!hasCase) { setNotice('请先载入一个临床案例，再开始提问'); return; }
    if (s.aiLocked) { setNotice('AI 功能已紧急停止：请在「设置 → 模型调试」中恢复'); return; }
    if (!byokReady) { setNotice('尚未配置 API：请到「设置 → 模型调试」填写 API Base URL / 模型名称 / API Key'); return; }
    const cur = useLearningStore.getState().consult;
    if (!cur) return;
    const messages: ConsultMessage[] = [...cur.messages, { id: uid('u'), role: 'user', text: q, at: Date.now() }];
    useLearningStore.getState().setConsult(p => p ? { ...p, messages } : p);
    setDraft('');
    await sendTurns(q, cur.caseText, messages);
  };

  const parseFile = async (file: File) => {
    setNotice('');
    try {
      let out = '';
      if (/\.txt$/i.test(file.name)) out = await file.text();
      else if (/\.pdf$/i.test(file.name)) {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          out += (await page.getTextContent()).items.map((i: any) => i.str).join(' ') + '\n';
        }
      } else throw new Error('仅支持 PDF 和 TXT 文件');
      if (!out.trim()) throw new Error('没有从文件里解析到文本');
      await startCase(out, file.name.replace(/\.[^.]+$/, '') || '临床案例', 'upload');
    } catch (e: any) { setNotice(e.message || '文件解析失败'); }
  };

  const useCurrent = () => {
    const snap = loadCaseText();
    if (!snap.text.trim()) { setNotice('「案例上传与生成」里还没有案例文本，请先上传或粘贴'); return; }
    void startCase(snap.text, snap.fileName.replace(/\.[^.]+$/, '') || titleFromText(snap.text), 'current');
  };

  const useNeuron = () => {
    const item = s.galaxy.find(x => x.id === picked) || s.galaxy[0];
    if (!item) { setNotice('神经元里还没有案例，先去「案例上传与生成」生成一个'); return; }
    // 预置/已存图谱没有病例全文：用标题 + 中心方案 + 节点要点拼结构化摘要
    void startCase(galaxyItemToCaseText(item), item.title, 'neuron');
  };

  const usePaste = () => {
    if (!paste.trim()) { setNotice('请先粘贴病例文本'); return; }
    void startCase(paste, titleFromText(paste), 'paste');
  };

  const newSession = () => {
    useLearningStore.getState().clearConsult();
    setDraft(''); setPaste(''); setNotice(''); setShowSources(false);
  };

  const stateText = !hasCase ? '等待载入病例'
    : s.aiLocked ? 'AI 功能已停止'
    : busy ? '患者正在回应…'
    : !byokReady ? '未配置 API · 无法发送'
    : stage === 0 ? '问诊进行中'
    : `第 ${stage} / ${CONSULT_STAGES.length} 阶段 · ${progress}%`;

  // 手机端把「状态 / 阶段 / 进度」合并成一行短标签，避免顶部再叠一层状态行
  const mobileProgressLabel = s.aiLocked ? 'AI 功能已停止'
    : !byokReady ? '未配置 API'
    : busy ? '患者正在回应…'
    : stage ? CONSULT_STAGES[Math.min(stage - 1, 4)].label
    : '尚未开始';

  return <section className="consult-chat">
    <input ref={fileInput} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden
      onChange={e => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.target.value = ''; }} />

    <header className="consult-head">
      <div className="consult-head-copy">
        <small>SIMULATED CONSULTATION</small>
        <b>模拟问诊</b>
        <span className={`consult-state ${s.aiLocked ? 'off' : ''}`}><i />{stateText}</span>
      </div>
      <div className="consult-head-actions">
        <button className="consult-tool" onClick={() => setShowSources(v => !v)} title="载入 / 更换案例"><FolderOpen size={14} /><span>案例</span></button>
        <button className="consult-tool" onClick={newSession} title="新建问诊（清空当前对话）"><Plus size={14} /><span>新建</span></button>
      </div>
    </header>

    {/* 手机端不显示右侧模型，进度降级成顶部一条细进度条；文字与轨道同一行 */}
    <div className="consult-progress-mobile">
      <span>{compact
        ? `${mobileProgressLabel} · ${progress}%`
        : `问诊进度 · ${stage ? CONSULT_STAGES[Math.min(stage - 1, 4)].label : '尚未开始'} · ${progress}%`}</span>
      <div className="consult-progress-track"><i style={{ width: `${progress}%` }} /></div>
    </div>

    {showSources && <div className="consult-sources">
      <div className="consult-sources-head"><b>载入临床案例</b><button onClick={() => setShowSources(false)} title="收起"><X size={15} /></button></div>
      <p className="hint">请先对病例脱敏，不要包含姓名、证件号、联系方式等可识别信息。</p>
      <div className="consult-source-row">
        <button className="subtle-btn" onClick={() => fileInput.current?.click()}><Paperclip size={12} />上传 PDF / TXT</button>
        <button className="subtle-btn" onClick={useCurrent}><FileText size={12} />使用当前案例</button>
      </div>
      <label className="field-label">从神经元 · 案例图谱挑选</label>
      <select value={picked} onChange={e => setPicked(e.target.value)}>
        {s.galaxy.length === 0 && <option value="">（暂无已存案例）</option>}
        {s.galaxy.map(x => <option key={x.id} value={x.id}>{x.title}{x.preset ? ' · 示例' : ''}</option>)}
      </select>
      <button className="subtle-btn wide" onClick={useNeuron}>以此案例开始问诊</button>
      <label className="field-label">或直接粘贴病例文本</label>
      <textarea className="consult-paste" placeholder="把脱敏后的病例原文粘贴在这里…" value={paste} onChange={e => setPaste(e.target.value)} />
      <button className="generate-btn compact" onClick={usePaste}>载入并开始问诊</button>
      <p className="hint">选神经元里的示例时，会用图谱的标题、中心方案与节点要点拼一份结构化病例摘要；上传原文时一律优先用原文。</p>
      {notice && <div className="error-line">{notice}</div>}
    </div>}

    <div className="consult-messages" ref={scrollRef}>
      {!hasCase && <div className="consult-welcome">
        <div className="consult-welcome-icon"><Stethoscope size={26} /></div>
        <p className="eyebrow">PATIENT SIMULATION</p>
        <h2>从一个病例，开始一场问诊</h2>
        <p>上传或粘贴脱敏病例，也可以从「神经元 · 案例图谱」挑一个示例。<br />AI 会扮演患者与你对话，右侧双螺旋随问诊推进。</p>
        <div className="consult-welcome-actions">
          <button className="consult-primary" onClick={() => fileInput.current?.click()}><Paperclip size={14} />上传病例</button>
          <button className="consult-ghost" onClick={() => setShowSources(true)}><FolderOpen size={14} />选择案例来源</button>
        </div>
        <div className="consult-welcome-note">{byokReady ? '已配置 API · 载入案例后自动开场' : '未配置 API · 请到「设置 → 模型调试」填写自己的 API Key'}</div>
      </div>}

      {hasCase && <div className="consult-case-chip"><span className="live-dot" /><b>{session!.caseTitle}</b><em>{SOURCE_LABEL[session!.source]}</em><small>{session!.caseText.length.toLocaleString()} 字</small></div>}

      {session?.messages.map(m => m.role === 'system'
        ? <div className="consult-sys" key={m.id}>{m.text}</div>
        : <div className={`consult-row ${m.role === 'user' ? 'me' : ''}`} key={m.id}>
            {m.role === 'patient' && <div className="consult-avatar"><Stethoscope size={14} /></div>}
            <div className="consult-bubble">{m.text}{m.role === 'patient' && m.stage ? <small>{CONSULT_STAGES[Math.min(m.stage - 1, 4)].label}</small> : null}</div>
          </div>)}
      {busy && <div className="consult-row"><div className="consult-avatar"><Stethoscope size={14} /></div><div className="consult-bubble typing"><i /><i /><i /></div></div>}
    </div>

    <footer className="consult-compose">
      {notice && !showSources && <div className="error-line">{notice}</div>}
      <div className="consult-compose-row">
        <button className="consult-attach" onClick={() => fileInput.current?.click()} title="上传病例 PDF / TXT"><Paperclip size={15} /></button>
        <textarea value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          title="Enter 发送，Shift+Enter 换行"
          placeholder={!hasCase ? '请先载入一个临床案例…'
            : compact ? '向患者提问…' : '向患者提问…（Enter 发送，Shift+Enter 换行）'} rows={1} />
        <button className="consult-send" onClick={() => void send()} disabled={busy || !draft.trim()} title="发送">
          {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={16} />}
        </button>
      </div>
      <div className="consult-foot">
        <span>仅供教学辅助，不替代临床决策</span>
        <span className="consult-foot-end">终点 · {SOLUTION_LABEL}</span>
        {!byokReady && !s.aiLocked && <button onClick={() => s.setPanel('model')}>
          {compact ? '去配置 API →' : '去「设置 → 模型调试」配置 API →'}
        </button>}
      </div>
    </footer>
  </section>;
}
