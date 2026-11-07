import { useEffect, useMemo, useRef } from 'react';
import { Box, Network } from 'lucide-react';
import * as THREE from 'three';
import { useLearningStore } from '../store/learningStore';
import {
  computeHelix, HELIX, HELIX_APEX, project, splitStrand, type HVec,
} from '../consult/helixGeometry';
import { CONSULT_STAGES, SOLUTION_COLOR, SOLUTION_LABEL } from '../consult/types';

const GEOM = computeHelix();
const STRAND_A = '#6E8FA6';
const STRAND_B = '#B08A79';
const DIM = '#CBC5B8';
const CURRENT = '#C15F3C';

type StageState = 'done' | 'current' | 'todo';
const stateOf = (index: number, stage: number): StageState =>
  index < stage - 1 ? 'done' : index === stage - 1 ? 'current' : 'todo';

/** 3D：手写 three 场景，静态不自转，可鼠标横向拖动看背面；进度变化时只重建几何体 */
function Helix3D({ stage, progress }: { stage: number; progress: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const applyRef = useRef<((stage: number, progress: number) => void) | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: any;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { return; }                       // 无 WebGL 时静默降级为空白，不影响聊天
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;cursor:grab';

    const scene: any = new THREE.Scene();
    const camera: any = new THREE.PerspectiveCamera(40, 1, 1, 6000);
    const objects: any[] = [];
    let angle = 0.62;
    let dirty = true;
    let raf = 0;

    const clearObjects = () => {
      while (objects.length) {
        const o = objects.pop();
        scene.remove(o);
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.());
        else o.material?.dispose?.();
      }
    };
    const addLine = (pts: HVec[], color: string, opacity: number) => {
      if (pts.length < 2) return;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, p.z))),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      );
      scene.add(line); objects.push(line);
    };
    const addBall = (p: HVec, color: string, r: number, opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
      );
      mesh.position.set(p.x, p.y, p.z);
      scene.add(mesh); objects.push(mesh);
    };

    const apply = (st: number, pg: number) => {
      clearObjects();
      const litT = (pg / 100) * HELIX.NODE_T_MAX;
      const a = splitStrand(GEOM.strandA, litT);
      const b = splitStrand(GEOM.strandB, litT);
      addLine(GEOM.strandA, DIM, 0.42);
      addLine(GEOM.strandB, DIM, 0.42);
      addLine(a.lit, STRAND_A, 0.95);
      addLine(b.lit, STRAND_B, 0.95);

      GEOM.rungs.forEach(r => {
        const stt = stateOf(r.index, st);
        const color = stt === 'current' ? CURRENT : stt === 'done' ? CONSULT_STAGES[r.index].color : DIM;
        const opacity = stt === 'todo' ? 0.34 : 0.95;
        addLine([r.a, r.b], color, opacity);
        addBall(r.a, STRAND_A, stt === 'todo' ? 4 : 5.5, stt === 'todo' ? 0.45 : 1);
        addBall(r.b, STRAND_B, stt === 'todo' ? 4 : 5.5, stt === 'todo' ? 0.45 : 1);
      });
      GEOM.joins.forEach(([from, to]) => addLine([from, to], SOLUTION_COLOR, pg >= 100 ? 0.8 : 0.35));
      addBall(HELIX_APEX, SOLUTION_COLOR, pg >= 100 ? 15 : 12, 1);
      if (pg >= 100) addBall(HELIX_APEX, '#E7A98C', 24, 0.28);
      dirty = true;
    };
    applyRef.current = apply;

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    apply(stage, progress);

    let dragging = false, lastX = 0;
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; renderer.domElement.style.cursor = 'grabbing'; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      angle += (e.clientX - lastX) * 0.006;
      lastX = e.clientX;
      dirty = true;
    };
    const up = () => { dragging = false; renderer.domElement.style.cursor = 'grab'; };
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirty) return;
      dirty = false;
      const r = 900;   // 略拉远，给螺旋上下端留白，避免贴近进度条与提示文字
      camera.position.set(Math.sin(angle) * r, 95, Math.cos(angle) * r);
      camera.lookAt(0, -10, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      applyRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      clearObjects();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // 场景只创建一次；进度变化由下面的 effect 调用 apply 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { applyRef.current?.(stage, progress); }, [stage, progress]);
  return <div className="helix-3d" ref={mount} />;
}

