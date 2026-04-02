import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[BeeBuilder ErrorBoundary]', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            padding: 16,
            background: '#0a0a14',
            border: '2px solid #ef5350',
            margin: 8,
            fontFamily: 'monospace',
            fontSize: 13,
            color: '#ef5350',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '100%',
            overflow: 'auto',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 15 }}>
            [BeeBuilder UI Error]
          </div>
          <div>{this.state.error?.message}</div>
          {this.state.error?.stack && (
            <div style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
              {this.state.error.stack}
            </div>
          )}
          {this.state.errorInfo?.componentStack && (
            <div style={{ color: '#666', marginTop: 8, fontSize: 12 }}>
              Component stack:{this.state.errorInfo.componentStack}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              marginTop: 12,
              padding: '6px 16px',
              background: '#ef5350',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
