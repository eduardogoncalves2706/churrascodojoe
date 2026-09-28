/** @type {import('tailwindcss').Config} */
// Mesmos tokens de apps/web/tailwind.config.js — identidade visual única do Churrasco do Joe.
export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D0A07', surface: '#2B1507', primary: '#D4420A', 'primary-hover': '#F07020',
        brasa: '#8B1A00', cream: '#F5EDD8', gold: '#C8A060', ok: '#3E9B5A',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'], sans: ['Barlow', 'sans-serif'],
        label: ['"Barlow Condensed"', 'sans-serif'], serif: ['"Playfair Display"', 'serif'],
      },
      backgroundImage: { brasa: 'linear-gradient(135deg, #0D0A07 0%, #2B1507 45%, #D4420A 80%, #F07020 100%)' },
    },
  },
  plugins: [],
};
