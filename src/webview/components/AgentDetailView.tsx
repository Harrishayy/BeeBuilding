import { WorkLog } from './WorkLog';
import { StatusBadge } from './StatusBadge';
import { usePipelineStore } from '../state/pipelineStore';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { useVSCode } from '../hooks/useVSCode';
import type { AgentName, ArtifactRef } from '../../shared/types';

const AGENT_DISPLAY: Record<AgentName, string> = {
  planner: 'PLANNER',
  coder: 'CODER',
  tester: 'TESTER',
  reviewer: 'REVIEWER',
  orchestrator: 'ORCHESTRATOR',
};

const FLOW: Record<AgentName, { from: AgentName | null; to: AgentName | null }> = {
  planner: { from: null, to: 'coder' },
  coder: { from: 'planner', to: 'tester' },
  tester: { from: 'coder', to: 'reviewer' },
  reviewer: { from: 'tester', to: 'orchestrator' },
  orchestrator: { from: 'reviewer', to: null },
};

const ARTIFACT_ICON: Record<string, string> = {
  spec: '[S]',
  code: '[C]',
  test_report: '[T]',
  review: '[R]',
  diff: '[D]',
};

function ArtifactItem({ artifact }: { artifact: ArtifactRef }) {
  return (
    <div
      className="pixel-border-inset"
      style={{
        padding: 6,
        background: '#0a0a14',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <span
        className="pixel-text"
        style={{ fontSize: 7, color: '#4dd0e1', flexShrink: 0 }}
      >
        {ARTIFACT_ICON[artifact.type] ?? '[?]'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="pixel-text"
          style={{ fontSize: 6, color: '#e0e0e0' }}
        >
          {artifact.name}
        </div>
        <div
          style={{
            fontSize: 5,
            color: '#888',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-pixel)',
          }}
        >
          {artifact.summary}
        </div>
      </div>
    </div>
  );
}

export function AgentDetailView() {
  const vscode = useVSCode();
  const selectedAgent = usePipelineStore((s) => s.selectedAgent);
  const setView = usePipelineStore((s) => s.setView);
  const snapshot = usePipelineStore((s) => s.snapshot);

  const agentKey: AgentName = selectedAgent ?? 'planner';
  const { agentState, outputChunks } = useAgentEvents(agentKey);

  if (!selectedAgent || !agentState) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: 'center',
          color: '#555',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="pixel-text">No agent selected</span>
      </div>
    );
  }

  const flow = FLOW[selectedAgent];
  const gate = snapshot?.currentGate;
  const isAtGate = gate != null && gate.fromAgent === selectedAgent;

  const handleBack = () => setView('map');

  const handleApprove = () => {
    if (gate) {
      vscode.postMessage({
        type: 'approveGate',
        payload: { stage: gate.stage },
      });
    }
  };

  const handleRequestDiff = () => {
    vscode.postMessage({
      type: 'requestDiff',
      payload: { agent: selectedAgent },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a2e',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 12,
          borderBottom: '3px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#16213e',
          flexShrink: 0,
        }}
      >
        <button
          className="pixel-btn"
          onClick={handleBack}
          style={{ fontSize: 7, padding: '4px 8px' }}
        >
          {'<'} BACK
        </button>
        <span className="pixel-text" style={{ fontSize: 9, flex: 1 }}>
          {AGENT_DISPLAY[selectedAgent]}
        </span>
        <StatusBadge status={agentState.status} size={10} />
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Handoff info */}
        <div style={{ display: 'flex', gap: 12 }}>
          {flow.from && (
            <div
              className="pixel-border-inset"
              style={{ flex: 1, padding: 8, background: '#0f3460' }}
            >
              <div
                className="pixel-text"
                style={{ fontSize: 6, color: '#888', marginBottom: 4 }}
              >
                RECEIVED FROM
              </div>
              <div
                className="pixel-text"
                style={{ fontSize: 7, color: '#4fc3f7' }}
              >
                {AGENT_DISPLAY[flow.from]}
              </div>
            </div>
          )}
          {flow.to && (
            <div
              className="pixel-border-inset"
              style={{ flex: 1, padding: 8, background: '#0f3460' }}
            >
              <div
                className="pixel-text"
                style={{ fontSize: 6, color: '#888', marginBottom: 4 }}
              >
                PASSING TO
              </div>
              <div
                className="pixel-text"
                style={{ fontSize: 7, color: '#ffa726' }}
              >
                {AGENT_DISPLAY[flow.to]}
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        <div
          style={{
            background: '#111',
            border: '2px solid #333',
            height: 12,
            imageRendering: 'pixelated',
          }}
        >
          <div
            style={{
              width: `${agentState.progress}%`,
              height: '100%',
              background: '#66bb6a',
              transition: 'width 0.3s',
            }}
          />
        </div>

        {/* Work log */}
        <div style={{ flex: 1, minHeight: 150 }}>
          <div
            className="pixel-text"
            style={{ fontSize: 7, color: '#888', marginBottom: 4 }}
          >
            OUTPUT LOG
          </div>
          <WorkLog chunks={outputChunks} />
        </div>

        {/* Artifacts */}
        {agentState.artifacts.length > 0 && (
          <div>
            <div
              className="pixel-text"
              style={{ fontSize: 7, color: '#888', marginBottom: 4 }}
            >
              ARTIFACTS
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {agentState.artifacts.map((a) => (
                <ArtifactItem key={a.id} artifact={a} />
              ))}
            </div>
          </div>
        )}

        {/* Gate approval inline */}
        {isAtGate && (
          <div
            className="pixel-border"
            style={{
              padding: 12,
              background: '#1a1a2e',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              className="pixel-text"
              style={{ fontSize: 7, color: '#ffd54f' }}
            >
              {'!!'} APPROVAL REQUIRED
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 6, color: '#aaa' }}
            >
              {gate.filesChanged} files | +{gate.linesAdded} -{gate.linesRemoved}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pixel-btn" onClick={handleRequestDiff}>
                VIEW DIFF
              </button>
              <button
                className="pixel-btn pixel-btn-primary"
                onClick={handleApprove}
              >
                APPROVE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
