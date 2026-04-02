import type { AgentStatus } from '../../shared/types';

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#757575',
  working: '#ffee58',
  done: '#66bb6a',
  blocked: '#ef5350',
  error: '#ef5350',
};

const STATUS_ANIM: Partial<Record<AgentStatus, string>> = {
  working: 'anim-pulse',
  error: 'anim-flash',
};

interface StatusBadgeProps {
  status: AgentStatus;
  size?: number;
}

export function StatusBadge({ status, size = 8 }: StatusBadgeProps) {
  const color = STATUS_COLORS[status];
  const animClass = STATUS_ANIM[status] ?? '';

  return (
    <span
      className={animClass}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: color,
        color: color,
        boxShadow: `0 0 ${Math.floor(size / 2)}px ${color}`,
        imageRendering: 'pixelated',
      }}
      title={status}
    />
  );
}
