import { useState } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentName, PipelineStage } from '../../shared/types';

const AGENT_ACTION: Record<AgentName, string> = {
  planner: 'PLANNING',
  coder: 'CODING',
  tester: 'TESTING',
  reviewer: 'REVIEWING',
  orchestrator: 'MERGING',
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  idle: 'IDLE',
  planning: 'PLANNING',
  plan_approval: 'PLAN APPROVAL',
  coding: 'CODING',
  code_approval: 'CODE APPROVAL',
  testing: 'TESTING',
  test_approval: 'TEST APPROVAL',
  reviewing: 'REVIEWING',
  review_approval: 'REVIEW APPROVAL',
  merging: 'MERGING',
  done: 'DONE',
  failed: 'FAILED',
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
          background: '#16213e',
          padding: 16,
          maxWidth: 320,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Title */}
        <div
          className="pixel-text"
          style={{ fontSize: 9, color: '#ffd54f', textAlign: 'center' }}
        >
          GATE CHECK
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
              fontSize: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: '#4fc3f7' }}>
              {AGENT_ACTION[gate.fromAgent]}
            </span>
            <span style={{ color: '#888' }}>{'\u2192'}</span>
            <span style={{ color: '#66bb6a' }}>
              {AGENT_ACTION[gate.toAgent]}
            </span>
          </div>
          <div
            className="pixel-text"
            style={{ fontSize: 6, color: '#888' }}
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
              style={{ fontSize: 10, color: '#fff' }}
            >
              {gate.filesChanged}
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 5, color: '#888' }}
            >
              FILES
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              className="pixel-text"
              style={{ fontSize: 10, color: '#66bb6a' }}
            >
              +{gate.linesAdded}
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 5, color: '#888' }}
            >
              ADDED
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              className="pixel-text"
              style={{ fontSize: 10, color: '#ef5350' }}
            >
              -{gate.linesRemoved}
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 5, color: '#888' }}
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
                fontSize: 6,
                color: '#aaa',
                display: 'block',
                marginBottom: 4,
              }}
            >
              FEEDBACK
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
            {showFeedback ? 'SEND' : 'CHANGES'}
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
