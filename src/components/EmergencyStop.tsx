import { useEffect, useState } from 'react';
import { Power, ShieldCheck } from 'lucide-react';
import { useLearningStore } from '../store/learningStore';

/**
 * 「抹除本机 API Key · 紧急停止 AI」按钮。
 * 两击确认：第一击进入待确认态（6 秒后自动复位），第二击才真正执行，避免误触。
 * compact 模式用于 3D / 2D 视图顶部栏。
 */
export default function EmergencyStop({ compact = false }: { compact?: boolean }) {
  const s = useLearningStore();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (s.aiLocked) {
    return (
      <button
        className={`kill-switch stopped ${compact ? 'compact' : ''}`}
        onClick={() => s.restoreAi()}
        title="解除紧急停止；API Key 需重新填写"
      >
        <ShieldCheck size={compact ? 13 : 15} />
        <span>{compact ? '恢复 AI' : '恢复 AI 功能'}</span>
      </button>
    );
  }

  return (
    <button
      className={`kill-switch ${armed ? 'armed' : ''} ${compact ? 'compact' : ''}`}
      onClick={() => { if (armed) { s.eraseApi(); setArmed(false); } else setArmed(true); }}
      title="抹除本机 API Key 并立即停止本页一切 AI 请求"
    >
      <Power size={compact ? 13 : 15} />
      <span>{armed ? '再点一次确认抹除' : (compact ? '紧急停止' : '抹除密钥 · 紧急停止 AI')}</span>
    </button>
  );
}
