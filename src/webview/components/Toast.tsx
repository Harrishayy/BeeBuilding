import { useEffect } from 'react';
import { usePipelineStore } from '../state/pipelineStore';

export interface ToastData {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'success' | 'info';
  duration?: number;
}

const COLORS: Record<ToastData['type'], { bg: string; border: string; text: string }> = {
  error: { bg: '#3a1a1a', border: '#f44336', text: '#ff8a80' },
  warning: { bg: '#3a2e1a', border: '#ffd54f', text: '#ffd54f' },
  success: { bg: '#1a3a1a', border: '#4caf50', text: '#81c784' },
  info: { bg: '#1a2a3a', border: '#4fc3f7', text: '#81d4fa' },
};

const ICONS: Record<ToastData['type'], string> = {
  error: '\u2716',
  warning: '\u26A0',
  success: '\u2714',
  info: '\u2139',
};

function ToastItem({ toast }: { toast: ToastData }) {
  const removeToast = usePipelineStore((s) => s.removeToast);
  const colors = COLORS[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 2,
        animation: 'toast-in 0.2s ease-out',
        cursor: 'pointer',
        maxWidth: 360,
      }}
      onClick={() => removeToast(toast.id)}
    >
      <span style={{ fontSize: 16, color: colors.text, flexShrink: 0 }}>
        {ICONS[toast.type]}
      </span>
      <span className="pixel-text" style={{ fontSize: 10, color: colors.text, lineHeight: 1.5 }}>
        {toast.message}
      </span>
    </div>
  );
}

export function ToastContainer() {
  const toasts = usePipelineStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={t} />
          </div>
        ))}
      </div>
    </>
  );
}
