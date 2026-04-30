/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace']
      },
      colors: {
        tw: {
          bg: '#0b1220',
          panel: '#111a2c',
          accent: '#fbbf24',
          danger: '#ef4444',
          ok: '#22c55e'
        }
      }
    }
  },
  plugins: []
};
