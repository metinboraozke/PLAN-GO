/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './frontend/**/*.{html,js}',
  ],
  safelist: [
    // Explicit arbitrary z-index values used in modals/overlays
    'z-[400]', 'z-[480]', 'z-[490]', 'z-[500]',
    'z-[600]', 'z-[620]', 'z-[640]', 'z-[650]', 'z-[660]', 'z-[700]',
    'z-[9999]', 'z-[10000]',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
        accent: {
          orange: '#F97316',
          purple: '#8B5CF6',
          blue:   '#3B82F6',
          green:  '#10B981',
          pink:   '#EC4899',
        },
        sage:  '#9CAF88',
        cream: '#FDFCF8',
        main:  '#1a1a1a',
        muted: '#9ca3af',
      },
      fontFamily: {
        sans:  ['"Plus Jakarta Sans"', 'sans-serif'],
        serif: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
