import { Activity, ChevronDown, FolderOpen, LayoutGrid, Network, Orbit, PanelLeftClose, PanelLeftOpen, ScrollText, Settings2, SlidersHorizontal, Stethoscope, X } from 'lucide-react';
import { useLearningStore, type PanelId } from '../store/learningStore';
import { isByokComplete } from '../config/byok';

/**
 * 左侧栏现在只负责导航：点任意项目都在右侧抽屉中打开对应表单。
 * 「设置」是分组，下挂「模型调试」「图谱设置」两个子项目；
 * 紧急停止已并入「设置 → 模型调试」，这里不再有独立安全区。
 */
export default function HarnessPanel({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const s = useLearningStore();
  const byokReady = isByokComplete(s.byok);

  const open = (p: PanelId) => { s.setPanel(p); onClose(); };
  const item = (id: PanelId, label: string, Icon: any, sub = false) =>
    <button key={id} className={`nav-item ${sub ? 'sub' : ''} ${s.panel === id ? 'active' : ''}`} onClick={() => open(id)}>
      <Icon size={sub ? 13 : 15} /><span>{label}</span><ChevronDown size={12} className="nav-arrow" />
    </button>;

  return <>
    <div className={`mobile-scrim ${mobileOpen ? 'show' : ''}`} onClick={onClose} />
    <aside className={`harness ${s.collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Activity size={17} /></div>
        {!s.collapsed && <div className="brand-copy"><b>MEDMIND <span>LAB</span></b><small>临床推理学习工作台</small></div>}
        <button className="collapse-btn" onClick={() => s.setCollapsed(!s.collapsed)} title={s.collapsed ? '展开侧栏' : '折叠侧栏'}>{s.collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        <button className="mobile-close" onClick={onClose}><X size={17} /></button>
      </div>
      {!s.collapsed
        ? <>
          <div className="harness-scroll">
            <div className="nav-list">
              <button className={`nav-item consult-nav ${s.consultMode && !s.panel ? 'active' : ''}`} onClick={() => { s.setConsultMode(true); s.setPanel(null); onClose(); }}>
                <Stethoscope size={15} /><span>模拟问诊</span><ChevronDown size={12} className="nav-arrow" />
              </button>
              {item('upload', '案例上传与生成', FolderOpen)}
              {item('neuron', '神经元 · 案例图谱', Orbit)}
              {item('cards', '我的卡片 · 2D 画布', LayoutGrid)}
              <button className={`nav-group-label ${s.panel === 'model' || s.panel === 'graph' || s.panel === 'consultPrompt' ? 'active' : ''}`} onClick={() => open('model')} title="打开设置（默认模型调试）"><Settings2 size={13} />设置<span className="nav-group-line" /><ChevronDown size={12} className="nav-arrow" /></button>
              {item('model', '模型调试', SlidersHorizontal, true)}
              {item('graph', '图谱设置', Network, true)}
              {item('consultPrompt', '问诊提示词', ScrollText, true)}
            </div>
            <p className="nav-hint">点击任一项目，内容在右侧面板展开</p>
          </div>
          <div className="sidebar-bottom"><div className={`online-dot ${s.aiLocked ? 'off' : ''}`} /> {s.aiLocked ? 'AI 功能已停止' : (byokReady ? 'BYOK · 已配置' : '本地演示模式')} <span>v0.1</span></div>
        </>
        : <nav className="icon-rail">
          <button title="模拟问诊" onClick={() => { s.setConsultMode(true); s.setPanel(null); onClose(); }}><Stethoscope size={18} /></button>
          <button title="案例上传与生成" onClick={() => open('upload')}><FolderOpen size={18} /></button>
          <button title="神经元 · 案例图谱" onClick={() => open('neuron')}><Orbit size={18} /></button>
          <button title="我的卡片 · 2D 画布" onClick={() => open('cards')}><LayoutGrid size={18} /></button>
          <button title="设置 · 模型调试" onClick={() => open('model')}><Settings2 size={18} /></button>
          <button title="设置 · 图谱设置" onClick={() => open('graph')}><Network size={18} /></button>
          <div className="rail-bottom"><Activity size={17} /></div>
        </nav>}
    </aside>
  </>;
}
