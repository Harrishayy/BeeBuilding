import { useMemo } from 'react';
import type { AgentName, AgentStatus } from '../../shared/types';

type PixelGrid = (string | null)[][];

const SKIN = '#ffcc80';
const EYE = '#ffffff';
const MOUTH = '#a1887f';

interface AgentColors {
  hair: string;
  body: string;
  legs: string;
}

const AGENT_COLORS: Record<AgentName, AgentColors> = {
  planner: { hair: '#1565c0', body: '#42a5f5', legs: '#0d47a1' },
  coder: { hair: '#2e7d32', body: '#66bb6a', legs: '#1b5e20' },
  tester: { hair: '#6a1b9a', body: '#ab47bc', legs: '#4a148c' },
  reviewer: { hair: '#e65100', body: '#ffa726', legs: '#bf360c' },
  orchestrator: { hair: '#ffd700', body: '#ffd54f', legs: '#f57f17' },
};

function buildSprite(colors: AgentColors, isOrchestrator: boolean): PixelGrid {
  const { hair: H, body: B, legs: L } = colors;
  const S = SKIN;
  const E = EYE;
  const M = MOUTH;
  const _ = null;

  if (isOrchestrator) {
    return [
      [_, H, _, H, H, _, H, _],
      [_, H, H, H, H, H, H, _],
      [_, S, S, S, S, S, S, _],
      [_, S, E, S, S, E, S, _],
      [_, S, S, M, M, S, S, _],
      [_, _, S, S, S, S, _, _],
      [_, _, B, B, B, B, _, _],
      [_, B, B, B, B, B, B, _],
      [S, B, B, B, B, B, B, S],
      [_, _, B, B, B, B, _, _],
      [_, _, L, _, _, L, _, _],
      [_, L, L, _, _, L, L, _],
    ];
  }

  return [
    [_, _, H, H, H, H, _, _],
    [_, H, H, H, H, H, H, _],
    [_, S, S, S, S, S, S, _],
    [_, S, E, S, S, E, S, _],
    [_, S, S, M, M, S, S, _],
    [_, _, S, S, S, S, _, _],
    [_, _, B, B, B, B, _, _],
    [_, B, B, B, B, B, B, _],
    [S, B, B, B, B, B, B, S],
    [_, _, B, B, B, B, _, _],
    [_, _, L, _, _, L, _, _],
    [_, L, L, _, _, L, L, _],
  ];
}

function spriteToBoxShadow(grid: PixelGrid, px: number): string {
  const shadows: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const color = row[x];
      if (color) {
        shadows.push(`${x * px}px ${y * px}px 0 0 ${color}`);
      }
    }
  }
  return shadows.join(', ');
}

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
  const colors = AGENT_COLORS[agent];
  const isOrchestrator = agent === 'orchestrator';

  const boxShadow = useMemo(
    () => spriteToBoxShadow(buildSprite(colors, isOrchestrator), pixelSize),
    [colors, isOrchestrator, pixelSize],
  );

  const spriteWidth = 8 * pixelSize;
  const spriteHeight = 12 * pixelSize;
  const animClass = STATUS_ANIMATION[status];

  return (
    <div
      className={animClass}
      style={{
        width: spriteWidth,
        height: spriteHeight,
        position: 'relative',
        imageRendering: 'pixelated',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: pixelSize,
          height: pixelSize,
          boxShadow,
        }}
      />
    </div>
  );
}
