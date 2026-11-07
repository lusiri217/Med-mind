import { useState } from 'react';
import { Menu, Network } from 'lucide-react';
import HarnessPanel from './components/HarnessPanel';
import SidePanel from './components/SidePanel';
import Graph3D from './components/Graph3D';
import GraphOutline from './components/GraphOutline';
import CardCanvas from './components/CardCanvas';
import NodeDetails from './components/NodeDetails';
import ConsultChat from './components/ConsultChat';
import ConsultHelix from './components/ConsultHelix';
import { useLearningStore } from './store/learningStore';

/**
 * 四态视图：模拟问诊（默认首屏）/ 3D 图谱 / 2D 大纲 / 2D 卡片画布。
 * 问诊态是真正的三栏分栏「左侧栏 + 中间聊天 + 右侧进度模型」；
 * 案例尚未载入时右栏不渲染，只有「左侧栏 + 聊天框」两部分。
 */
export default function App() {
  const s = useLearningStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sideOpen = !!s.panel || (!!s.selectedId && !s.cardsMode && !s.consultMode);
  const hasCase = !!s.consult?.caseText?.trim();

  return <main className={`app-shell${sideOpen ? ' with-detail' : ''}${s.consultMode ? ' consult-mode' : ''}`}>
    <HarnessPanel mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    <section className="workspace">
      <header className="mobile-topbar">
        <button onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
        <div><Network size={17} /> MEDMIND</div>
        <span>{s.consultMode ? '模拟问诊' : s.cardsMode ? '卡片画布' : '临床问题图谱'}</span>
      </header>
      <div className="main-stage">
        {s.consultMode
          ? <div className={`consult-workspace${hasCase ? ' with-helix' : ''}`}>
              <ConsultChat />
              {hasCase && <ConsultHelix />}
            </div>
          : (s.cardsMode
              ? <CardCanvas />
              : (s.graph && s.outline ? <GraphOutline /> : <Graph3D />))}
        {!s.consultMode && <div className={`medical-note${s.cardsMode ? ' on-cards' : ''}`}><span />仅供教学辅助，不替代临床决策</div>}
      </div>
      <SidePanel />
    </section>
    {!s.cardsMode && !s.consultMode && <NodeDetails />}
  </main>;
}
