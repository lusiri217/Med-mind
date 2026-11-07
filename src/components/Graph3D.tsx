import { useCallback, useEffect, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { LayoutGrid, Pause, Play, Stethoscope } from 'lucide-react';
import * as THREE from 'three';
import type { TemplateId } from '../types';
import { useLearningStore, isAvailable } from '../store/learningStore';
import { getLayout, getTemplate, TEMPLATES, normalizeTemplateId, orbitPosition, SUN_COLOR } from '../layouts';

export default function Graph3D() {
  const s = useLearningStore();
  const ref = useRef<any>(null);
  const lastTick = useRef(0);
  const graph = s.graph;

  const templateId = normalizeTemplateId(s.templateId);
  const meta = getTemplate(templateId);
  // 布局是纯函数：同一份 Graph 数据可套任意模板，视图偏好不写进数据
  const layout = useMemo(() => (graph ? getLayout(graph, templateId) : null), [graph, templateId]);

  const data = useMemo(() => {
    if (!graph || !layout) return { nodes: [] as any[], links: [] as any[] };
    const nodes: any[] = [
      { id: 'node_0', title: graph.centerSolution.title, content: graph.centerSolution.content,
        category: 'center', layer: 0, prerequisites: [], sourceRefs: graph.centerSolution.sourceRefs },
      ...graph.nodes,
    ];
    nodes.forEach(n => {
      const p = layout.placements[n.id];
      if (!p) return;
      const { x, y, z } = p.position;
      n.fx = x; n.fy = y; n.fz = z;
      n.x = x; n.y = y; n.z = z;
      if (p.orbit) n._orbit = { ...p.orbit };
    });
    return {
      nodes,
      links: graph.edges.map((e, i) => ({ source: e.source, target: e.target, type: e.type, id: `${e.type}-${i}` })),
    };
  }, [graph, layout]);

  // 按模板画辅助几何（轨道环 / 辐射线 / 时间轴 / 分层线 / 簇边界）并设定机位
  useEffect(() => {
    if (!graph || !layout) return;
    let alive = true;
    let attempts = 0;
    let raf = 0;
    let fitTimer = 0;
    const guides: any[] = [];
    const setup = () => {
      if (!alive) return;
      const scene = ref.current?.scene?.();
      if (!scene) { if (attempts++ < 40) raf = requestAnimationFrame(setup); return; }
      layout.guides.forEach(g => {
        const pts = g.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: g.color, transparent: true, opacity: g.opacity })
        );
        scene.add(line);
        guides.push(line);
      });
      ref.current?.cameraPosition(layout.camera.position, layout.camera.lookAt, 0);
      // 等节点坐标同步完成后自动适配距离，避免树/时间轴超出视野
      fitTimer = window.setTimeout(() => { if (alive) ref.current?.zoomToFit(850, 110); }, 280);
    };
    raf = requestAnimationFrame(setup);
    const reset = () => {
      ref.current?.cameraPosition(layout.camera.position, layout.camera.lookAt, 700);
      window.setTimeout(() => ref.current?.zoomToFit(700, 110), 760);
    };
    window.addEventListener('medmind-reset-view', reset);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(fitTimer);
      window.removeEventListener('medmind-reset-view', reset);
      const scene = ref.current?.scene?.();
      guides.forEach(o => {
        scene?.remove(o);
        o.geometry.dispose();
        (o.material as any).dispose();
      });
    };
  }, [graph, layout]);

  // 每帧公转：只有可旋转模板才推进角度；暂停时引擎照常 tick 但不推进，恢复后不跳帧
  const tickOrbits = useCallback(() => {
    const now = performance.now();
    const dt = lastTick.current ? Math.min(now - lastTick.current, 60) : 16;
    lastTick.current = now;
    if (!layout?.rotates || useLearningStore.getState().orbitPaused) return;
    data.nodes.forEach(n => {
      const o = n._orbit;
      if (!o) return;
      o.angle += o.speed * dt;
      const p = orbitPosition(o, o.angle);
      n.fx = p.x; n.fy = p.y; n.fz = p.z;
      n.x = p.x; n.y = p.y; n.z = p.z;
    });
  }, [data, layout]);

  // 球体：颜色区分知识范畴；中心为发光的"太阳"，未解锁只用透明度表达
  const makeNode = useCallback((n: any) => {
    const center = n.layer === 0;
    const unlocked = center || isAvailable(n, s.completed) || s.completed.includes(n.id);
    const color = center ? SUN_COLOR : (graph?.categories.find(c => c.id === n.category)?.color || '#8C887E');
    const group = new THREE.Group();
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(center ? 17 : 6.5, center ? 32 : 20, center ? 24 : 16),
      new THREE.MeshStandardMaterial({
        color, emissive: color,
        emissiveIntensity: center ? 0.5 : (unlocked ? 0.24 : 0.1),
        roughness: 0.55, metalness: 0.05,
        transparent: true, opacity: unlocked ? 1 : 0.5,
      })
    ));
    if (center) group.add(new THREE.Mesh(
      new THREE.SphereGeometry(27, 24, 18),
      new THREE.MeshBasicMaterial({ color: '#E7A98C', transparent: true, opacity: 0.22, depthWrite: false })
    ));
    return group;
  }, [graph, s.completed]);

  if (!graph || !layout) return <div className="empty-canvas"><div className="empty-orbit"><div/><div/><div/><span>✦</span></div><p className="eyebrow">CLINICAL REASONING MAP</p><h2>从一个病例，构建一张知识网络</h2><p>上传临床案例，生成分层问题图谱<br/>从基础概念开始，逐层解锁临床决策</p><div className="empty-hint">← 从左侧上传 TXT / PDF 案例开始</div></div>;

  return <div className="graph-wrap">
    <ForceGraph3D
      ref={ref}
      graphData={data}
      backgroundColor="#FAF9F5"
      showNavInfo={false}
      enableNodeDrag={false}
      warmupTicks={0}
      cooldownTicks={Infinity}
      cooldownTime={Infinity}
      d3AlphaMin={0}
      d3AlphaDecay={0.08}
      d3VelocityDecay={0.8}
      onEngineTick={tickOrbits}
      nodeThreeObject={makeNode}
      nodeLabel={(n: any) => n.title}
      linkVisibility={(l: any) => layout.showPrerequisiteLinks && l.type === 'prerequisite'}
      linkColor={() => 'rgba(193,95,60,0.35)'}
      linkWidth={() => 0.6}
      linkOpacity={layout.linkOpacity}
      linkCurvature={0}
      onNodeClick={(n: any) => {
        s.select(n.id);
        if (!n.layer) {
          const p = layout.placements['node_0'].position;
          ref.current?.cameraPosition({ x: p.x, y: p.y + 160, z: p.z + 470 }, p, 850);
          return;
        }
        const dx = n.x || 0, dy = n.y || 0, dz = n.z || 0;
        const len = Math.hypot(dx, dy, dz) || 1;
        const r = 1 + 170 / len;
        // 树/时间轴几乎在 z=0 平面上，需额外拉开 z 才能看清节点
        const camZ = dz * r + (Math.abs(dz) < 120 ? 280 : 0);
        ref.current?.cameraPosition(
          { x: dx * r, y: dy * r + 90, z: camZ },
          { x: dx, y: dy, z: dz }, 850
        );
      }}
      onBackgroundClick={() => s.select(null)}
    />
    <div className="graph-top">
      <div className="case-title"><span className="live-dot"/><div><b>{graph.caseTitle}</b><small>{graph.nodes.length} 个知识点 · {meta.name}</small></div></div>
      <div className="graph-actions">
        <button className="view-toggle consult-back" onClick={() => s.setConsultMode(true)} title="返回模拟问诊（首屏聊天界面）"><Stethoscope size={12} />返回模拟问诊</button>
        <span className="ai-review">✦ AI 生成 · 需教师审核</span>
        <select className="template-select" value={templateId} title={meta.description}
          onChange={e => s.setTemplateId(e.target.value as TemplateId)}>
          {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {layout.rotates
          ? <button className={`view-toggle ${s.orbitPaused ? 'is-paused' : ''}`} onClick={() => s.setOrbitPaused(!s.orbitPaused)} title={s.orbitPaused ? '继续公转' : '暂停公转'}>
              {s.orbitPaused ? <Play size={12} /> : <Pause size={12} />}{s.orbitPaused ? '继续公转' : '暂停公转'}
            </button>
          : <button className="view-toggle static" disabled title="该模板为静态布局，无需暂停"><Pause size={12}/>静态布局</button>}
        <button className="view-toggle" onClick={() => s.setOutline(!s.outline)}>{s.outline ? '3D 空间' : '2D 大纲'}</button>
        <button className="view-toggle" onClick={() => s.setCardsMode(true)} title="自己制作 2D 输入卡画布"><LayoutGrid size={12} />卡片画布</button>
      </div>
    </div>
    <div className="graph-legend">
      <b>知识范畴</b>{graph.categories.map(c => <span key={c.id}><i style={{ background: c.color }}/>{c.name}</span>)}
      {layout.showPrerequisiteLinks && <span className="line-key"><i/>前置依赖</span>}
    </div>
    <div className="layer-hints">
      {layout.hints.map(h => <span key={h.label}><i style={{ background: h.color }}/> {h.label}</span>)}
    </div>
  </div>;
}
