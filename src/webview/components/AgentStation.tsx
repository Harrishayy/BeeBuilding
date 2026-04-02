import { AgentSprite } from './AgentSprite';
import { StatusBadge } from './StatusBadge';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentName, AgentStatus } from '../../shared/types';

interface AgentStationProps {
  agent: AgentName;
  status: AgentStatus;
  currentTask: string | null;
  isActive: boolean;
}

const AGENT_LABELS: Record<AgentName, string> = {
  planner: 'PLAN',
  coder: 'CODE',
  tester: 'TEST',
  reviewer: 'REVIEW',
  orchestrator: 'MERGE',
};

export function AgentStation({
  agent,
  status,
  currentTask,
  isActive,
}: AgentStationProps) {
  const selectAgent = usePipelineStore((s) => s.selectAgent);
  const setView = usePipelineStore((s) => s.setView);

  const handleClick = () => {
    selectAgent(agent);
    setView('detail');
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {/* Active glow ring */}
      {isActive && (
        <div
          className="anim-pulse"
          style={{
            position: 'absolute',
            inset: -4,
            border: '2px solid #42a5f5',
            color: '#42a5f5',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      <div
        className="pixel-border"
        style={{
          background: '#0f3460',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 100,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Tiled floor background */}
        <div
          style={{
            position: 'absolute',
            inset: 3,
            background: `repeating-conic-gradient(
              #0d2b4d 0% 25%,
              #0f3460 0% 50%
            ) 0 0 / 12px 12px`,
            opacity: 0.5,
            zIndex: 0,
            imageRendering: 'pixelated',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <AgentSprite agent={agent} status={status} />

          <div
            className="pixel-text"
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: isActive ? '#fff' : '#aaa',
              textAlign: 'center',
            }}
          >
            {AGENT_LABELS[agent]}
          </div>

          <StatusBadge status={status} />

          {currentTask && (
            <div
              style={{
              fontSize: 9,
              color: '#888',
              maxWidth: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'center',
                fontFamily: 'var(--font-pixel)',
              }}
            >
              {currentTask}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
