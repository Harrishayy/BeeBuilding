import type { AgentName, AgentStatus } from '../../shared/types';

interface BeeTheme {
  emoji: string;
  borderColor: string;
  glowColor: string;
  label: string;
}

const BEE_THEMES: Record<string, BeeTheme> = {
  queen_bee: {
    emoji: '\uD83D\uDC51\uD83D\uDC1D',
    borderColor: '#FFD700',
    glowColor: '#FFB300',
    label: 'QUEEN',
  },
  scout_bee: {
    emoji: '\uD83D\uDD0D\uD83D\uDC1D',
    borderColor: '#4FC3F7',
    glowColor: '#0288D1',
    label: 'SCOUT',
  },
  worker_bee: {
    emoji: '\uD83D\uDC77\uD83D\uDC1D',
    borderColor: '#FFA000',
    glowColor: '#FF8F00',
    label: 'WORKER',
  },
  tester_bee: {
    emoji: '\uD83E\uDDEA\uD83D\uDC1D',
    borderColor: '#66BB6A',
    glowColor: '#388E3C',
    label: 'TESTER',
  },
  guard_bee: {
    emoji: '\uD83D\uDEE1\uFE0F\uD83D\uDC1D',
    borderColor: '#EF5350',
    glowColor: '#C62828',
    label: 'GUARD',
  },
};

const DEFAULT_THEME: BeeTheme = {
  emoji: '\uD83D\uDC1D',
  borderColor: '#888',
  glowColor: '#555',
  label: 'BEE',
};

const STATUS_ANIMATION: Record<AgentStatus, string> = {
  idle: 'anim-bob',
  working: 'anim-typing',
  done: 'anim-celebrate',
  blocked: 'anim-flash',
  error: 'anim-shake',
};

interface AgentSpriteProps {
  agent: AgentName;
  status: AgentStatus;
  pixelSize?: number;
}

export function AgentSprite({ agent, status, pixelSize = 3 }: AgentSpriteProps) {
  const theme = BEE_THEMES[agent] ?? DEFAULT_THEME;
  const isQueen = agent === 'queen_bee';
  const animClass = STATUS_ANIMATION[status];

  const size = isQueen ? pixelSize * 14 : pixelSize * 10;

  return (
    <div
      className={animClass}
      style={{
        width: size,
        height: size,
        position: 'relative',
        imageRendering: 'pixelated',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Pixel border frame */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `${pixelSize}px solid ${theme.borderColor}`,
          boxShadow: `0 0 ${pixelSize * 3}px ${theme.glowColor}, inset 0 0 ${pixelSize * 2}px ${theme.glowColor}40`,
          background: `${theme.borderColor}10`,
          imageRendering: 'pixelated',
        }}
      />

      {/* Bee emoji */}
      <span
        style={{
          fontSize: isQueen ? pixelSize * 6 : pixelSize * 5,
          lineHeight: 1,
          position: 'relative',
          zIndex: 1,
          filter: status === 'working' ? 'none' : status === 'error' ? 'grayscale(0.5)' : 'none',
        }}
      >
        {theme.emoji}
      </span>

      {/* Working indicator */}
      {status === 'working' && (
        <div
          className="anim-pulse"
          style={{
            position: 'absolute',
            inset: -2,
            border: `1px solid ${theme.borderColor}`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
