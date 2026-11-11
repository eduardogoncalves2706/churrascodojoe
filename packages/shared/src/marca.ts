/**
 * Fonte única da identidade visual (cor, fonte) — usada pelo tailwind.config de apps/web E
 * apps/site (antes cada um tinha os mesmos hex duplicados) e por quem precisar no app em si.
 * Trocar de cliente (white label) = editar só este arquivo pra cor/fonte — nome do negócio em si
 * fica na config do banco (`negocio_nome`, ver tela Configurações → Identidade), não aqui, porque
 * esse aqui só existe em tempo de build (Tailwind não dá pra reconfigurar em runtime).
 */
export const MARCA = {
  cores: {
    bg: '#0D0A07', surface: '#2B1507', primary: '#D4420A', 'primary-hover': '#F07020',
    brasa: '#8B1A00', cream: '#F5EDD8', gold: '#C8A060', ok: '#3E9B5A',
  },
  fontes: {
    display: ['"Bebas Neue"', 'sans-serif'], sans: ['Barlow', 'sans-serif'],
    label: ['"Barlow Condensed"', 'sans-serif'], serif: ['"Playfair Display"', 'serif'],
  },
  googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&family=Playfair+Display:ital@1&display=swap',
};
