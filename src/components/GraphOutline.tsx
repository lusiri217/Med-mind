import { Box, Check, ChevronDown, ChevronRight, CircleHelp, LayoutGrid, LockKeyhole, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isAvailable, useLearningStore } from '../store/learningStore';
export default function GraphOutline(){const s=useLearningStore(),[expanded,setExpanded]=useState<Record<number,boolean>>({3:true,2:true,1:true,0:true});const g=s.graph;if(!g)return null;const groups=useMemo(()=>[3,2,1,0].map(layer=>({layer,nodes:layer===0?[]:g.nodes.filter(n=>n.layer===layer)})),[g]);const center={id:'node_0',title:g.centerSolution.title,layer:0,category:'center',prerequisites:[],content:g.centerSolution.content,question:'综合病例线索、知识依据与鉴别诊断，提出可解释的最终临床决策。',sourceRefs:g.centerSolution.sourceRefs,assessment:{question:'本病例最终决策应基于哪些信息？',options:['综合病例证据和知识依据','只依据单个症状','忽略禁忌证','不考虑鉴别诊断'],answer:'综合病例证据和知识依据',passScore:.8},status:'available' as const};return <div className="outline-wrap"><div className="outline-head"><div><span className="eyebrow">LEARNING PATH</span><h2>病例问题大纲</h2><p>{g.caseTitle} · 按基础到临床逐层推进</p></div><div className="outline-head-actions"><div className="progress-pill">已完成 {s.completed.length} / {g.nodes.length}</div><button className="view-toggle back-3d" onClick={() => s.setOutline(false)} title="返回太阳系 3D 视图"><Box size={13} />返回 3D 空间</button><button className="view-toggle" onClick={() => s.setCardsMode(true)} title="自己制作 2D 输入卡画布"><LayoutGrid size={13} />卡片画布</button></div></div><div className="outline-list">{groups.filter(x=>x.layer).map(group=><div className="layer-group" key={group.layer}><button className="layer-heading" onClick={()=>setExpanded(v=>({...v,[group.layer]:!v[group.layer]}))}><span className="layer-dot"/>第 {group.layer} 层 · {group.layer===3?'基础知识':group.layer===2?'机制与诊断':'临床决策'}<span className="layer-count">{group.nodes.filter(n=>s.completed.includes(n.id)).length}/{group.nodes.length}</span>{expanded[group.layer]?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>{expanded[group.layer]&&<div className="node-list">{group.nodes.map(n=><NodeRow key={n.id} node={n} color={g.categories.find(c=>c.id===n.category)?.color||'#C15F3C'}/>)}</div>}</div>)}<div className="layer-group"><button className="layer-heading" onClick={()=>setExpanded(v=>({...v,0:!v[0]}))}><span className="layer-dot center-dot"/>最终解决方案<ChevronDown size={15}/></button>{expanded[0]&&<NodeRow node={center as any} color="#C15F3C"/>}</div></div><div className="outline-footer">点击问题查看详情 · 完成阅读与测评后逐层解锁 · 最终收束到解决方案</div></div>}
const LAYER_NAMES:Record<number,string>={3:'基础知识',2:'机制与诊断',1:'临床决策',0:'最终方案'};
function NodeRow({node,color}:{node:any;color:string}){
  const s=useLearningStore();
  const done=s.completed.includes(node.id),avail=node.layer===0||isAvailable(node,s.completed)||done;
  const locked=!avail;
  const hit=(node.title+' '+node.question).toLowerCase().includes(s.search.toLowerCase());
  if(!hit)return null;
  const q=String(node.question||'').trim(),t=String(node.title||'').trim();
  const norm=(v:string)=>v.replace(/[？?。!！\s，,、；;]/g,'').toLowerCase();
  // 标题与引导问题常只差一个问号：重复时第二行改显示层级与前置信息，不再复读一遍
  const duplicated=!!q&&!!t&&(norm(q)===norm(t)||norm(q).startsWith(norm(t))||norm(t).startsWith(norm(q)));
  const pre=(node.prerequisites||[]).length;
  const meta=node.category==='center'?'案例决策':(duplicated
    ? '第 '+node.layer+' 层 · '+(LAYER_NAMES[node.layer]||'知识点')+(pre?' · 需 '+pre+' 项前置':' · 可直接开始')
    : q);
  return <button className={`outline-node ${locked?'locked':''} ${done?'done':''} ${s.selectedId===node.id?'selected':''}`} onClick={()=>s.select(node.id)}><span className="node-status" style={{color:locked?'#A8A297':done?'#6E8B62':color}}>{locked?<LockKeyhole size={14}/>:done?<Check size={15}/>:<CircleHelp size={14}/>}</span><span className="node-label">{node.title}<small>{meta}</small></span>{locked&&<span className="locked-tag">需前置</span>}<i className="category-dot" style={{background:color}}/></button>
}
