import { useState } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentSpec } from '../../shared/types';

const AGENT_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4dd0e1'];

export function ArchitectureView() {
  const vscode = useVSCode();
  const architecture = usePipelineStore((s) => s.architecture);
  const startTransitionLoading = usePipelineStore((s) => s.startTransitionLoading);
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!architecture) {
    return (
      <div className="pixel-text" style={{ fontSize: 11, color: '#888', textAlign: 'center', padding: 32 }}>
        DETERMINING ARCHITECTURE...
      </div>
    );
  }

  const handleApprove = () => {
    startTransitionLoading();
    vscode.postMessage({ type: 'approveArchitecture' });
  };

  const handleRevise = () => {
    if (!feedback.trim()) return;
    startTransitionLoading();
    vscode.postMessage({ type: 'reviseArchitecture', payload: { feedback: feedback.trim() } });
    setFeedback('');
    setRevising(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        maxWidth: 640,
        margin: '0 auto',
        width: '100%',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      <div className="pixel-text" style={{ fontSize: 16, textAlign: 'center', color: '#ffd54f' }}>
        AGENT ARCHITECTURE
      </div>

      <div className="pixel-text" style={{ fontSize: 9, textAlign: 'center', color: '#888' }}>
        EST. TIME: {architecture.estimatedTime}
      </div>

      {/* Execution Order */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {architecture.executionOrder.map((group, groupIdx) => (
          <div key={groupIdx}>
            <div className="pixel-text" style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>
              {group.length > 1 ? `PARALLEL GROUP ${groupIdx + 1}` : `STEP ${groupIdx + 1}`}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.map((agentId) => {
                const agent = architecture.agents.find((a: AgentSpec) => a.id === agentId);
                if (!agent) return null;
                const colorIdx = architecture.agents.indexOf(agent) % AGENT_COLORS.length;
                return <AgentCard key={agentId} agent={agent} color={AGENT_COLORS[colorIdx]} />;
              })}
            </div>
            {groupIdx < architecture.executionOrder.length - 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
                <div style={{ width: 3, height: 18, background: '#ffd54f' }} />
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderTop: '10px solid #ffd54f',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {revising ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            className="pixel-input"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="How should the architecture change?"
            rows={3}
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="pixel-btn" onClick={() => setRevising(false)}>CANCEL</button>
            <button className="pixel-btn pixel-btn-primary" onClick={handleRevise} disabled={!feedback.trim()}>
              SUBMIT
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <button className="pixel-btn" onClick={() => setRevising(true)}>
            {'\u270E'} REVISE
          </button>
          <button className="pixel-btn pixel-btn-primary" onClick={handleApprove}>
            {'\u2714'} APPROVE & EXECUTE
          </button>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, color }: { agent: AgentSpec; color: string }) {
  return (
    <div
      className="pixel-border"
      style={{
        padding: 10,
        flex: '1 1 180px',
        minWidth: 160,
        borderColor: color,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
        <span className="pixel-text" style={{ fontSize: 11, color }}>
          {agent.name.toUpperCase()}
        </span>
      </div>
      <div className="pixel-text" style={{ fontSize: 9, color: '#ccc', marginBottom: 6 }}>
        {agent.role}
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {agent.tools.map((tool) => (
          <span
            key={tool}
            className="pixel-text"
            style={{ fontSize: 7, color: '#888', background: '#1a1a2e', padding: '1px 4px' }}
          >
            {tool}
          </span>
        ))}
      </div>
    </div>
  );
}
