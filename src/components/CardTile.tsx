import type { PointerEvent as ReactPointerEvent } from 'react';
import { Link2, Trash2, Unlink } from 'lucide-react';
import { CARD_COLORS, firstLine, type Card } from '../cards/types';

export type ConnectionLabel = { id: string; label: string };

type Props = {
  card: Card;
  index: number;
  selected: boolean;
  linkMode: boolean;
  linkFrom: boolean;
  compact: boolean;
  connectionCount: number;
  connections: ConnectionLabel[];
  linkOptions: ConnectionLabel[];
  onSelect: () => void;
  onHeaderPointerDown: (e: ReactPointerEvent) => void;
  onResizePointerDown: (e: ReactPointerEvent) => void;
  onStartLink: () => void;
  onLinkClick: () => void;
  onDelete: () => void;
  onText: (v: string) => void;
  onColor: (v: string) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onCompactLink: (targetId: string) => void;
  onRemoveConnection: (linkId: string) => void;
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export default function CardTile(p: Props) {
  const { card } = p;

  if (p.compact) return <div className={`mobile-card ${p.selected ? 'selected' : ''}`} style={{ borderLeftColor: card.color }} onClick={p.onSelect}>
    <div className="mobile-card-head"><span className="card-index">#{p.index + 1}</span><b>{firstLine(card.text)}</b>
      <button title="删除卡片" onClick={e => { stop(e); p.onDelete(); }}><Trash2 size={13} /></button></div>
    <textarea value={card.text} placeholder="写点什么… 第一行会作为卡片标题"
      onFocus={p.onEditStart} onBlur={p.onEditEnd} onChange={e => p.onText(e.target.value)} />
    <div className="mobile-card-tools">
      <div className="card-colors">{CARD_COLORS.map(c => <button key={c.id} title={c.name}
        className={card.color === c.value ? 'active' : ''} style={{ background: c.value }}
        onClick={e => { stop(e); p.onColor(c.value); }} />)}</div>
      <select value="" onChange={e => { if (e.target.value) p.onCompactLink(e.target.value); e.target.value = ''; }}>
        <option value="">＋ 连接到…</option>
        {p.linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
    {p.connections.length > 0 && <div className="mobile-links">{p.connections.map(c => <button key={c.id} title="点击移除这条连接"
      onClick={e => { stop(e); p.onRemoveConnection(c.id); }}><Unlink size={11} />{c.label}</button>)}</div>}
  </div>;

  return <div
    className={`card-tile ${p.selected ? 'selected' : ''} ${p.linkMode ? 'link-mode' : ''} ${p.linkFrom ? 'link-from' : ''}`}
    style={{ left: card.x, top: card.y, width: card.w, height: card.h, borderTopColor: card.color }}
    data-card-id={card.id}
    onPointerDown={e => { if (!p.linkMode) p.onSelect(); }}
    onClick={e => { if (p.linkMode) { stop(e); p.onLinkClick(); } }}
  >
    <div className="card-tile-head" onPointerDown={p.onHeaderPointerDown}>
      <span className="card-grip" aria-hidden>⠿</span>
      <span className="card-index">#{p.index + 1}</span>
      <span className="card-dot" style={{ background: card.color }} />
      <span className="card-conn">{p.connectionCount} 连接</span>
      <button title="从这张卡开始连线" onPointerDown={stop} onClick={e => { stop(e); p.onStartLink(); }}><Link2 size={12} /></button>
      <button title="删除卡片" onPointerDown={stop} onClick={e => { stop(e); p.onDelete(); }}><Trash2 size={12} /></button>
    </div>
    <textarea
      value={card.text}
      placeholder="写点什么… 第一行会作为卡片标题"
      onFocus={p.onEditStart} onBlur={p.onEditEnd}
      onChange={e => p.onText(e.target.value)}
      onPointerDown={e => { if (p.linkMode) { e.preventDefault(); stop(e); p.onLinkClick(); } }}
      spellCheck={false}
    />
    <div className="card-colors" onPointerDown={stop}>
      {CARD_COLORS.map(c => <button key={c.id} title={c.name}
        className={card.color === c.value ? 'active' : ''} style={{ background: c.value }}
        onClick={e => { stop(e); p.onColor(c.value); }} />)}
    </div>
    <div className="card-resize" title="拖动调整卡片大小" onPointerDown={p.onResizePointerDown} />
  </div>;
}
