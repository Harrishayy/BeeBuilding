import { useMemo } from 'react';
import { AgentStation } from './AgentStation';
import { PollenPath } from './PollenPath';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentName, PipelineStage } from '../../shared/types';

const STATIC_PIPELINE_ORDER: AgentName[] = [
  'scout_bee',
  'worker_bee',
  'tester_bee',
  'guard_bee',
  'queen_bee',
];

const STAGE_ACTIVE_AGENT: Partial<Record<PipelineStage, AgentName>> = {
  planning: 'scout_bee',
  plan_approval: 'scout_bee',
  coding: 'worker_bee',
  code_approval: 'worker_bee',
  testing: 'tester_bee',
  test_approval: 'tester_bee',
  reviewing: 'guard_bee',
  review_approval: 'guard_bee',
  merging: 'queen_bee',
};

function isBeltActiveStatic(stage: PipelineStage, fromIdx: number): boolean {
  const activeAgent = STAGE_ACTIVE_AGENT[stage];
  if (!activeAgent) return false;
  const activeIdx = STATIC_PIPELINE_ORDER.indexOf(activeAgent);
  return fromIdx < activeIdx;
}

export function MapView() {
  const snapshot = usePipelineStore((s) => s.snapshot);
  const architecture = usePipelineStore((s) => s.architecture);

  const isDynamic = snapshot?.dynamicMode ?? false;
  const currentStage = snapshot?.stage ?? 'idle';
  const taskName = snapshot?.task?.title ?? 'No active nectar run';

  const agentOrder = useMemo<AgentName[]>(() => {
    if (!isDynamic) return STATIC_PIPELINE_ORDER;
    if (!snapshot?.agents) return [];
    if (architecture?.executionOrder) {
      const flat = architecture.executionOrder.flat();
      const inSnapshot = new Set(Object.keys(snapshot.agents));
      const ordered = flat.filter((id) => inSnapshot.has(id));
      for (const id of inSnapshot) {
        if (!ordered.includes(id)) ordered.push(id);
      }
      return ordered;
    }
    return Object.keys(snapshot.agents);
  }, [isDynamic, snapshot?.agents, architecture?.executionOrder]);

  const groupBoundaries = useMemo<Set<number>>(() => {
    if (!isDynamic || !architecture?.executionOrder) return new Set();
    const boundaries = new Set<number>();
    let idx = 0;
    for (const group of architecture.executionOrder) {
      idx += group.length;
      boundaries.add(idx - 1);
    }
    return boundaries;
  }, [isDynamic, architecture?.executionOrder]);

  const statusLabel = isDynamic
    ? `GROUP ${(snapshot?.currentGroupIndex ?? 0) + 1}/${snapshot?.totalGroups ?? '?'}`
    : currentStage.toUpperCase();

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
          borderBottom: '3px solid #FFA000',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          background: '#111111',
        }}
      >
        <span
          className="pixel-text"
          style={{ fontSize: 11, color: '#FFB300' }}
        >
          {'\uD83D\uDC1D'} THE HIVE
        </span>
      </div>

      {/* Honeycomb floor */}
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
        {/* Hex grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(rgba(255,176,0,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,176,0,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
          }}
        />

        {agentOrder.map((agent, index) => {
          const agentState = snapshot?.agents[agent];
          const isActive = isDynamic
            ? agentState?.status === 'working'
            : agent === STAGE_ACTIVE_AGENT[currentStage];

          const showBelt = index < agentOrder.length - 1 && !groupBoundaries.has(index);
          const showGroupDivider = groupBoundaries.has(index) && index < agentOrder.length - 1;

          const beltActive = isDynamic
            ? (agentState?.status === 'done')
            : isBeltActiveStatic(currentStage, index);

          return (
            <div
              key={agent}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Honeycomb offset for hex feel */}
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

              {showBelt && (
                <PollenPath
                  active={beltActive}
                  direction="down"
                  length={32}
                />
              )}

              {showGroupDivider && (
                <div
                  style={{
                    width: 80,
                    height: 2,
                    background: '#ffd54f33',
                    margin: '8px 0',
                  }}
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
          borderTop: '3px solid #FFA000',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: '#111111',
        }}
      >
        <span className="pixel-text" style={{ fontSize: 9, color: '#888' }}>
          SWARM:{' '}
          <span style={{ color: '#FFB300' }}>
            {statusLabel}
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
