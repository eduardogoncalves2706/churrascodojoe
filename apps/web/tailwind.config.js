/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D0A07', surface: '#2B1507', primary: '#D4420A', 'primary-hover': '#F07020', brasa: '#8B1A00',
        cream: '#F5EDD8', gold: '#C8A060', ok: '#3E9B5A',
      },
      fontFamily: { display: ['"Bebas Neue"', 'sans-serif'], sans: ['Barlow', 'sans-serif'], label: ['"Barlow Condensed"', 'sans-serif'], serif: ['"Playfair Display"', 'serif'] },
    },
  },
  plugins: [],
};
