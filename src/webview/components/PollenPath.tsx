import type { CSSProperties } from 'react';

interface PollenPathProps {
  active: boolean;
  direction?: 'down' | 'right';
  length?: number;
}

export function PollenPath({
  active,
  direction = 'down',
  length = 40,
}: PollenPathProps) {
  const isVertical = direction === 'down';

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: isVertical ? 28 : length,
    height: isVertical ? length : 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: active ? 1 : 0.3,
    flexShrink: 0,
  };

  const leftTrack: CSSProperties = isVertical
    ? { position: 'absolute', left: 6, top: 0, width: 3, height: '100%', background: '#FFA000', imageRendering: 'pixelated' }
    : { position: 'absolute', top: 6, left: 0, height: 3, width: '100%', background: '#FFA000', imageRendering: 'pixelated' };

  const rightTrack: CSSProperties = isVertical
    ? { position: 'absolute', right: 6, top: 0, width: 3, height: '100%', background: '#FFA000', imageRendering: 'pixelated' }
    : { position: 'absolute', bottom: 6, left: 0, height: 3, width: '100%', background: '#FFA000', imageRendering: 'pixelated' };

  const hexColor = active ? '#FFB300' : '#555';

  const arrowStyle: CSSProperties = isVertical
    ? {
        position: 'absolute',
        bottom: -2,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: `7px solid ${hexColor}`,
      }
    : {
        position: 'absolute',
        right: -2,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderLeft: `7px solid ${hexColor}`,
      };

  const animName = isVertical ? 'conveyorMove' : 'conveyorMoveH';
  const items = active ? [0, 1] : [];

  return (
    <div style={containerStyle}>
      <div style={leftTrack} />
      <div style={rightTrack} />

      {/* Pollen particles */}
      {items.map((i) => {
        const pos: CSSProperties = isVertical
          ? { left: '50%', transform: 'translateX(-50%)', top: `${20 + i * 40}%` }
          : { top: '50%', transform: 'translateY(-50%)', left: `${20 + i * 40}%` };

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              background: '#FFB300',
              border: '1px solid #FF8F00',
              borderRadius: '50%',
              imageRendering: 'pixelated',
              animation: `${animName} 1.2s linear infinite`,
              animationDelay: `${i * 0.6}s`,
              boxShadow: '0 0 4px #FFB30080',
              ...pos,
            }}
          />
        );
      })}

      <div style={arrowStyle} />
    </div>
  );
}
