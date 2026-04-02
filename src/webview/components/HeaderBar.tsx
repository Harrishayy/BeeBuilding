import { usePipelineStore } from '../state/pipelineStore';
import type { AppPhase } from '../../shared/types';

const PHASES: { key: AppPhase; label: string }[] = [
  { key: 'task', label: 'TASK' },
  { key: 'planning', label: 'PLAN' },
  { key: 'architecture', label: 'ARCH' },
  { key: 'execution', label: 'EXEC' },
];

const PHASE_ORDER: AppPhase[] = ['settings', 'task', 'planning', 'plan_review', 'architecture', 'execution'];

export function HeaderBar() {
  const currentPhase = usePipelineStore((s) => s.currentPhase);
  const openSettings = usePipelineStore((s) => s.openSettings);
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        borderBottom: '2px solid #333',
        background: '#12121e',
        gap: 8,
      }}
    >
      {/* Logo */}
      <span className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', marginRight: 8 }}>
        {'\uD83D\uDC1D'} BB
      </span>

      {/* Breadcrumbs */}
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {PHASES.map((phase, i) => {
          const phaseIdx = PHASE_ORDER.indexOf(phase.key);
          const isActive = phase.key === currentPhase ||
            (phase.key === 'planning' && currentPhase === 'plan_review');
          const isDone = phaseIdx < currentIdx;

          return (
            <div key={phase.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && (
                <span className="pixel-text" style={{ fontSize: 6, color: '#444' }}>{'\u25B8'}</span>
              )}
              <span
                className="pixel-text"
                style={{
                  fontSize: 6,
                  color: isActive ? '#ffd54f' : isDone ? '#4caf50' : '#555',
                  cursor: isDone ? 'pointer' : 'default',
                }}
              >
                {isDone ? '\u2714 ' : ''}{phase.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Settings gear */}
      <button
        className="pixel-btn"
        onClick={openSettings}
        style={{ padding: '2px 6px', fontSize: 8, lineHeight: 1 }}
      >
        {'\u2699'}
      </button>
    </div>
  );
}
