/** Formata quantidades de item (espeto, bandeja, unidade) como fração: 0,5 → "1/2", 1,5 → "1 1/2". */
export function formatQtd(n: number): string {
  const sinal = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const inteiro = Math.floor(abs + 1e-9);
  const fracao = abs - inteiro;
  if (fracao < 1e-6) return `${sinal}${inteiro}`;
  if (Math.abs(fracao - 0.5) < 1e-6) return inteiro === 0 ? `${sinal}1/2` : `${sinal}${inteiro} 1/2`;
  return `${sinal}${abs}`.replace('.', ',');
}
