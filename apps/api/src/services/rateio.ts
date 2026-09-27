import { toCents } from '@joe/shared';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schema as s } from '../db/client';

export type BaseRateio = 'pedido' | 'receita';

export interface Rateio {
  totalIndiretoCents: number; qtdPedidos: number; receitaCents: number;
  custoIndiretoPorPedidoCents: number; percentualIndireto: number; de: string; ate: string;
}

/**
 * Rateio de custos indiretos (carvão, embalagem, limpeza, gás — categorias com `rateavel=true`)
 * sobre os pedidos de um período. Ver SPEC_adendo_rateio_custos.md.
 * Padrão: últimos 30 dias de operação, só lançamentos realizados.
 */
export async function calcularRateio(db: Db, de: string, ate: string): Promise<Rateio> {
  const categoriasRateaveis = await db.select({ id: s.categoriasFinanceiras.id }).from(s.categoriasFinanceiras).where(eq(s.categoriasFinanceiras.rateavel, true));
  const idsCategorias = categoriasRateaveis.map((c) => c.id);

  const totalIndireto = idsCategorias.length
    ? await db.select({ v: sql<string>`coalesce(sum(valor),0)` }).from(s.lancamentos).where(and(
      eq(s.lancamentos.status, 'realizado'), inArray(s.lancamentos.categoriaId, idsCategorias),
      gte(s.lancamentos.dataCompetencia, de), lte(s.lancamentos.dataCompetencia, ate),
    ))
    : [{ v: '0' }];

  const pedidos = await db.select({ n: sql<number>`count(*)::int`, receita: sql<string>`coalesce(sum(total),0)` }).from(s.pedidos)
    .where(and(gte(s.pedidos.dataOperacao, de), lte(s.pedidos.dataOperacao, ate), inArray(s.pedidos.status, ['entregue', 'retirado'])));

  const totalIndiretoCents = toCents(totalIndireto[0].v);
  const qtdPedidos = pedidos[0].n;
  const receitaCents = toCents(pedidos[0].receita);
  return {
    totalIndiretoCents, qtdPedidos, receitaCents, de, ate,
    custoIndiretoPorPedidoCents: qtdPedidos > 0 ? Math.round(totalIndiretoCents / qtdPedidos) : 0,
    percentualIndireto: receitaCents > 0 ? totalIndiretoCents / receitaCents : 0,
  };
}

/** Últimos `dias` dias de operação (padrão 30), terminando hoje (America/Sao_Paulo). */
export function periodoPadrao(dias = 30): { de: string; ate: string } {
  const hoje = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
  const de = new Date(hoje); de.setDate(de.getDate() - dias);
  return { de: de.toISOString().slice(0, 10), ate: hoje.toISOString().slice(0, 10) };
}

/** Margem de um produto após o rateio (base "receita": aplica o % indireto sobre o preço do item). */
export function margemAposRateioProduto(precoCents: number, custoDiretoCents: number | null, r: Rateio): number | null {
  if (custoDiretoCents == null) return null;
  return precoCents - custoDiretoCents - Math.round(precoCents * r.percentualIndireto);
}

/** Margem de um pedido após o rateio (base "pedido": um valor fixo de indireto por pedido). */
export function margemAposRateioPedido(totalCents: number, custoDiretoTotalCents: number | null, r: Rateio): number | null {
  if (custoDiretoTotalCents == null) return null;
  return totalCents - custoDiretoTotalCents - r.custoIndiretoPorPedidoCents;
}