/** 2D：同一套坐标的正交投影，经典 DNA 正弦曲线 + 五根横档 */
function Helix2D({ stage, progress }: { stage: number; progress: number }) {
  const W = 320, H = 560;
  const p = (v: HVec) => project(v, W, H);
  const litT = (progress / 100) * HELIX.NODE_T_MAX;
  const a = splitStrand(GEOM.strandA, litT);
  const b = splitStrand(GEOM.strandB, litT);
  const pts = (arr: HVec[]) => arr.map(v => { const q = p(v); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
  const apex = p(HELIX_APEX);
  return <svg className="helix-2d" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="问诊进度双螺旋">
    <polyline points={pts(GEOM.strandA)} fill="none" stroke={DIM} strokeWidth="2" opacity=".5" />
    <polyline points={pts(GEOM.strandB)} fill="none" stroke={DIM} strokeWidth="2" opacity=".5" />
    <polyline points={pts(a.lit)} fill="none" stroke={STRAND_A} strokeWidth="2.6" strokeLinecap="round" />
    <polyline points={pts(b.lit)} fill="none" stroke={STRAND_B} strokeWidth="2.6" strokeLinecap="round" />
    {GEOM.joins.map(([f, t], i) => {
      const q1 = p(f), q2 = p(t);
      return <line key={`j${i}`} x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} stroke={SOLUTION_COLOR} strokeWidth="1.5" opacity={progress >= 100 ? '.8' : '.35'} />;
    })}
    {GEOM.rungs.map(r => {
      const q1 = p(r.a), q2 = p(r.b);
      const stt = stateOf(r.index, stage);
      const color = stt === 'current' ? CURRENT : stt === 'done' ? CONSULT_STAGES[r.index].color : DIM;
      const op = stt === 'todo' ? 0.42 : 1;
      // 标签统一放在横档中点上方并加浅色描边：既不越出右边界，也不会和骨架链糊在一起
      const mx = (q1.x + q2.x) / 2;
      const my = (q1.y + q2.y) / 2 - 8;
      return <g key={r.index} opacity={op}>
        <line x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} stroke={color} strokeWidth={stt === 'current' ? 4 : 2.6} strokeLinecap="round" />
        <circle cx={q1.x} cy={q1.y} r="5" fill={STRAND_A} />
        <circle cx={q2.x} cy={q2.y} r="5" fill={STRAND_B} />
        <text x={mx} y={my} textAnchor="middle" fontSize="9.5" fill={stt === 'todo' ? '#A39C8E' : '#5F5B52'}
          stroke="#F4F2EB" strokeWidth="3.5" paintOrder="stroke" fontFamily="var(--font-sans)">{CONSULT_STAGES[r.index].label}</text>
      </g>;
    })}
    {progress >= 100 && <circle cx={apex.x} cy={apex.y} r="21" fill="#E7A98C" opacity=".3" />}
    <circle cx={apex.x} cy={apex.y} r="10" fill={SOLUTION_COLOR} />
    <text x={W / 2} y={apex.y - 20} textAnchor="middle" fontSize="10" fill={SOLUTION_COLOR} fontFamily="var(--font-sans)">{SOLUTION_LABEL}</text>
  </svg>;
}

/** 右侧栏：上传案例后才由 App 渲染；3D / 2D 切换存在问诊会话里，刷新保留 */
export default function ConsultHelix() {
  const s = useLearningStore();
  const session = s.consult;
  const stage = session?.stage ?? 0;
  const progress = session?.progress ?? 0;
  const is3D = session?.helix3D ?? true;
  const set3D = (v: boolean) => s.setConsult(p => p ? { ...p, helix3D: v } : p);
  const stageName = useMemo(() => stage > 0 ? CONSULT_STAGES[Math.min(stage - 1, 4)].label : '尚未开始', [stage]);

  return <aside className="consult-helix">
    <header className="helix-head">
      <div className="helix-head-copy"><small>CONSULT PROGRESS</small><b>问诊进度 · 神经元模型</b></div>
      <div className="helix-toggle">
        <button className={is3D ? 'active' : ''} onClick={() => set3D(true)} title="3D 双螺旋"><Box size={12} />3D</button>
        <button className={!is3D ? 'active' : ''} onClick={() => set3D(false)} title="2D 双螺旋"><Network size={12} />2D</button>
      </div>
    </header>

    <div className="helix-progress">
      <div className="helix-progress-top"><span>{stageName}</span><b>{progress}%</b></div>
      <div className="helix-progress-track"><i style={{ width: `${progress}%` }} /></div>
    </div>

    <div className="helix-view">
      {is3D ? <Helix3D stage={stage} progress={progress} /> : <Helix2D stage={stage} progress={progress} />}
      <div className="helix-hint">已过阶段亮色 · 当前阶段高亮 · 未到阶段灰淡</div>
    </div>

    <div className="helix-stages">
      {CONSULT_STAGES.map((c, i) => {
        const stt = stateOf(i, stage);
        return <div className={`helix-stage ${stt}`} key={c.key}>
          <i style={{ background: stt === 'todo' ? DIM : c.color }} />
          <span>{c.label}</span>
          <em>{stt === 'done' ? '已完成' : stt === 'current' ? '进行中' : '未开始'}</em>
        </div>;
      })}
      <div className={`helix-stage apex ${progress >= 100 ? 'done' : ''}`}>
        <i style={{ background: SOLUTION_COLOR }} /><span>{SOLUTION_LABEL}</span><em>{progress >= 100 ? '已到达' : '终点'}</em>
      </div>
    </div>
  </aside>;
}
