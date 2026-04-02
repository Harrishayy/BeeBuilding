import { useState } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';

export function PlanReviewView() {
  const vscode = useVSCode();
  const plan = usePipelineStore((s) => s.plan);
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!plan) {
    return (
      <div className="pixel-text" style={{ fontSize: 8, color: '#888', textAlign: 'center', padding: 32 }}>
        NO PLAN AVAILABLE
      </div>
    );
  }

  const handleApprove = () => {
    vscode.postMessage({ type: 'approvePlan' });
  };

  const handleRevise = () => {
    if (!feedback.trim()) return;
    vscode.postMessage({ type: 'revisePlan', payload: { feedback: feedback.trim() } });
    setFeedback('');
    setRevising(false);
  };

  const complexityColor =
    plan.complexity === 'high' ? '#f44336' : plan.complexity === 'medium' ? '#ffd54f' : '#4caf50';

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
      <div className="pixel-text" style={{ fontSize: 12, textAlign: 'center', color: '#ffd54f' }}>
        PLAN REVIEW
      </div>

      {/* Title & Summary */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <div className="pixel-text" style={{ fontSize: 9, color: '#fff', marginBottom: 6 }}>
          {plan.title}
        </div>
        <div className="pixel-text" style={{ fontSize: 6, color: '#ccc', whiteSpace: 'pre-wrap' }}>
          {plan.summary}
        </div>
      </div>

      {/* Requirements */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', marginBottom: 6 }}>
          REQUIREMENTS
        </div>
        {plan.requirements.map((req, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span className="pixel-text" style={{ fontSize: 6, color: '#4caf50' }}>{'\u2610'}</span>
            <span className="pixel-text" style={{ fontSize: 6 }}>{req}</span>
          </div>
        ))}
      </div>

      {/* File Changes */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', marginBottom: 6 }}>
          FILE CHANGES
        </div>
        {plan.fileChanges.map((fc, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span
              className="pixel-text"
              style={{
                fontSize: 5,
                color: fc.action === 'create' ? '#4caf50' : fc.action === 'delete' ? '#f44336' : '#ffd54f',
                minWidth: 36,
              }}
            >
              {fc.action.toUpperCase()}
            </span>
            <span className="pixel-text" style={{ fontSize: 6, color: '#aaa' }}>
              {fc.path}
            </span>
          </div>
        ))}
      </div>

      {/* Risks & Complexity */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="pixel-border" style={{ padding: 12, flex: 1 }}>
          <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', marginBottom: 6 }}>
            RISKS
          </div>
          {plan.risks.map((risk, i) => (
            <div key={i} className="pixel-text" style={{ fontSize: 6, color: '#f44336', marginBottom: 2 }}>
              {'\u26A0'} {risk}
            </div>
          ))}
        </div>
        <div className="pixel-border" style={{ padding: 12, minWidth: 80, textAlign: 'center' }}>
          <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', marginBottom: 6 }}>
            COMPLEXITY
          </div>
          <div className="pixel-text" style={{ fontSize: 10, color: complexityColor }}>
            {plan.complexity.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Actions */}
      {revising ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            className="pixel-input"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should be changed?"
            rows={3}
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="pixel-btn" onClick={() => setRevising(false)}>
              CANCEL
            </button>
            <button className="pixel-btn pixel-btn-primary" onClick={handleRevise} disabled={!feedback.trim()}>
              SUBMIT FEEDBACK
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="pixel-btn" onClick={() => setRevising(true)}>
            {'\u270E'} REVISE
          </button>
          <button className="pixel-btn pixel-btn-primary" onClick={handleApprove}>
            {'\u2714'} APPROVE PLAN
          </button>
        </div>
      )}
    </div>
  );
}
