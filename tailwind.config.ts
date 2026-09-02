import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        grafito: '#1C2126',
        acero: '#2F6690',
        aceroClaro: '#EAF1F6',
        fondo: '#F5F6F4',
        ambar: '#E8A33D',
        verde: '#3F7D58',
        rojo: '#B54A4A',
        slate: '#5B6470',
        borde: '#DDE1E0',
      },
      fontFamily: {
        sans: ['var(--font-plex-sans)'],
        mono: ['var(--font-plex-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
