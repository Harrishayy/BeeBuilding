import { useState, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';

export function SettingsView() {
  const vscode = useVSCode();
  const settings = usePipelineStore((s) => s.settings);
  const setPhase = usePipelineStore((s) => s.setPhase);
  const addToast = usePipelineStore((s) => s.addToast);

  const [apiKey, setApiKey] = useState('');
  const [githubPAT, setGithubPAT] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');

  useEffect(() => {
    vscode.postMessage({ type: 'requestSettings' });
  }, [vscode]);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      addToast('Enter a valid API key', 'warning');
      return;
    }
    vscode.postMessage({ type: 'saveApiKey', payload: { apiKey: apiKey.trim() } });
    setApiKey('');
    addToast('API key saved successfully', 'success');
  };

  const handleRemoveApiKey = () => {
    vscode.postMessage({ type: 'removeApiKey' });
    addToast('API key removed', 'info');
  };

  const handleSaveGitHubPAT = () => {
    if (!githubPAT.trim()) {
      addToast('Enter a valid GitHub token', 'warning');
      return;
    }
    vscode.postMessage({ type: 'saveGitHubPAT', payload: { token: githubPAT.trim() } });
    setGithubPAT('');
    addToast('GitHub PAT saved', 'success');
  };

  const handleContinue = () => {
    if (!settings.hasApiKey) {
      addToast('Anthropic API key is required before you can continue', 'error');
      return;
    }
    setPhase('task');
  };

  return (
    <div
      className="pixel-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        maxWidth: 480,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        className="pixel-text"
        style={{ fontSize: 12, textAlign: 'center', color: '#ffd54f', marginBottom: 8 }}
      >
        SETTINGS
      </div>

      {/* Anthropic API Key — REQUIRED */}
      <div
        className="pixel-border"
        style={{
          padding: 12,
          borderColor: settings.hasApiKey ? undefined : '#f44336',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f' }}>
            ANTHROPIC API KEY
          </div>
          <span
            className="pixel-text"
            style={{
              fontSize: 5,
              color: '#f44336',
              background: '#3a1a1a',
              padding: '1px 5px',
              borderRadius: 2,
            }}
          >
            REQUIRED
          </span>
        </div>

        {!settings.hasApiKey && (
          <div
            style={{
              padding: '6px 10px',
              background: '#3a2e1a',
              borderLeft: '3px solid #ffd54f',
              marginBottom: 10,
            }}
          >
            <span className="pixel-text" style={{ fontSize: 5, color: '#ffd54f', lineHeight: 1.6 }}>
              You need an Anthropic API key to use BeeBuilder.
              Get one at console.anthropic.com
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: settings.hasApiKey ? '#4caf50' : '#f44336',
            }}
          />
          <span className="pixel-text" style={{ fontSize: 6, color: '#aaa' }}>
            {settings.hasApiKey ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </span>
        </div>
        {!settings.hasApiKey ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="pixel-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
            />
            <button className="pixel-btn pixel-btn-primary" onClick={handleSaveApiKey} disabled={!apiKey.trim()}>
              SAVE
            </button>
          </div>
        ) : (
          <button className="pixel-btn" onClick={handleRemoveApiKey} style={{ color: '#f44336' }}>
            REMOVE KEY
          </button>
        )}
      </div>

      {/* Model Selector */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', marginBottom: 8 }}>
          DEFAULT MODEL
        </div>
        <select
          className="pixel-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
          <option value="claude-opus-4-6">Claude Opus 4.6</option>
        </select>
      </div>

      {/* GitHub PAT — OPTIONAL */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div className="pixel-text" style={{ fontSize: 8, color: '#ffd54f' }}>
            GITHUB PAT
          </div>
          <span
            className="pixel-text"
            style={{
              fontSize: 5,
              color: '#888',
              background: '#2a2a3e',
              padding: '1px 5px',
              borderRadius: 2,
            }}
          >
            OPTIONAL
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: settings.hasGitHubPAT ? '#4caf50' : '#666',
            }}
          />
          <span className="pixel-text" style={{ fontSize: 6, color: '#aaa' }}>
            {settings.hasGitHubPAT ? 'CONFIGURED' : 'NOT SET'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="pixel-input"
            type="password"
            value={githubPAT}
            onChange={(e) => setGithubPAT(e.target.value)}
            placeholder="ghp_..."
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveGitHubPAT(); }}
          />
          <button className="pixel-btn pixel-btn-primary" onClick={handleSaveGitHubPAT} disabled={!githubPAT.trim()}>
            SAVE
          </button>
        </div>
      </div>

      <button
        className="pixel-btn pixel-btn-primary"
        onClick={handleContinue}
        style={{ alignSelf: 'center', marginTop: 8 }}
      >
        {'\u25B6'} CONTINUE
      </button>
    </div>
  );
}
