import { useState } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentName, PipelineStage } from '../../shared/types';

const AGENT_ACTION: Record<string, string> = {
  scout_bee: 'SCOUTING',
  worker_bee: 'BUILDING',
  tester_bee: 'TESTING',
  guard_bee: 'GUARDING',
  queen_bee: 'MERGING',
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  idle: 'HIVE IDLE',
  planning: 'SCOUTING',
  plan_approval: "QUEEN'S GATE: SCOUT",
  coding: 'BUILDING',
  code_approval: "QUEEN'S GATE: WORKER",
  testing: 'TESTING',
  test_approval: "QUEEN'S GATE: TESTER",
  reviewing: 'GUARDING',
  review_approval: "QUEEN'S GATE: GUARD",
  merging: 'SEALING HONEYCOMB',
  done: 'NECTAR RUN COMPLETE',
  failed: 'SWARM FAILED',
};

export function ApprovalGateModal() {
  const vscode = useVSCode();
  const snapshot = usePipelineStore((s) => s.snapshot);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const gate = snapshot?.currentGate;
  if (!gate) return null;

  const handleApprove = () => {
    vscode.postMessage({
      type: 'approveGate',
      payload: { stage: gate.stage },
    });
  };

  const handleReject = () => {
    if (showFeedback && feedback.trim()) {
      vscode.postMessage({
        type: 'rejectGate',
        payload: { stage: gate.stage, feedback: feedback.trim() },
      });
      setFeedback('');
      setShowFeedback(false);
    } else {
      setShowFeedback(true);
    }
  };

  const handleRequestDiff = () => {
    vscode.postMessage({
      type: 'requestDiff',
      payload: { agent: gate.fromAgent },
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        className="pixel-border"
        style={{
          background: '#111111',
          padding: 16,
          maxWidth: 320,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          borderColor: '#FFB300',
        }}
      >
        {/* Title */}
        <div
          className="pixel-text"
          style={{ fontSize: 12, color: '#FFB300', textAlign: 'center' }}
        >
          {'\uD83D\uDC51'} QUEEN&apos;S GATE
        </div>

        {/* From -> To */}
        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <div
            className="pixel-text"
            style={{
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            }}
          >
            <span style={{ color: '#4fc3f7' }}>
              {AGENT_ACTION[gate.fromAgent] ?? gate.fromAgent}
            </span>
            <span style={{ color: '#FFA000' }}>{'\u2192'}</span>
            <span style={{ color: '#66bb6a' }}>
              {AGENT_ACTION[gate.toAgent] ?? gate.toAgent}
            </span>
          </div>
          <div
            className="pixel-text"
            style={{ fontSize: 9, color: '#888' }}
          >
            {STAGE_LABEL[gate.stage]}
          </div>
        </div>

        {/* Stats */}
        <div
          className="pixel-border-inset"
          style={{
            background: '#0a0a14',
            padding: 8,
            display: 'flex',
            justifyContent: 'space-around',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              className="pixel-text"
              style={{ fontSize: 14, color: '#fff' }}
            >
              {gate.filesChanged}
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 8, color: '#888' }}
            >
              CELLS
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              className="pixel-text"
              style={{ fontSize: 14, color: '#66bb6a' }}
            >
              +{gate.linesAdded}
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 8, color: '#888' }}
            >
              ADDED
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              className="pixel-text"
              style={{ fontSize: 14, color: '#ef5350' }}
            >
              -{gate.linesRemoved}
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 8, color: '#888' }}
            >
              REMOVED
            </div>
          </div>
        </div>

        {/* Feedback textarea */}
        {showFeedback && (
          <div className="anim-fade-in">
            <label
              className="pixel-text"
              style={{
              fontSize: 9,
              color: '#aaa',
              display: 'block',
              marginBottom: 4,
              }}
            >
              PHEROMONE FEEDBACK
            </label>
            <textarea
              className="pixel-input"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe changes needed..."
              rows={3}
              autoFocus
            />
          </div>
        )}

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button className="pixel-btn" onClick={handleRequestDiff}>
            VIEW DIFF
          </button>
          <button
            className="pixel-btn pixel-btn-danger"
            onClick={handleReject}
          >
            {showFeedback ? 'SEND' : 'REVISE'}
          </button>
          <button
            className="pixel-btn pixel-btn-primary"
            onClick={handleApprove}
          >
            APPROVE
          </button>
        </div>
      </div>
    </div>
  );
}
