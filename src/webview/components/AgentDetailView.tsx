import { WorkLog } from './WorkLog';
import { StatusBadge } from './StatusBadge';
import { usePipelineStore } from '../state/pipelineStore';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { useVSCode } from '../hooks/useVSCode';
import type { AgentName, ArtifactRef } from '../../shared/types';

const AGENT_DISPLAY: Record<string, string> = {
  scout_bee: '\uD83D\uDD0D SCOUT BEE',
  worker_bee: '\uD83D\uDC77 WORKER BEE',
  tester_bee: '\uD83E\uDDEA TESTER BEE',
  guard_bee: '\uD83D\uDEE1\uFE0F GUARD BEE',
  queen_bee: '\uD83D\uDC51 QUEEN BEE',
};

const FLOW: Record<string, { from: AgentName | null; to: AgentName | null }> = {
  scout_bee: { from: null, to: 'worker_bee' },
  worker_bee: { from: 'scout_bee', to: 'tester_bee' },
  tester_bee: { from: 'worker_bee', to: 'guard_bee' },
  guard_bee: { from: 'tester_bee', to: 'queen_bee' },
  queen_bee: { from: 'guard_bee', to: null },
};

const ARTIFACT_ICON: Record<string, string> = {
  spec: '[\u2B21]',
  code: '[\u2B22]',
  test_report: '[\u2B23]',
  review: '[\u2B24]',
  diff: '[\u0394]',
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
        style={{ fontSize: 10, color: '#FFB300', flexShrink: 0 }}
      >
        {ARTIFACT_ICON[artifact.type] ?? '[?]'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="pixel-text"
          style={{ fontSize: 9, color: '#e0e0e0' }}
        >
          {artifact.name}
        </div>
        <div
          style={{
            fontSize: 8,
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

  const agentKey: AgentName = selectedAgent ?? 'scout_bee';
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
        <span className="pixel-text">No bee selected</span>
      </div>
    );
  }

  const flow = FLOW[selectedAgent] ?? { from: null, to: null };
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
          borderBottom: '3px solid #FFA000',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#111111',
          flexShrink: 0,
        }}
      >
        <button
          className="pixel-btn"
          onClick={handleBack}
          style={{ fontSize: 10, padding: '4px 8px' }}
        >
          {'<'} HIVE
        </button>
        <span className="pixel-text" style={{ fontSize: 12, flex: 1, color: '#FFB300' }}>
          {AGENT_DISPLAY[selectedAgent] ?? selectedAgent}
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
        {/* Pheromone handoff info */}
        <div style={{ display: 'flex', gap: 12 }}>
          {flow.from && (
            <div
              className="pixel-border-inset"
              style={{ flex: 1, padding: 8, background: '#111111' }}
            >
              <div
                className="pixel-text"
              style={{ fontSize: 9, color: '#888', marginBottom: 4 }}
            >
              PHEROMONE FROM
            </div>
              <div
                className="pixel-text"
                style={{ fontSize: 10, color: '#FFB300' }}
              >
                {AGENT_DISPLAY[flow.from] ?? flow.from}
              </div>
            </div>
          )}
          {flow.to && (
            <div
              className="pixel-border-inset"
              style={{ flex: 1, padding: 8, background: '#111111' }}
            >
              <div
                className="pixel-text"
              style={{ fontSize: 9, color: '#888', marginBottom: 4 }}
            >
              PASSING TO
            </div>
              <div
                className="pixel-text"
                style={{ fontSize: 10, color: '#FFA000' }}
              >
                {AGENT_DISPLAY[flow.to] ?? flow.to}
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        <div
          style={{
            background: '#111',
            border: '2px solid #FFA000',
            height: 12,
            imageRendering: 'pixelated',
          }}
        >
          <div
            style={{
              width: `${agentState.progress}%`,
              height: '100%',
              background: '#FFB300',
              transition: 'width 0.3s',
            }}
          />
        </div>

        {/* Work log */}
        <div style={{ flex: 1, minHeight: 150 }}>
          <div
            className="pixel-text"
            style={{ fontSize: 10, color: '#888', marginBottom: 4 }}
          >
            NECTAR LOG
          </div>
          <WorkLog chunks={outputChunks} />
        </div>

        {/* Artifacts */}
        {agentState.artifacts.length > 0 && (
          <div>
            <div
              className="pixel-text"
            style={{ fontSize: 10, color: '#888', marginBottom: 4 }}
          >
            HONEYCOMB CELLS
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

        {/* Queen's Gate approval inline */}
        {isAtGate && (
          <div
            className="pixel-border"
            style={{
              padding: 12,
              background: '#1a1a2e',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderColor: '#FFB300',
            }}
          >
            <div
              className="pixel-text"
              style={{ fontSize: 10, color: '#FFB300' }}
            >
              {'\uD83D\uDC51'} QUEEN&apos;S GATE — APPROVAL REQUIRED
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 9, color: '#aaa' }}
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
