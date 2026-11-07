import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { AI_LOCK_KEY, BYOK_STORAGE_KEY, installAiKillSwitch, isAiLocked, setAiLocked } from './aiSwitch';
import { loadByok } from './config/byok';
import { CARDS_STORAGE_KEY, loadCardLibrary } from './cards/io';
import { CONSULT_STORAGE_KEY, loadConsultSession } from './consult/storage';
import { useLearningStore } from './store/learningStore';

// 全局 AI 请求拦截器，必须早于任何组件发起请求
installAiKillSwitch();

// 启动时对齐总闸：localStorage 与持久化 store 以更严格的一侧为准
// 纯静态站没有服务端熔断，锁定状态本身就是最终生效状态
const boot = useLearningStore.getState();
if (isAiLocked() && !boot.aiLocked) {
  useLearningStore.setState({ aiLocked: true, aiStoppedAt: boot.aiStoppedAt ?? Date.now() });
}
if (boot.aiLocked && !isAiLocked()) setAiLocked(true);

// 对齐本机 BYOK 配置（store 初始化已读一次，这里处理跨标签页变化）
useLearningStore.setState({ byok: loadByok() });

// 首访注入 5 个预置教学案例（presetsSeeded 持久化，删掉示例后不再灌回）。
// 默认首屏是「模拟问诊」；这里只把案例数据备好（聊天框可直接选示例开始问诊），
// 不切换到 3D 视图。点神经元里的条目或图谱顶部「返回 3D」才会进入旧视图。
const seeded = useLearningStore.getState().seedPresets();
const bootState = useLearningStore.getState();
if (!bootState.graph) {
  const remembered = bootState.lastOpenedId && bootState.galaxy.some(x => x.id === bootState.lastOpenedId)
    ? bootState.lastOpenedId : null;
  const target = remembered || (seeded ? bootState.galaxy[0]?.id : null);
  if (target) useLearningStore.getState().loadFromGalaxy(target);
}

// 多标签页同步：停止状态或 API 配置在任一标签页变化，其他标签页立即生效
window.addEventListener('storage', e => {
  if (e.key === AI_LOCK_KEY) {
    const locked = isAiLocked();
    useLearningStore.setState(s => ({ aiLocked: locked, aiStoppedAt: locked ? (s.aiStoppedAt ?? Date.now()) : null }));
  }
  if (e.key === BYOK_STORAGE_KEY) {
    useLearningStore.setState({ byok: loadByok() });
  }
  // 卡片作品库在任一标签页改动，其他标签页立即同步（与银河分开存放）
  if (e.key === CARDS_STORAGE_KEY) {
    const lib = loadCardLibrary();
    useLearningStore.setState({ cardDocs: lib.docs, activeCardDocId: lib.activeId });
  }
  // 问诊会话也是独立存储；另一标签页新建/继续问诊时同步过来
  if (e.key === CONSULT_STORAGE_KEY) {
    useLearningStore.setState({ consult: loadConsultSession() });
  }
});

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
