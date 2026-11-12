import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schema as s } from '../db/client';

/** Soma dos lotes ativos por insumo — é o "quanto temos" hoje (compras lançadas menos baixas/ajustes). */
export async function estoqueAtualPorInsumo(db: Pick<Db, 'select'>): Promise<Map<string, number>> {
  const rows = await db.select({ insumoId: s.estoqueLotes.insumoId, qtd: sql<string>`sum(${s.estoqueLotes.quantidade})` })
    .from(s.estoqueLotes).where(eq(s.estoqueLotes.ativo, true)).groupBy(s.estoqueLotes.insumoId);
  return new Map(rows.map((r) => [r.insumoId, Number(r.qtd)]));
}

/** Validade mais próxima entre os lotes ativos de cada insumo (null = sem validade cadastrada). */
export async function validadeMaisProxima(db: Pick<Db, 'select'>): Promise<Map<string, string | null>> {
  const rows = await db.select({ insumoId: s.estoqueLotes.insumoId, validade: sql<string | null>`min(${s.estoqueLotes.validade})` })
    .from(s.estoqueLotes).where(eq(s.estoqueLotes.ativo, true)).groupBy(s.estoqueLotes.insumoId);
  return new Map(rows.map((r) => [r.insumoId, r.validade]));
}

/**
 * Quantidade de cada produto "de verdade" pedida num período (resolve combo → carne escolhida +
 * refrigerante escolhido, igual ao cálculo de custo em services/custos.ts — mesma fonte da verdade).
 * Exportada também pra rota de Produção (routes/pedidos.ts), que usa isso pro "a preparar do dia".
 */
export async function produtosPedidos(db: Pick<Db, 'select'>, de: string, ate: string): Promise<Map<string, number>> {
  const pedidosDoPeriodo = await db.select({ id: s.pedidos.id }).from(s.pedidos)
    .where(and(gte(s.pedidos.dataOperacao, de), lte(s.pedidos.dataOperacao, ate), sql`${s.pedidos.status} not in ('cancelado', 'recusado', 'rascunho')`));
  if (!pedidosDoPeriodo.length) return new Map();
  const ids = pedidosDoPeriodo.map((p) => p.id);

  const [itens, variantes, comboItens] = await Promise.all([
    db.select().from(s.pedidoItens).where(sql`${s.pedidoItens.pedidoId} in ${ids}`),
    db.select().from(s.comboVariantes),
    db.select().from(s.comboItens),
  ]);
  const varianteMap = new Map(variantes.map((v) => [v.id, v]));
  const itensPorCombo = new Map<string, typeof comboItens>();
  for (const ci of comboItens) itensPorCombo.set(ci.comboId, [...(itensPorCombo.get(ci.comboId) ?? []), ci]);

  const total = new Map<string, number>();
  const soma = (produtoId: string, qtd: number) => total.set(produtoId, (total.get(produtoId) ?? 0) + qtd);

  for (const it of itens) {
    const qtdPedida = Number(it.quantidade);
    if (it.produtoId) { soma(it.produtoId, qtdPedida); continue; }
    if (!it.comboVarianteId) continue;
    const variante = varianteMap.get(it.comboVarianteId);
    if (!variante) continue;
    const refrigeranteId = (it.escolhas as { refrigeranteId?: string } | null)?.refrigeranteId;
    for (const ci of itensPorCombo.get(variante.comboId) ?? []) {
      const produtoId = ci.ehCarneEscolhida ? variante.carneProdutoId : ci.grupoEscolha === 'refrigerante' ? refrigeranteId : (ci.produtoId ?? undefined);
      if (produtoId) soma(produtoId, Number(ci.quantidade) * qtdPedida);
    }
  }
  return total;
}

export interface NecessidadeInsumo {
  insumoId: string; nome: string; categoria: string; unidadeCompra: string;
  necessario: number; estoqueMinimo: number; estoqueAtual: number; aComprar: number; validadeMaisProxima: string | null;
}

/**
 * "O que comprar pra semana": explode os pedidos do período (produto → ficha técnica → insumo),
 * soma o estoque mínimo de segurança, e desconta o que já tem em estoque. Ordenado pelo que falta
 * primeiro, pra não esquecer nada na hora de montar a lista de compra.
 */
export async function necessidadeInsumos(db: Pick<Db, 'select'>, de: string, ate: string): Promise<NecessidadeInsumo[]> {
  const [produtosQtd, ficha, insumos, atual, validade] = await Promise.all([
    produtosPedidos(db, de, ate),
    db.select().from(s.fichaTecnica),
    db.select().from(s.insumos).where(eq(s.insumos.ativo, true)),
    estoqueAtualPorInsumo(db),
    validadeMaisProxima(db),
  ]);

  const necessario = new Map<string, number>();
  for (const f of ficha) {
    const qtdProduto = produtosQtd.get(f.produtoId);
    if (!qtdProduto) continue;
    necessario.set(f.insumoId, (necessario.get(f.insumoId) ?? 0) + qtdProduto * Number(f.quantidadeInsumo));
  }

  return insumos
    .map((i): NecessidadeInsumo => {
      const necessarioInsumo = necessario.get(i.id) ?? 0;
      const minimo = Number(i.estoqueMinimo ?? 0);
      const estoqueAtual = atual.get(i.id) ?? 0;
      return {
        insumoId: i.id, nome: i.nome, categoria: i.categoria, unidadeCompra: i.unidadeCompra,
        necessario: necessarioInsumo, estoqueMinimo: minimo, estoqueAtual,
        aComprar: Math.max(0, necessarioInsumo + minimo - estoqueAtual),
        validadeMaisProxima: validade.get(i.id) ?? null,
      };
    })
    .filter((n) => n.necessario > 0 || n.estoqueMinimo > 0 || n.estoqueAtual > 0) // esconde insumo sem movimento nenhum
    .sort((a, b) => b.aComprar - a.aComprar);
}
