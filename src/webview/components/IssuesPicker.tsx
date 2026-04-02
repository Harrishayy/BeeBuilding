import { useState, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';

interface GitHubIssueItem {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  createdAt: string;
  author: string;
}

interface IssuesPickerProps {
  onImport: (title: string, body: string) => void;
}

export function IssuesPicker({ onImport }: IssuesPickerProps) {
  const vscode = useVSCode();
  const issues = usePipelineStore((s) => s.githubIssues);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    vscode.postMessage({ type: 'fetchIssues', payload: {} });
  }, [vscode]);

  const filtered = issues.filter(
    (issue: GitHubIssueItem) =>
      issue.title.toLowerCase().includes(filter.toLowerCase()) ||
      String(issue.number).includes(filter),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        className="pixel-input"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search issues..."
      />

      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 ? (
          <div className="pixel-text" style={{ fontSize: 6, color: '#666', textAlign: 'center', padding: 16 }}>
            {issues.length === 0 ? 'LOADING ISSUES...' : 'NO MATCHING ISSUES'}
          </div>
        ) : (
          filtered.map((issue: GitHubIssueItem) => (
            <button
              key={issue.number}
              className="pixel-btn"
              onClick={() => onImport(issue.title, issue.body)}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="pixel-text" style={{ fontSize: 6, color: '#ffd54f' }}>
                  #{issue.number}
                </span>
                <span className="pixel-text" style={{ fontSize: 6, flex: 1 }}>
                  {issue.title}
                </span>
              </div>
              {issue.labels.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {issue.labels.map((label) => (
                    <span
                      key={label}
                      className="pixel-text"
                      style={{ fontSize: 5, color: '#888', background: '#333', padding: '1px 4px' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
