import { useState } from 'react';
import type { TimelineEvent, AgentName } from '../../shared/types';
import { usePipelineStore } from '../state/pipelineStore';

const AGENT_DOT_COLORS: Record<string, string> = {
  scout_bee: '#4FC3F7',
  worker_bee: '#FFA000',
  tester_bee: '#66BB6A',
  guard_bee: '#EF5350',
  queen_bee: '#FFD700',
};

interface TimelineProps {
  events: TimelineEvent[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function Timeline({ events }: TimelineProps) {
  const [collapsed, setCollapsed] = useState(false);
  const selectAgent = usePipelineStore((s) => s.selectAgent);
  const setView = usePipelineStore((s) => s.setView);

  const handleEventClick = (evt: TimelineEvent) => {
    if (evt.agentName) {
      selectAgent(evt.agentName);
      setView('detail');
    }
  };

  return (
    <div
      className="pixel-border"
      style={{
        background: '#111111',
        borderColor: '#FFA000',
        width: collapsed ? 30 : 200,
        transition: 'width 0.15s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header toggle */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: 8,
          borderBottom: '2px solid #FFA000',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: '#FFB300' }}>
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        {!collapsed && (
          <span className="pixel-text" style={{ fontSize: 10, color: '#FFB300' }}>
            COLONY LOG
          </span>
        )}
      </div>

      {/* Event list */}
      {!collapsed && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {events.length === 0 && (
            <div
              className="pixel-text"
              style={{
                color: '#555',
                fontSize: 9,
                padding: 8,
                textAlign: 'center',
              }}
            >
              Hive is quiet...
            </div>
          )}

          {events.map((evt) => (
            <div
              key={evt.id}
              onClick={() => handleEventClick(evt)}
              className="anim-slide-in"
              style={{
                padding: '6px 4px',
                borderBottom: '1px solid #222',
                cursor: evt.agentName ? 'pointer' : 'default',
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                fontSize: 9,
                fontFamily: 'var(--font-pixel)',
              }}
            >
              {/* Agent dot */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  flexShrink: 0,
                  marginTop: 2,
                  backgroundColor: evt.agentName
                    ? (AGENT_DOT_COLORS[evt.agentName] ?? '#888')
                    : '#555',
                  borderRadius: '50%',
                  boxShadow: evt.agentName
                    ? `0 0 3px ${AGENT_DOT_COLORS[evt.agentName] ?? '#888'}`
                    : 'none',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#666', fontSize: 8 }}>
                  {formatTime(evt.timestamp)}
                </div>
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {evt.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
