import { useState, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';

function SectionHeader({ title, tag, tagColor }: { title: string; tag?: string; tagColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <div className="pixel-text" style={{ fontSize: 11, color: '#ffd54f' }}>
        {title}
      </div>
      {tag && (
        <span
          className="pixel-text"
          style={{
            fontSize: 8,
            color: tagColor ?? '#888',
            background: tagColor === '#f44336' ? '#3a1a1a' : '#2a2a3e',
            padding: '1px 5px',
            borderRadius: 2,
          }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: active ? '#4caf50' : '#f44336',
        }}
      />
      <span className="pixel-text" style={{ fontSize: 9, color: '#aaa' }}>
        {label}
      </span>
    </div>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '6px 10px',
        background: '#1a1a2e',
        borderLeft: '3px solid #4fc3f7',
        marginBottom: 10,
      }}
    >
      <span className="pixel-text" style={{ fontSize: 8, color: '#81d4fa', lineHeight: 1.7 }}>
        {children}
      </span>
    </div>
  );
}

export function SettingsView() {
  const vscode = useVSCode();
  const settings = usePipelineStore((s) => s.settings);
  const previousPhase = usePipelineStore((s) => s.previousPhase);
  const closeSettings = usePipelineStore((s) => s.closeSettings);
  const addToast = usePipelineStore((s) => s.addToast);

  const [apiKey, setApiKey] = useState('');
  const [githubPAT, setGithubPAT] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [newSkillPath, setNewSkillPath] = useState('');
  const [frameworkPath, setFrameworkPath] = useState('');

  useEffect(() => {
    vscode.postMessage({ type: 'requestSettings' });
  }, [vscode]);

  useEffect(() => {
    setFrameworkPath(settings.agentFrameworkPath);
  }, [settings.agentFrameworkPath]);

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

  const handleAddSkillPath = () => {
    const trimmed = newSkillPath.trim();
    if (!trimmed) {
      addToast('Enter a directory path', 'warning');
      return;
    }
    if (settings.skillsPaths.includes(trimmed)) {
      addToast('This path is already added', 'warning');
      return;
    }
    vscode.postMessage({ type: 'addSkillsPath', payload: { path: trimmed } });
    setNewSkillPath('');
    addToast('Skills path added', 'success');
  };

  const handleRemoveSkillPath = (path: string) => {
    vscode.postMessage({ type: 'removeSkillsPath', payload: { path } });
    addToast('Skills path removed', 'info');
  };

  const handleSaveFrameworkPath = () => {
    const trimmed = frameworkPath.trim();
    if (!trimmed) {
      addToast('Enter a framework directory path', 'warning');
      return;
    }
    vscode.postMessage({ type: 'saveAgentFrameworkPath', payload: { path: trimmed } });
    addToast('Agent framework path saved', 'success');
  };

  const handleClearFrameworkPath = () => {
    vscode.postMessage({ type: 'clearAgentFrameworkPath' });
    setFrameworkPath('');
    addToast('Agent framework path cleared', 'info');
  };

  const handleContinue = () => {
    if (!settings.hasApiKey) {
      addToast('Anthropic API key is required before you can continue', 'error', 5000);
      return;
    }
    closeSettings();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        maxWidth: 520,
        margin: '0 auto',
        width: '100%',
        overflowY: 'auto',
        maxHeight: '100vh',
      }}
    >
      <div
        className="pixel-text"
        style={{ fontSize: 16, textAlign: 'center', color: '#ffd54f', marginBottom: 4 }}
      >
        SETTINGS
      </div>
      <div
        className="pixel-text"
        style={{ fontSize: 8, textAlign: 'center', color: '#888', marginTop: -8, marginBottom: 4 }}
      >
        Configure keys, skills, and hive frameworks
      </div>

      {/* ── 1. Anthropic API Key ── */}
      <div
        className="pixel-border"
        style={{ padding: 12, borderColor: settings.hasApiKey ? undefined : '#f44336' }}
      >
        <SectionHeader title="ANTHROPIC API KEY" tag="REQUIRED" tagColor="#f44336" />

        {!settings.hasApiKey && (
          <div
            style={{
              padding: '6px 10px',
              background: '#3a2e1a',
              borderLeft: '3px solid #ffd54f',
              marginBottom: 10,
            }}
          >
            <span className="pixel-text" style={{ fontSize: 8, color: '#ffd54f', lineHeight: 1.7 }}>
              You need an Anthropic API key to power the BeeBuilding hive.{' '}
              Get one at console.anthropic.com{' \u2192 '}API Keys.
            </span>
          </div>
        )}

        <StatusDot
          active={settings.hasApiKey}
          label={settings.hasApiKey ? 'CONFIGURED' : 'NOT CONFIGURED'}
        />

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
            <button
              className="pixel-btn pixel-btn-primary"
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim()}
            >
              SAVE
            </button>
          </div>
        ) : (
          <button className="pixel-btn" onClick={handleRemoveApiKey} style={{ color: '#f44336' }}>
            REMOVE KEY
          </button>
        )}
      </div>

      {/* ── 2. Default Model ── */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <SectionHeader title="DEFAULT MODEL" />
        <HelpText>
          Opus powers Scout &amp; Guard Bees. Sonnet is faster for Worker &amp; Tester Bees.
        </HelpText>
        <select
          className="pixel-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (fast)</option>
          <option value="claude-opus-4-6">Claude Opus 4.6 (powerful)</option>
        </select>
      </div>

      {/* ── 3. Skills Repositories ── */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <SectionHeader title="SKILLS REPOSITORIES" tag="OPTIONAL" />
        <HelpText>
          Add directories that contain agent skill definitions (SKILL.md files).
          Skills teach bees specialized capabilities — e.g. testing frameworks,
          deployment patterns, or domain knowledge. Each path should point to a
          folder with one or more SKILL.md files.
        </HelpText>

        {settings.skillsPaths.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {settings.skillsPaths.map((p) => (
              <div
                key={p}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  background: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: 2,
                }}
              >
                <span style={{ fontSize: 11, flexShrink: 0 }}>{'\uD83D\uDCC1'}</span>
                <span
                  className="pixel-text"
                  style={{
                    fontSize: 8,
                    color: '#81d4fa',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={p}
                >
                  {p}
                </span>
                <button
                  className="pixel-btn"
                  style={{ padding: '2px 6px', fontSize: 8, color: '#f44336' }}
                  onClick={() => handleRemoveSkillPath(p)}
                >
                  {'\u2716'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="pixel-input"
            value={newSkillPath}
            onChange={(e) => setNewSkillPath(e.target.value)}
            placeholder="/path/to/skills-directory"
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSkillPath(); }}
          />
          <button
            className="pixel-btn pixel-btn-primary"
            onClick={handleAddSkillPath}
            disabled={!newSkillPath.trim()}
          >
            ADD
          </button>
        </div>

        <div
          className="pixel-text"
          style={{ fontSize: 7, color: '#666', marginTop: 6, lineHeight: 1.6 }}
        >
          Example: ~/.cursor/skills or ./my-project/skills
        </div>
      </div>

      {/* ── 4. Multi-Agent Framework ── */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <SectionHeader title="HIVE FRAMEWORK" tag="OPTIONAL" />
        <HelpText>
          Point to a directory containing a multi-agent orchestration framework
          (e.g. Ruflo, CrewAI, AutoGen, LangGraph). BeeBuilding reads the
          framework&apos;s config to understand bee roles, swarm topology,
          pheromone handoff rules, and shared memory — so your swarm flow
          inherits the architecture automatically.
        </HelpText>

        {settings.agentFrameworkPath ? (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: '#1a3a1a',
                border: '2px solid #4caf50',
                borderRadius: 2,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12 }}>{'\uD83E\uDDF0'}</span>
              <span
                className="pixel-text"
                style={{ fontSize: 8, color: '#81c784', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={settings.agentFrameworkPath}
              >
                {settings.agentFrameworkPath}
              </span>
            </div>
            <button className="pixel-btn" onClick={handleClearFrameworkPath} style={{ color: '#f44336', fontSize: 9 }}>
              REMOVE FRAMEWORK
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="pixel-input"
                value={frameworkPath}
                onChange={(e) => setFrameworkPath(e.target.value)}
                placeholder="/path/to/ruflo or /path/to/crewai-config"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFrameworkPath(); }}
              />
              <button
                className="pixel-btn pixel-btn-primary"
                onClick={handleSaveFrameworkPath}
                disabled={!frameworkPath.trim()}
              >
                SAVE
              </button>
            </div>
            <div
              className="pixel-text"
              style={{ fontSize: 7, color: '#666', marginTop: 6, lineHeight: 1.6 }}
            >
              Supported: Ruflo (@claude-flow), CrewAI, AutoGen, LangGraph, or custom AGENTS.md
            </div>
          </>
        )}
      </div>

      {/* ── 5. GitHub PAT ── */}
      <div className="pixel-border" style={{ padding: 12 }}>
        <SectionHeader title="GITHUB PAT" tag="OPTIONAL" />
        <HelpText>
          A GitHub Personal Access Token lets you import issues directly from
          your repo as tasks. Create one at github.com{' \u2192 '}Settings{' \u2192 '}
          Developer settings{' \u2192 '}Fine-grained tokens.
        </HelpText>

        <StatusDot
          active={settings.hasGitHubPAT}
          label={settings.hasGitHubPAT ? 'CONFIGURED' : 'NOT SET'}
        />

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
          <button
            className="pixel-btn pixel-btn-primary"
            onClick={handleSaveGitHubPAT}
            disabled={!githubPAT.trim()}
          >
            SAVE
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, paddingBottom: 24 }}>
        {previousPhase && (
          <button
            className="pixel-btn"
            onClick={closeSettings}
            style={{ padding: '4px 12px' }}
          >
            {'\u25C0'} BACK
          </button>
        )}
        <button
          className="pixel-btn pixel-btn-primary"
          onClick={handleContinue}
        >
          {'\u25B6'} CONTINUE
        </button>
      </div>
    </div>
  );
}
