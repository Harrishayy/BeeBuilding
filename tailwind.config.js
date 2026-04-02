/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/webview/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      colors: {
        pixel: {
          green: '#00ff00',
          yellow: '#ffff00',
          red: '#ff0000',
          blue: '#0088ff',
          dark: '#1a1a2e',
          mid: '#16213e',
          light: '#0f3460',
          accent: '#e94560',
        },
      },
      animation: {
        'pixel-blink': 'pixelBlink 1s step-end infinite',
        'conveyor': 'conveyorMove 2s linear infinite',
        'typing': 'typing 0.8s step-end infinite alternate',
        'bounce-pixel': 'bouncePx 0.5s step-end infinite alternate',
      },
      keyframes: {
        pixelBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        conveyorMove: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-32px)' },
        },
        typing: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-2px)' },
        },
        bouncePx: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
};
