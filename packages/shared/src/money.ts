/** Dinheiro sempre em centavos inteiros nos cálculos. */
export const toCents = (v: number | string): number => Math.round(Number(v) * 100);
export const fromCents = (c: number): string => (c / 100).toFixed(2);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (cents: number): string => brl.format(cents / 100).replace(/ /g, ' ');

/** Arredonda centavos para terminar em ,90 ou ,99 (para cima). */
export function arredondarPreco(cents: number, modo: 'nenhum' | '90' | '99'): number {
  if (modo === 'nenhum') return cents;
  const fim = modo === '90' ? 90 : 99;
  const reais = Math.floor(cents / 100);
  const cand = reais * 100 + fim;
  return cand >= cents ? cand : (reais + 1) * 100 + fim;
}

export const aplicarPercentual = (cents: number, pct: number): number => Math.round(cents * (1 + pct / 100));
