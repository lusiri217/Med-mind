import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Box, Download, FilePlus2, Focus, Link2, Minus, Plus, Redo2,
  RotateCcw, Trash2, Undo2, Upload, X,
} from 'lucide-react';
import { useLearningStore } from '../store/learningStore';
import CardTile from './CardTile';
import {
  CARD_DEFAULT_H, CARD_DEFAULT_W, CARD_MAX_H, CARD_MAX_W, CARD_MIN_H, CARD_MIN_W,
  CARD_SOFT_LIMIT, firstLine, type Card, type CardDoc,
} from '../cards/types';
import { createCard, downloadDoc, readDocFile, uid } from '../cards/io';
import { canRedo, canUndo, commit, redo, undo, type HistoryMap } from '../cards/history';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SVG_SIZE = 12000;
const SVG_OFFSET = SVG_SIZE / 2;

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'move' | 'resize'; id: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; before: CardDoc };

export default function CardCanvas() {
  const s = useLearningStore();
  const doc = s.cardDocs.find(d => d.id === s.activeCardDocId) ?? s.cardDocs[0] ?? null;

  const [historyMap, setHistoryMap] = useState<HistoryMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches);
  const [toast, setToast] = useState('');
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const editBaseRef = useRef<CardDoc | null>(null);
  const viewRef = useRef({ pan, zoom });
  viewRef.current = { pan, zoom };

  const currentDoc = useCallback((): CardDoc | null => {
    const st = useLearningStore.getState();
    return st.cardDocs.find(d => d.id === st.activeCardDocId) ?? st.cardDocs[0] ?? null;
  }, []);

  /** 唯一的文档写入口：默认把修改前快照压入该作品的撤销栈 */
  const applyDoc = useCallback((next: CardDoc, record = true, before?: CardDoc) => {
    const prev = before ?? currentDoc();
    if (record && prev) setHistoryMap(h => commit(h, next.id, prev, next));
    useLearningStore.getState().updateCardDoc(next);
  }, [currentDoc]);

  const patchCard = useCallback((id: string, patch: Partial<Card>, record = true) => {
    const d = currentDoc(); if (!d) return;
    applyDoc({ ...d, cards: d.cards.map(c => c.id === id ? { ...c, ...patch } : c) }, record);
  }, [applyDoc, currentDoc]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(t => t === msg ? '' : t), 3200);
  }, []);

  // 响应式：小屏改用可编辑的纵向列表，不做拖拽/缩放
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)');
    const on = () => setCompact(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // 滚轮缩放（以指针为锚点），原生监听以便 preventDefault
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || compact) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const { pan: p, zoom: z } = viewRef.current;
      const nz = clamp(z * (e.deltaY > 0 ? 0.9 : 1.1), 0.35, 2.2);
      setPan({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) });
      setZoom(nz);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [compact, doc?.id]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = viewportRef.current?.getBoundingClientRect();
    const { pan: p, zoom: z } = viewRef.current;
    return { x: (clientX - (r?.left ?? 0) - p.x) / z, y: (clientY - (r?.top ?? 0) - p.y) / z };
  }, []);

  // 全局指针：移动/缩放卡片、平移画布、连线预览
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d?.kind === 'pan') { setPan({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }); return; }
      if (linkMode && linkFromId) setCursor(toWorld(e.clientX, e.clientY));
      if (!d) return;
      const cur = currentDoc(); if (!cur) return;
      const dx = (e.clientX - d.sx) / viewRef.current.zoom, dy = (e.clientY - d.sy) / viewRef.current.zoom;
      const cards = cur.cards.map(c => c.id !== d.id ? c : d.kind === 'move'
        ? { ...c, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) }
        : { ...c, w: clamp(Math.round(d.ow + dx), CARD_MIN_W, CARD_MAX_W), h: clamp(Math.round(d.oh + dy), CARD_MIN_H, CARD_MAX_H) });
      applyDoc({ ...cur, cards }, false);
    };
    const onUp = () => {
      const d = dragRef.current; if (!d) return;
      dragRef.current = null;
      if (d.kind === 'pan') return;
      const cur = currentDoc();
      if (cur && JSON.stringify(d.before.cards) !== JSON.stringify(cur.cards)) {
        setHistoryMap(h => commit(h, cur.id, d.before, cur));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [applyDoc, currentDoc, linkFromId, linkMode, toWorld]);

  const fitView = useCallback(() => {
    const el = viewportRef.current, d = currentDoc();
    if (!el || !d || !d.cards.length) { setPan({ x: 40, y: 40 }); setZoom(1); return; }
    const r = el.getBoundingClientRect();
    const minX = Math.min(...d.cards.map(c => c.x)), minY = Math.min(...d.cards.map(c => c.y));
    const maxX = Math.max(...d.cards.map(c => c.x + c.w)), maxY = Math.max(...d.cards.map(c => c.y + c.h));
    const pad = 70;
    const z = clamp(Math.min((r.width - pad * 2) / Math.max(maxX - minX, 1), (r.height - pad * 2) / Math.max(maxY - minY, 1)), 0.35, 1.35);
    setZoom(z);
    setPan({ x: r.width / 2 - (minX + maxX) / 2 * z, y: r.height / 2 - (minY + maxY) / 2 * z });
  }, [currentDoc]);

  // 打开/切换作品时自动适配视野；同一作品内的平移缩放不会被重置
  useEffect(() => {
    if (compact || !doc?.id) return;
    const t = window.setTimeout(fitView, 60);
    return () => clearTimeout(t);
  }, [doc?.id, compact, fitView]);

  const addCard = useCallback(() => {
    const d = currentDoc(); if (!d) return;
    const r = viewportRef.current?.getBoundingClientRect();
    const { pan: p, zoom: z } = viewRef.current;
    const cx = (r ? r.width / 2 : 400), cy = (r ? r.height / 2 : 280);
    const bx = (cx - p.x) / z - CARD_DEFAULT_W / 2;
    const by = (cy - p.y) / z - CARD_DEFAULT_H / 2;
    // 从视野中心向外找第一个不与任何已有卡片重叠的空位，避免新卡盖住旧卡
    const overlaps = (x: number, y: number) => d.cards.some(c =>
      Math.abs((x + CARD_DEFAULT_W / 2) - (c.x + c.w / 2)) < (CARD_DEFAULT_W + c.w) / 2 + 18 &&
      Math.abs((y + CARD_DEFAULT_H / 2) - (c.y + c.h / 2)) < (CARD_DEFAULT_H + c.h) / 2 + 18);
    let spot = { x: Math.round(bx), y: Math.round(by) };
    for (let ring = 0; ring < 14 && overlaps(spot.x, spot.y); ring++) {
      let found = false;
      for (let a = 0; a < 12 && !found; a++) {
        const angle = a * Math.PI / 6;
        const cand = { x: Math.round(bx + Math.cos(angle) * (ring + 1) * 72), y: Math.round(by + Math.sin(angle) * (ring + 1) * 62) };
        if (!overlaps(cand.x, cand.y)) { spot = cand; found = true; }
      }
      if (!found) spot = { x: Math.round(bx + (ring + 1) * 72), y: Math.round(by) };
    }
    const card = createCard({
      x: spot.x, y: spot.y,
      text: '', color: ['#C15F3C', '#6E8B62', '#A97E3E', '#9A86A8', '#7C93A6'][d.cards.length % 5],
    });
    applyDoc({ ...d, cards: [...d.cards, card] });
    setSelectedId(card.id);
    if (d.cards.length + 1 > CARD_SOFT_LIMIT) flash('已超过建议的 30 张卡片，仍可继续添加，但复杂画布可能变慢');
  }, [applyDoc, currentDoc, flash]);

  const deleteCard = useCallback((id: string) => {
    const d = currentDoc(); if (!d) return;
    applyDoc({ ...d, cards: d.cards.filter(c => c.id !== id), links: d.links.filter(l => l.source !== id && l.target !== id) });
    if (selectedId === id) setSelectedId(null);
    if (linkFromId === id) setLinkFromId(null);
  }, [applyDoc, currentDoc, linkFromId, selectedId]);

  const removeLink = useCallback((id: string) => {
    const d = currentDoc(); if (!d) return;
    applyDoc({ ...d, links: d.links.filter(l => l.id !== id) });
  }, [applyDoc, currentDoc]);

  const connect = useCallback((source: string, target: string) => {
    const d = currentDoc(); if (!d || source === target) return;
    if (d.links.some(l => (l.source === source && l.target === target) || (l.source === target && l.target === source))) {
      flash('这两张卡片已经连接过了'); return;
    }
    applyDoc({ ...d, links: [...d.links, { id: uid('link'), source, target }] });
    flash('已连接 · 点击连线中点可删除');
  }, [applyDoc, currentDoc, flash]);

  const onCardLinkClick = useCallback((id: string) => {
    if (!linkMode) return;
    if (!linkFromId) { setLinkFromId(id); flash('再点一张卡片，完成连接'); return; }
    if (linkFromId === id) { setLinkFromId(null); return; }
    connect(linkFromId, id);
    setLinkFromId(null);
  }, [connect, flash, linkFromId, linkMode]);

  const doUndo = useCallback(() => {
    const d = currentDoc(); if (!d) return;
    const r = undo(historyMap, d.id, d);
    if (!r) { flash('没有可撤销的操作'); return; }
    setHistoryMap(r.map); applyDoc(r.doc, false);
  }, [applyDoc, currentDoc, flash, historyMap]);

  const doRedo = useCallback(() => {
    const d = currentDoc(); if (!d) return;
    const r = redo(historyMap, d.id, d);
    if (!r) { flash('没有可重做的操作'); return; }
    setHistoryMap(r.map); applyDoc(r.doc, false);
  }, [applyDoc, currentDoc, flash, historyMap]);

  // 快捷键：Ctrl/Cmd+Z 撤销、Shift+Z / Y 重做、Delete 删除选中卡、Esc 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') { setLinkMode(false); setLinkFromId(null); setSelectedId(null); return; }
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteCard(selectedId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteCard, doRedo, doUndo, selectedId]);

  const onHeaderPointerDown = (e: ReactPointerEvent, card: Card) => {
    if (linkMode || compact) return;
    e.preventDefault();
    const d = currentDoc(); if (!d) return;
    dragRef.current = { kind: 'move', id: card.id, sx: e.clientX, sy: e.clientY, ox: card.x, oy: card.y, ow: card.w, oh: card.h, before: d };
    setSelectedId(card.id);
  };

  const onResizePointerDown = (e: ReactPointerEvent, card: Card) => {
    e.preventDefault(); e.stopPropagation();
    const d = currentDoc(); if (!d) return;
    dragRef.current = { kind: 'resize', id: card.id, sx: e.clientX, sy: e.clientY, ox: card.x, oy: card.y, ow: card.w, oh: card.h, before: d };
  };

  const onViewportPointerDown = (e: ReactPointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.card-tile') || t.closest('.card-link-hit') || t.closest('.card-canvas-hint')) return;
    setSelectedId(null);
    if (linkMode) { setLinkFromId(null); return; }
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
  };

  const importFile = async (file: File) => {
    try {
      const parsed = await readDocFile(file);
      const id = useLearningStore.getState().importCardDoc(parsed);
      setSelectedId(null); setLinkMode(false); setLinkFromId(null);
      flash(`已导入「${parsed.title}」· ${parsed.cards.length} 张卡片`);
      window.setTimeout(fitView, 80);
      return id;
    } catch (err: any) { flash(err?.message || '导入失败'); }
  };

  const linkPaths = useMemo(() => {
    if (!doc) return [];
    return doc.links.map(l => {
      const a = doc.cards.find(c => c.id === l.source), b = doc.cards.find(c => c.id === l.target);
      if (!a || !b) return null;
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const mx = (ax + bx) / 2;
      return { id: l.id, d: `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`, cx: mx, cy: (ay + by) / 2 };
    }).filter(Boolean) as { id: string; d: string; cx: number; cy: number }[];
  }, [doc]);

  const byId = useMemo(() => new Map((doc?.cards ?? []).map(c => [c.id, c])), [doc]);
  const labelOf = (c: Card | undefined) => c ? firstLine(c.text) : '已删除卡片';
  const connectionLabels = (cardId: string) => (doc?.links ?? [])
    .filter(l => l.source === cardId || l.target === cardId)
    .map(l => ({ id: l.id, label: (l.source === cardId ? '→ ' : '← ') + labelOf(byId.get(l.source === cardId ? l.target : l.source)) }));

  const preview = linkMode && linkFromId && byId.get(linkFromId)
    ? (() => { const a = byId.get(linkFromId)!; return { x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: cursor.x, y2: cursor.y }; })()
    : null;

  const overLimit = !!doc && doc.cards.length > CARD_SOFT_LIMIT;

  const toolbar = <div className="card-toolbar">
    <div className="card-toolbar-group">
      <button className="view-toggle" onClick={() => s.setCardsMode(false)} title="返回 3D 图谱"><Box size={12} />3D 空间</button>
      <button className="view-toggle" onClick={() => s.setOutline(true)} title="查看 2D 大纲">2D 大纲</button>
      <select className="card-doc-select" value={doc?.id ?? ''} title="切换卡片作品"
        onChange={e => { if (e.target.value === '__new') { s.createCardDoc(); flash('已新建卡片作品'); } else s.openCardDoc(e.target.value); }}>
        {s.cardDocs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
        <option value="__new">＋ 新建作品</option>
      </select>
      {doc && <input className="card-doc-title" value={doc.title} aria-label="作品名称" title="点击可改名"
        onChange={e => applyDoc({ ...doc, title: e.target.value.slice(0, 60) }, false)} />}
    </div>
    <div className="card-toolbar-group">
      <button className="card-tool primary" onClick={addCard} title="新建卡片"><FilePlus2 size={13} />新建卡片</button>
      {!compact && <button className={`card-tool ${linkMode ? 'active' : ''}`} onClick={() => { setLinkMode(v => !v); setLinkFromId(null); }}
        title="连线模式：依次点击两张卡片"><Link2 size={13} />{linkMode ? '连线中' : '连线'}</button>}
      <button className="card-tool" onClick={doUndo} disabled={!doc || !canUndo(historyMap, doc.id)} title="撤销 Ctrl+Z"><Undo2 size={13} /></button>
      <button className="card-tool" onClick={doRedo} disabled={!doc || !canRedo(historyMap, doc.id)} title="重做 Ctrl+Shift+Z"><Redo2 size={13} /></button>
      {!compact && <>
        <button className="card-tool" onClick={() => setZoom(z => clamp(z / 1.15, 0.35, 2.2))} title="缩小"><Minus size={13} /></button>
        <span className="card-zoom">{Math.round(zoom * 100)}%</span>
        <button className="card-tool" onClick={() => setZoom(z => clamp(z * 1.15, 0.35, 2.2))} title="放大"><Plus size={13} /></button>
        <button className="card-tool" onClick={fitView} title="适应视野"><Focus size={13} /></button>
      </>}
      <button className="card-tool" onClick={() => doc && downloadDoc(doc)} title="导出为 JSON"><Download size={13} /></button>
      <button className="card-tool" onClick={() => fileRef.current?.click()} title="导入 JSON"><Upload size={13} /></button>
      {doc && <button className={`card-tool danger ${confirmDeleteDoc ? 'armed' : ''}`} title="删除当前作品"
        onClick={() => {
          if (!confirmDeleteDoc) { setConfirmDeleteDoc(true); window.setTimeout(() => setConfirmDeleteDoc(false), 4000); return; }
          s.removeCardDoc(doc.id); setConfirmDeleteDoc(false); setSelectedId(null); flash('作品已删除');
        }}><Trash2 size={13} />{confirmDeleteDoc ? '确认删除' : ''}</button>}
    </div>
  </div>;

  const notes = <>{toast && <div className="card-toast">{toast}<button onClick={() => setToast('')}><X size={11} /></button></div>}
    {overLimit && <div className="card-limit-note">当前 {doc?.cards.length} 张卡片，已超过建议上限 {CARD_SOFT_LIMIT} 张；仍可继续添加，但复杂画布可能变慢。</div>}</>;

  const fileInput = <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => {
    const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '';
  }} />;

  if (!doc) return <div className="card-canvas">
    {toolbar}{fileInput}{notes}
    <div className="card-empty-state"><div className="empty-orbit"><div /><div /><span>✦</span></div>
      <span className="eyebrow">CARD CANVAS</span><h2>还没有卡片作品</h2>
      <p>新建一张空白画布，把病例线索拆成一张张卡片，再用连线串起推理路径。</p>
      <button className="generate-btn compact" onClick={() => s.createCardDoc()}>＋ 新建卡片作品</button>
    </div></div>;

  const tiles = doc.cards.map((card, i) => <CardTile
    key={card.id} card={card} index={i}
    selected={selectedId === card.id} linkMode={linkMode} linkFrom={linkFromId === card.id} compact={compact}
    connectionCount={doc.links.filter(l => l.source === card.id || l.target === card.id).length}
    connections={connectionLabels(card.id)}
    linkOptions={doc.cards.filter(c => c.id !== card.id).map(c => ({ id: c.id, label: `#${doc.cards.indexOf(c) + 1} ${firstLine(c.text)}` }))}
    onSelect={() => setSelectedId(card.id)}
    onHeaderPointerDown={e => onHeaderPointerDown(e, card)}
    onResizePointerDown={e => onResizePointerDown(e, card)}
    onStartLink={() => { setLinkMode(true); setLinkFromId(card.id); setSelectedId(card.id); flash('再点一张卡片，完成连接'); }}
    onLinkClick={() => onCardLinkClick(card.id)}
    onDelete={() => deleteCard(card.id)}
    onText={v => patchCard(card.id, { text: v }, false)}
    onColor={v => patchCard(card.id, { color: v })}
    onEditStart={() => { editBaseRef.current = currentDoc(); }}
    onEditEnd={() => {
      const base = editBaseRef.current, cur = currentDoc();
      editBaseRef.current = null;
      if (base && cur && JSON.stringify(base.cards) !== JSON.stringify(cur.cards)) {
        setHistoryMap(h => commit(h, cur.id, base, cur));
      }
    }}
    onCompactLink={targetId => connect(card.id, targetId)}
    onRemoveConnection={removeLink}
  />);

  return <div className={`card-canvas ${compact ? 'compact' : ''}`}>
    {toolbar}{fileInput}{notes}
    {compact
      ? <div className="mobile-card-list">
          <div className="mobile-list-head"><b>{doc.title}</b><span>{doc.cards.length} 张卡片 · {doc.links.length} 条连接 · 独立保存在本机</span>
            <button onClick={addCard}><FilePlus2 size={13} />新建卡片</button></div>
          {doc.cards.length ? tiles : <p className="mobile-empty">还没有卡片，点右上角「新建卡片」开始。</p>}
          <div className="mobile-list-foot">小屏使用简化编辑：可改文字、换颜色、建立/移除连接；回到桌面端可自由拖拽、缩放与平移画布。</div>
        </div>
      : <div className="card-viewport" ref={viewportRef}
          onPointerDown={onViewportPointerDown}
          style={{ backgroundPosition: `${pan.x}px ${pan.y}px`, backgroundSize: `${24 * zoom}px ${24 * zoom}px` }}>
          <div className="card-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg className="card-link-layer" width={SVG_SIZE} height={SVG_SIZE}
              style={{ left: -SVG_OFFSET, top: -SVG_OFFSET }}>
              <defs>
                <marker id="card-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#C15F3C" />
                </marker>
              </defs>
              <g transform={`translate(${SVG_OFFSET},${SVG_OFFSET})`}>
                {linkPaths.map(l => <g key={l.id} className="card-link-hit">
                  <path className="card-link-line" d={l.d} markerEnd="url(#card-arrow)" />
                  <path className="card-link-hitbox" d={l.d} />
                  <circle className="card-link-remove" cx={l.cx} cy={l.cy} r="11" onClick={() => removeLink(l.id)} />
                  <text className="card-link-x" x={l.cx} y={l.cy} textAnchor="middle" dominantBaseline="central"
                    onClick={() => removeLink(l.id)}>×</text>
                </g>)}
                {preview && <path className="card-link-preview" d={`M ${preview.x1} ${preview.y1} L ${preview.x2} ${preview.y2}`} />}
              </g>
            </svg>
            {tiles}
          </div>
          {!doc.cards.length && <div className="card-blank-hint"><h2>空白画布</h2><p>点顶部「新建卡片」放第一张输入卡<br />再点「连线」把两张卡串起来</p><button onClick={addCard}><FilePlus2 size={13} />新建第一张卡片</button></div>}
          <div className="card-canvas-hint">拖动卡片顶部移动 · 右下角调整大小 · 滚轮缩放 · 拖动空白处平移 · 点击连线中点的 × 删除连接</div>
        </div>}
    <div className="card-statusbar"><span><RotateCcw size={11} />自动保存在本机 · {new Date(doc.savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
      <span>{doc.cards.length} 张卡片 · {doc.links.length} 条连接{linkMode ? (linkFromId ? ' · 再点一张目标卡片' : ' · 点一张起点卡片') : ''}</span></div>
  </div>;
}
