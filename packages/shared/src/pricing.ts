import { toCents } from './money';

export interface FichaLinha { quantidadeInsumo: number; custoInsumoCents: number }

/** Custo do produto = Σ(quantidade_insumo × custo do insumo). Retorna null sem ficha. */
export function custoProdutoCents(ficha: FichaLinha[]): number | null {
  if (ficha.length === 0) return null;
  return Math.round(ficha.reduce((s, l) => s + l.quantidadeInsumo * l.custoInsumoCents, 0));
}

export function margem(precoCents: number, custoCents: number | null) {
  if (custoCents == null) return { margemCents: null, margemPct: null };
  const margemCents = precoCents - custoCents;
  return { margemCents, margemPct: precoCents > 0 ? (margemCents / precoCents) * 100 : null };
}

export interface ComboItemCusto { quantidade: number; custoUnitCents: number | null; ehCarneEscolhida: boolean }

/** Custo de uma variante: itens fixos + carne escolhida × quantidade. */
export function custoComboCents(itens: ComboItemCusto[], custoCarneCents: number | null): number | null {
  let total = 0;
  for (const i of itens) {
    const unit = i.ehCarneEscolhida ? custoCarneCents : i.custoUnitCents;
    if (unit == null) return null;
    total += i.quantidade * unit;
  }
  return Math.round(total);
}

export { toCents };
