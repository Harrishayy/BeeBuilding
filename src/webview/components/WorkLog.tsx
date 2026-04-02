import { useEffect, useRef } from 'react';

interface WorkLogProps {
  chunks: string[];
}

export function WorkLog({ chunks }: WorkLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chunks.length]);

  return (
    <div
      ref={containerRef}
      className="pixel-border-inset"
      style={{
        background: '#0a0a14',
        padding: 8,
        fontFamily: 'var(--font-pixel)',
        fontSize: 9,
        lineHeight: 1.8,
        color: '#66bb6a',
        maxHeight: 300,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {chunks.length === 0 && (
        <span style={{ color: '#555' }}>Waiting for output...</span>
      )}

      {chunks.map((chunk, i) => {
        const isToolCall = chunk.startsWith('[tool:') || chunk.startsWith('> ');
        return (
          <div
            key={i}
            className="anim-fade-in"
            style={{
              color: isToolCall ? '#ffa726' : '#66bb6a',
              marginBottom: 2,
            }}
          >
            {chunk}
          </div>
        );
      })}

      <span className="anim-blink" style={{ color: '#66bb6a' }}>
        _
      </span>
    </div>
  );
}
