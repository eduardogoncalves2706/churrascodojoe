import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Site estático (Fase A da SPEC_landing_page.md): sem SSR, publicado em S3 + CloudFront.
export default defineConfig({
  site: 'https://www.churrascodojoe.com.br',
  output: 'static',
  integrations: [tailwind({ applyBaseStyles: false })],
});
