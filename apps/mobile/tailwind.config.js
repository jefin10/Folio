/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0b0b0b', 1: '#111111', 2: '#161616', 3: '#1d1d1d', 4: '#262626' },
        line: 'rgba(255,255,255,0.08)',
        chalk: { DEFAULT: '#f4f3ee', dim: '#c9c8c2' },
        mute: '#8b8a85',
        faint: '#5d5c58',
        mint: { DEFAULT: '#3ddc97', soft: '#7cf2c4', deep: '#146642' },
        gold: '#e8c27a',
        coral: '#ff6b57',
        sky: '#6aa8ff',
      },
      fontFamily: {
        display: ['Manrope_700Bold'],
        'display-bold': ['Manrope_800ExtraBold'],
        sans: ['Manrope_500Medium'],
        semibold: ['Manrope_600SemiBold'],
        bold: ['Manrope_700Bold'],
        extrabold: ['Manrope_800ExtraBold'],
        mono: ['SpaceMono_400Regular'],
      },
    },
  },
  plugins: [],
};
