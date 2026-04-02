import type { CSSProperties } from 'react';

interface ConveyorBeltProps {
  active: boolean;
  direction?: 'down' | 'right';
  length?: number;
}

export function ConveyorBelt({
  active,
  direction = 'down',
  length = 40,
}: ConveyorBeltProps) {
  const isVertical = direction === 'down';

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: isVertical ? 24 : length,
    height: isVertical ? length : 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: active ? 1 : 0.3,
    flexShrink: 0,
  };

  const leftTrack: CSSProperties = isVertical
    ? { position: 'absolute', left: 7, top: 0, width: 2, height: '100%', background: '#555' }
    : { position: 'absolute', top: 7, left: 0, height: 2, width: '100%', background: '#555' };

  const rightTrack: CSSProperties = isVertical
    ? { position: 'absolute', right: 7, top: 0, width: 2, height: '100%', background: '#555' }
    : { position: 'absolute', bottom: 7, left: 0, height: 2, width: '100%', background: '#555' };

  const arrowColor = active ? '#ffd54f' : '#555';

  const arrowStyle: CSSProperties = isVertical
    ? {
        position: 'absolute',
        bottom: -2,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: `6px solid ${arrowColor}`,
      }
    : {
        position: 'absolute',
        right: -2,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderLeft: `6px solid ${arrowColor}`,
      };

  const animName = isVertical ? 'conveyorMove' : 'conveyorMoveH';
  const items = active ? [0, 1] : [];

  return (
    <div style={containerStyle}>
      <div style={leftTrack} />
      <div style={rightTrack} />

      {items.map((i) => {
        const pos: CSSProperties = isVertical
          ? { left: '50%', transform: 'translateX(-50%)', top: `${20 + i * 40}%` }
          : { top: '50%', transform: 'translateY(-50%)', left: `${20 + i * 40}%` };

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 6,
              height: 8,
              background: '#ffd54f',
              border: '1px solid #f57f17',
              imageRendering: 'pixelated',
              animation: `${animName} 1.2s linear infinite`,
              animationDelay: `${i * 0.6}s`,
              ...pos,
            }}
          />
        );
      })}

      <div style={arrowStyle} />
    </div>
  );
}
