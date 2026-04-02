import { useState } from 'react';
import type { FormEvent } from 'react';
import { useVSCode } from '../hooks/useVSCode';

export function TaskSubmitForm() {
  const vscode = useVSCode();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    vscode.postMessage({
      type: 'submitTask',
      payload: {
        title: title.trim(),
        description: description.trim(),
        priority,
      },
    });

    setTitle('');
    setDescription('');
    setPriority('medium');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pixel-border pixel-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 400,
        width: '100%',
        margin: '0 auto',
      }}
    >
      <div
        className="pixel-text"
        style={{ fontSize: 14, textAlign: 'center', marginBottom: 8, color: '#ffd54f' }}
      >
        {'\uD83C\uDF3B'} NEW NECTAR RUN
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="pixel-text" style={{ fontSize: 9, color: '#aaa' }}>
          TITLE
        </label>
        <input
          className="pixel-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          required
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="pixel-text" style={{ fontSize: 9, color: '#aaa' }}>
          DESCRIPTION
        </label>
        <textarea
          className="pixel-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the task..."
          rows={4}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="pixel-text" style={{ fontSize: 9, color: '#aaa' }}>
          PRIORITY
        </label>
        <select
          className="pixel-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="low">LOW</option>
          <option value="medium">MEDIUM</option>
          <option value="high">HIGH</option>
          <option value="critical">CRITICAL</option>
        </select>
      </div>

      <button
        type="submit"
        className="pixel-btn pixel-btn-primary"
        disabled={!title.trim()}
        style={{ alignSelf: 'center', marginTop: 8 }}
      >
        {'\uD83D\uDC1D'} LAUNCH SWARM FLOW
      </button>
    </form>
  );
}
