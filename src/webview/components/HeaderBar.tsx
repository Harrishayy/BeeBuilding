import { usePipelineStore } from '../state/pipelineStore';
import type { AppPhase } from '../../shared/types';

const PHASES: { key: AppPhase; label: string }[] = [
  { key: 'task', label: 'NECTAR' },
  { key: 'planning', label: 'SCOUT' },
  { key: 'architecture', label: 'ARCH' },
  { key: 'execution', label: 'SWARM' },
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
        padding: '10px 16px',
        borderBottom: '3px solid #FFA000',
        background: '#111111',
        gap: 12,
        minHeight: 44,
      }}
    >
      {/* Logo */}
      <span className="pixel-text" style={{ fontSize: 16, color: '#FFB300', marginRight: 8 }}>
        {'\uD83D\uDC1D'} BB
      </span>

      {/* Breadcrumbs */}
      <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
        {PHASES.map((phase, i) => {
          const phaseIdx = PHASE_ORDER.indexOf(phase.key);
          const isActive = phase.key === currentPhase ||
            (phase.key === 'planning' && currentPhase === 'plan_review');
          const isDone = phaseIdx < currentIdx;

          return (
            <div key={phase.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && (
                <span className="pixel-text" style={{ fontSize: 11, color: '#FFA000' }}>{'\u25B8'}</span>
              )}
              <span
                className="pixel-text"
                style={{
                  fontSize: 11,
                  color: isActive ? '#FFB300' : isDone ? '#66bb6a' : '#555',
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
