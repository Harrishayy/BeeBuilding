import { useState } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import { IssuesPicker } from './IssuesPicker';

export function TaskCreationView() {
  const vscode = useVSCode();
  const settings = usePipelineStore((s) => s.settings);
  const addToast = usePipelineStore((s) => s.addToast);
  const setPhase = usePipelineStore((s) => s.setPhase);
  const startTransitionLoading = usePipelineStore((s) => s.startTransitionLoading);
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [tab, setTab] = useState<'manual' | 'github'>('manual');

  const handleStartPlanning = () => {
    if (!settings.hasApiKey) {
      addToast('Set up your Anthropic API key in Settings first', 'warning', 5000);
      setPhase('settings');
      return;
    }
    if (!description.trim()) {
      addToast('Enter a nectar run description to dispatch the Scout Bee', 'warning');
      return;
    }
    startTransitionLoading();
    vscode.postMessage({
      type: 'startPlanning',
      payload: { description: description.trim(), context: context.trim() || undefined },
    });
  };

  const handleImportIssue = (title: string, body: string) => {
    setDescription(`${title}\n\n${body}`);
    setTab('manual');
    addToast('Issue imported! Edit and launch your nectar run.', 'info');
  };

  return (
    <div
      className="pixel-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        className="pixel-text"
        style={{ fontSize: 16, textAlign: 'center', color: '#FFB300', marginBottom: 4 }}
      >
        {'\uD83C\uDF3B'} NEW NECTAR RUN
      </div>

      {/* API key warning */}
      {!settings.hasApiKey && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: '#3a2e1a',
            border: '2px solid #FFB300',
            borderRadius: 2,
            cursor: 'pointer',
          }}
          onClick={() => setPhase('settings')}
        >
          <span style={{ fontSize: 16 }}>{'\u26A0'}</span>
          <span className="pixel-text" style={{ fontSize: 9, color: '#FFB300' }}>
            API key required — click here to configure in Settings
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className={`pixel-btn ${tab === 'manual' ? 'pixel-btn-primary' : ''}`}
          onClick={() => setTab('manual')}
          style={{ flex: 1, fontSize: 10 }}
        >
          MANUAL
        </button>
        {settings.hasGitHubPAT && (
          <button
            className={`pixel-btn ${tab === 'github' ? 'pixel-btn-primary' : ''}`}
            onClick={() => setTab('github')}
            style={{ flex: 1, fontSize: 10 }}
          >
            GITHUB ISSUE
          </button>
        )}
      </div>

      {tab === 'manual' ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="pixel-text" style={{ fontSize: 9, color: '#aaa' }}>
              NECTAR RUN DESCRIPTION
            </label>
            <textarea
              className="pixel-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the swarm should build..."
              rows={6}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="pixel-text" style={{ fontSize: 9, color: '#aaa' }}>
              ADDITIONAL CONTEXT (OPTIONAL)
            </label>
            <textarea
              className="pixel-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Relevant files, constraints, patterns..."
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <button
            className="pixel-btn pixel-btn-primary"
            onClick={handleStartPlanning}
            disabled={!description.trim()}
            style={{ alignSelf: 'center', marginTop: 8 }}
          >
            {'\uD83D\uDC1D'} DISPATCH SCOUT BEE
          </button>
        </>
      ) : (
        <IssuesPicker onImport={handleImportIssue} />
      )}
    </div>
  );
}
