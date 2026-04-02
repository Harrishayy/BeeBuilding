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
  const previousPhase = usePipelineStore((s) => s.previousPhase);
  const openSettings = usePipelineStore((s) => s.openSettings);
  const navigateToPhase = usePipelineStore((s) => s.navigateToPhase);

  const displayPhase = currentPhase === 'settings'
    ? (previousPhase ?? 'task')
    : currentPhase;
  const currentIdx = PHASE_ORDER.indexOf(displayPhase);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '3px solid #333',
        background: '#12121e',
        gap: 12,
        minHeight: 44,
      }}
    >
      {/* Logo */}
      <span className="pixel-text" style={{ fontSize: 16, color: '#ffd54f', marginRight: 8 }}>
        {'\uD83D\uDC1D'} BB
      </span>

      {/* Breadcrumbs */}
      <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
        {PHASES.map((phase, i) => {
          const phaseIdx = PHASE_ORDER.indexOf(phase.key);
          const isActive = phase.key === displayPhase ||
            (phase.key === 'planning' && displayPhase === 'plan_review');
          const isDone = phaseIdx < currentIdx;
          const isClickable = isDone && !isActive;

          return (
            <div key={phase.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && (
                <span className="pixel-text" style={{ fontSize: 11, color: '#444' }}>{'\u25B8'}</span>
              )}
              <span
                className="pixel-text"
                onClick={isClickable ? () => navigateToPhase(phase.key) : undefined}
                style={{
                  fontSize: 11,
                  color: isActive ? '#ffd54f' : isDone ? '#4caf50' : '#555',
                  cursor: isClickable ? 'pointer' : 'default',
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
        style={{
          padding: '6px 12px',
          fontSize: 12,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>{'\u2699'}</span>
        <span className="pixel-text" style={{ fontSize: 9 }}>SETTINGS</span>
      </button>
    </div>
  );
}
