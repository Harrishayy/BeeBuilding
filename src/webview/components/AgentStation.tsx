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

const AGENT_LABELS: Record<string, string> = {
  scout_bee: 'SCOUT',
  worker_bee: 'WORKER',
  tester_bee: 'TESTER',
  guard_bee: 'GUARD',
  queen_bee: 'QUEEN',
};

function getLabel(agent: AgentName): string {
  return AGENT_LABELS[agent] ?? agent.toUpperCase().slice(0, 8);
}

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
      {/* Active glow ring — amber for the hive */}
      {isActive && (
        <div
          className="anim-pulse"
          style={{
            position: 'absolute',
            inset: -4,
            border: '2px solid #FFB300',
            color: '#FFB300',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      <div
        className="pixel-border"
        style={{
          background: '#111111',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 100,
          position: 'relative',
          overflow: 'hidden',
          borderColor: '#FFA000',
        }}
      >
        {/* Honeycomb cell background */}
        <div
          style={{
            position: 'absolute',
            inset: 3,
            background: `repeating-conic-gradient(
              #1a1a0d 0% 25%,
              #111111 0% 50%
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
              color: isActive ? '#FFB300' : '#aaa',
              textAlign: 'center',
            }}
          >
            {getLabel(agent)}
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
