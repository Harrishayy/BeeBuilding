import { AgentStation } from './AgentStation';
import { ConveyorBelt } from './ConveyorBelt';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentName, PipelineStage } from '../../shared/types';

const PIPELINE_ORDER: AgentName[] = [
  'planner',
  'coder',
  'tester',
  'reviewer',
  'orchestrator',
];

const STAGE_ACTIVE_AGENT: Partial<Record<PipelineStage, AgentName>> = {
  planning: 'planner',
  plan_approval: 'planner',
  coding: 'coder',
  code_approval: 'coder',
  testing: 'tester',
  test_approval: 'tester',
  reviewing: 'reviewer',
  review_approval: 'reviewer',
  merging: 'orchestrator',
};

function isBeltActive(stage: PipelineStage, fromIdx: number): boolean {
  const activeAgent = STAGE_ACTIVE_AGENT[stage];
  if (!activeAgent) return false;
  const activeIdx = PIPELINE_ORDER.indexOf(activeAgent);
  return fromIdx < activeIdx;
}

export function MapView() {
  const snapshot = usePipelineStore((s) => s.snapshot);

  const currentStage = snapshot?.stage ?? 'idle';
  const taskName = snapshot?.task?.title ?? 'No active task';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a2e',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '3px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          background: '#16213e',
        }}
      >
        <span
          className="pixel-text"
          style={{ fontSize: 11, color: '#ffd54f' }}
        >
          {'[=]'} AGENT FACTORY
        </span>
      </div>

      {/* Factory floor */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          position: 'relative',
        }}
      >
        {/* Isometric grid floor */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
          }}
        />

        {PIPELINE_ORDER.map((agent, index) => {
          const agentState = snapshot?.agents[agent];
          const activeAgent = STAGE_ACTIVE_AGENT[currentStage];
          const isActive = agent === activeAgent;

          return (
            <div
              key={agent}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Zig-zag offset for isometric feel */}
              <div
                style={{
                  transform:
                    index % 2 === 0
                      ? 'translateX(-20px)'
                      : 'translateX(20px)',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <AgentStation
                  agent={agent}
                  status={agentState?.status ?? 'idle'}
                  currentTask={agentState?.currentTask ?? null}
                  isActive={isActive}
                />
              </div>

              {index < PIPELINE_ORDER.length - 1 && (
                <ConveyorBelt
                  active={isBeltActive(currentStage, index)}
                  direction="down"
                  length={32}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '3px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: '#16213e',
        }}
      >
        <span className="pixel-text" style={{ fontSize: 9, color: '#888' }}>
          STAGE:{' '}
          <span style={{ color: '#4fc3f7' }}>
            {currentStage.toUpperCase()}
          </span>
        </span>
        <span
          className="pixel-text"
          style={{
            fontSize: 9,
            color: '#888',
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {taskName}
        </span>
      </div>
    </div>
  );
}
