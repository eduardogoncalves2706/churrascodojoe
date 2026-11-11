import type { Config } from 'tailwindcss';
import { MARCA } from '@joe/shared';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { ...MARCA.cores }, fontFamily: { ...MARCA.fontes } } },
  plugins: [],
} satisfies Config;
