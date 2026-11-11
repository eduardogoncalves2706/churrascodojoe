import type { Config } from 'tailwindcss';
import { MARCA } from '@joe/shared';

// Mesma fonte de cor/fonte do apps/web (packages/shared/src/marca.ts) — troca de cliente (white
// label) = editar só aquele arquivo, não aqui.
export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: { ...MARCA.cores },
      fontFamily: { ...MARCA.fontes },
      backgroundImage: { brasa: `linear-gradient(135deg, ${MARCA.cores.bg} 0%, ${MARCA.cores.surface} 45%, ${MARCA.cores.primary} 80%, ${MARCA.cores['primary-hover']} 100%)` },
    },
  },
  plugins: [],
} satisfies Config;
