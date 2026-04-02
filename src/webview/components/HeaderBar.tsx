import { useState, useRef, useEffect } from 'react';
import { usePipelineStore } from '../state/pipelineStore';
import { useVSCode } from '../hooks/useVSCode';
import type { AppPhase } from '../../shared/types';

const PHASES: { key: AppPhase; label: string }[] = [
  { key: 'task', label: 'NECTAR' },
  { key: 'planning', label: 'SCOUT' },
  { key: 'architecture', label: 'ARCH' },
  { key: 'execution', label: 'SWARM' },
];

const PHASE_ORDER: AppPhase[] = ['settings', 'task', 'planning', 'plan_review', 'architecture', 'execution'];

const PHASE_SHORT: Record<string, string> = {
  task: 'TASK',
  planning: 'PLAN',
  plan_review: 'PLAN',
  architecture: 'ARCH',
  execution: 'EXEC',
  settings: 'SET',
};

export function HeaderBar() {
  const vscode = useVSCode();
  const currentPhase = usePipelineStore((s) => s.currentPhase);
  const previousPhase = usePipelineStore((s) => s.previousPhase);
  const openSettings = usePipelineStore((s) => s.openSettings);
  const navigateToPhase = usePipelineStore((s) => s.navigateToPhase);
  const workflows = usePipelineStore((s) => s.workflows);
  const startTransitionLoading = usePipelineStore((s) => s.startTransitionLoading);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const displayPhase = currentPhase === 'settings'
    ? (previousPhase ?? 'task')
    : currentPhase;
  const currentIdx = PHASE_ORDER.indexOf(displayPhase);

  const activeWorkflow = workflows.length > 0 ? workflows.find((_, i) => i === 0) : null;
  const activeTitle = activeWorkflow?.title ?? 'Workflow';

  function handleNewWorkflow() {
    startTransitionLoading();
    vscode.postMessage({ type: 'newWorkflow' });
    setDropdownOpen(false);
  }

  function handleSwitchWorkflow(id: string) {
    startTransitionLoading();
    vscode.postMessage({ type: 'switchWorkflow', payload: { workflowId: id } });
    setDropdownOpen(false);
  }

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
          const isActive = phase.key === displayPhase ||
            (phase.key === 'planning' && displayPhase === 'plan_review');
          const isDone = phaseIdx < currentIdx;
          const isClickable = isDone && !isActive;

          return (
            <div key={phase.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && (
                <span className="pixel-text" style={{ fontSize: 11, color: '#FFA000' }}>{'\u25B8'}</span>
              )}
              <span
                className="pixel-text"
                onClick={isClickable ? () => navigateToPhase(phase.key) : undefined}
                style={{
                  fontSize: 11,
                  color: isActive ? '#FFB300' : isDone ? '#66bb6a' : '#555',
                  cursor: isClickable ? 'pointer' : 'default',
                }}
              >
                {isDone ? '\u2714 ' : ''}{phase.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Workflow switcher dropdown */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          className="pixel-btn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            padding: '6px 12px',
            fontSize: 10,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 180,
          }}
        >
          <span
            className="pixel-text"
            style={{
              fontSize: 9,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 120,
            }}
          >
            {activeTitle}
          </span>
          <span style={{ fontSize: 8 }}>{dropdownOpen ? '\u25B4' : '\u25BE'}</span>
        </button>

        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: '#1a1a2e',
              border: '2px solid #333',
              borderRadius: 0,
              minWidth: 220,
              maxHeight: 300,
              overflowY: 'auto',
              zIndex: 999,
              boxShadow: '4px 4px 0 rgba(0,0,0,0.4)',
            }}
          >
            {/* New workflow button */}
            <button
              className="pixel-text"
              onClick={handleNewWorkflow}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: '2px solid #333',
                color: '#4caf50',
                fontSize: 10,
                textAlign: 'left',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#252540')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              + NEW WORKFLOW
            </button>

            {/* Workflow list */}
            {workflows.length === 0 && (
              <div className="pixel-text" style={{ padding: '10px 14px', color: '#555', fontSize: 9 }}>
                No saved workflows
              </div>
            )}
            {workflows.map((wf) => (
              <button
                key={wf.id}
                className="pixel-text"
                onClick={() => handleSwitchWorkflow(wf.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #2a2a3e',
                  color: '#ccc',
                  fontSize: 9,
                  textAlign: 'left',
                  cursor: 'pointer',
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#252540')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {wf.title}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    color: '#888',
                    flexShrink: 0,
                    background: '#252540',
                    padding: '2px 6px',
                    border: '1px solid #333',
                  }}
                >
                  {PHASE_SHORT[wf.phase] ?? wf.phase.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        )}
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
