export const TZ = 'America/Sao_Paulo';

/** Data local (YYYY-MM-DD) em São Paulo — o "dia de operação". */
export function dataOperacaoLocal(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
