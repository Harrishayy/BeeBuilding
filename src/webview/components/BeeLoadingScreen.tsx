import { useMemo } from 'react';

type PixelGrid = (string | null)[][];

const BEE_YELLOW = '#ffd54f';
const BEE_BLACK = '#1a1a1a';
const BEE_WING = 'rgba(200, 230, 255, 0.7)';
const BEE_EYE = '#ffffff';

function buildBeeSprite(): PixelGrid {
  const Y = BEE_YELLOW;
  const B = BEE_BLACK;
  const W = BEE_WING;
  const E = BEE_EYE;
  const _ = null;

  return [
    [_, _, _, W, W, _, _, _, _, _, W, W, _, _],
    [_, _, W, W, W, W, _, _, _, W, W, W, W, _],
    [_, _, W, W, W, W, _, _, _, W, W, W, W, _],
    [_, _, _, W, W, _, _, _, _, _, W, W, _, _],
    [_, _, _, _, B, B, B, B, B, B, _, _, _, _],
    [_, _, _, B, Y, Y, Y, Y, Y, Y, B, _, _, _],
    [_, _, B, Y, Y, E, Y, Y, E, Y, Y, B, _, _],
    [_, _, B, B, B, B, B, B, B, B, B, B, _, _],
    [_, _, B, Y, Y, Y, Y, Y, Y, Y, Y, B, _, _],
    [_, _, B, B, B, B, B, B, B, B, B, B, _, _],
    [_, _, B, Y, Y, Y, Y, Y, Y, Y, Y, B, _, _],
    [_, _, _, B, B, B, B, B, B, B, B, _, _, _],
    [_, _, _, _, _, B, _, _, B, _, _, _, _, _],
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

function buildTreeSprite(trunkColor: string, leafColor: string, leafLight: string): PixelGrid {
  const T = trunkColor;
  const L = leafColor;
  const H = leafLight;
  const _ = null;

  return [
    [_, _, _, _, H, H, _, _, _, _],
    [_, _, _, H, L, L, H, _, _, _],
    [_, _, H, L, L, L, L, H, _, _],
    [_, H, L, L, H, L, L, L, H, _],
    [H, L, L, L, L, L, L, L, L, H],
    [_, H, L, L, L, L, L, L, H, _],
    [_, _, H, L, L, L, L, H, _, _],
    [_, _, _, H, L, L, H, _, _, _],
    [_, _, _, _, T, T, _, _, _, _],
    [_, _, _, _, T, T, _, _, _, _],
    [_, _, _, _, T, T, _, _, _, _],
    [_, _, _, T, T, T, T, _, _, _],
  ];
}

interface TreeData {
  x: number;
  trunk: string;
  leaf: string;
  leafLight: string;
  scale: number;
  bottom: number;
}

const TREES: TreeData[] = [
  { x: 5, trunk: '#4a3728', leaf: '#2d5a27', leafLight: '#3d7a37', scale: 4, bottom: 48 },
  { x: 20, trunk: '#5a4030', leaf: '#1d4a17', leafLight: '#2d6a27', scale: 3, bottom: 52 },
  { x: 38, trunk: '#4a3728', leaf: '#2d6a2f', leafLight: '#4d8a47', scale: 5, bottom: 44 },
  { x: 55, trunk: '#5a4030', leaf: '#1d5a20', leafLight: '#3d7a37', scale: 3, bottom: 50 },
  { x: 72, trunk: '#4a3728', leaf: '#2d5a27', leafLight: '#3d7a37', scale: 4, bottom: 46 },
  { x: 88, trunk: '#5a4030', leaf: '#1d4a17', leafLight: '#2d6a27', scale: 3, bottom: 54 },
];

function TreePixel({ tree }: { tree: TreeData }) {
  const grid = useMemo(
    () => buildTreeSprite(tree.trunk, tree.leaf, tree.leafLight),
    [tree.trunk, tree.leaf, tree.leafLight],
  );
  const shadow = useMemo(() => spriteToBoxShadow(grid, tree.scale), [grid, tree.scale]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${tree.x}%`,
        bottom: tree.bottom,
        width: tree.scale,
        height: tree.scale,
        boxShadow: shadow,
        imageRendering: 'pixelated',
        zIndex: 1,
      }}
    />
  );
}

export function BeeLoadingScreen() {
  const beeBoxShadow = useMemo(() => spriteToBoxShadow(buildBeeSprite(), 3), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        imageRendering: 'pixelated',
        overflow: 'hidden',
      }}
    >
      {/* Sky gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #0a0e27 0%, #1a2a5e 30%, #2a4a7e 55%, #4a7aae 75%, #6aaa5e 85%, #3d7a37 90%, #2d5a27 100%)',
          zIndex: 0,
        }}
      />

      {/* Stars */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {[
          { x: 10, y: 8, s: 2 }, { x: 25, y: 5, s: 3 }, { x: 40, y: 12, s: 2 },
          { x: 55, y: 3, s: 2 }, { x: 70, y: 15, s: 3 }, { x: 85, y: 7, s: 2 },
          { x: 15, y: 20, s: 2 }, { x: 60, y: 22, s: 2 }, { x: 80, y: 18, s: 3 },
          { x: 35, y: 6, s: 2 }, { x: 92, y: 10, s: 2 },
        ].map((star, i) => (
          <div
            key={i}
            className="anim-blink"
            style={{
              position: 'absolute',
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.s,
              height: star.s,
              background: '#ffffff',
              animationDelay: `${i * 0.3}s`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Trees */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%', zIndex: 1 }}>
        {TREES.map((tree, i) => (
          <TreePixel key={i} tree={tree} />
        ))}
      </div>

      {/* Grass ground */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 40,
          zIndex: 2,
          background: 'linear-gradient(180deg, #4a8a3e 0%, #3d7a37 30%, #2d5a27 60%, #1d4a17 100%)',
          borderTop: '3px solid #5a9a4e',
        }}
      />

      {/* Dirt layer */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 16,
          zIndex: 2,
          background: '#4a3728',
          borderTop: '2px solid #5a4030',
        }}
      />

      {/* Animated Bee */}
      <div
        className="bee-fly-animation"
        style={{
          position: 'absolute',
          zIndex: 10,
          top: '38%',
          width: 3,
          height: 3,
          boxShadow: beeBoxShadow,
          imageRendering: 'pixelated',
        }}
      />

      {/* Loading text */}
      <div
        style={{
          position: 'relative',
          zIndex: 20,
          marginTop: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          className="pixel-text"
          style={{
            fontSize: 14,
            color: '#FFB300',
            textShadow: '2px 2px 0 #111111, -1px -1px 0 #111111',
            letterSpacing: 3,
          }}
        >
          BEES LOADING
          <span className="anim-blink" style={{ marginLeft: 2 }}>...</span>
        </span>

        {/* Decorative honeycomb dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="anim-pulse"
              style={{
                width: 6,
                height: 6,
                background: '#FFB300',
                borderRadius: '50%',
                boxShadow: '0 0 4px #FFB30060',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
