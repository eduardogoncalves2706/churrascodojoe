import { toCents, custoProdutoCents, custoComboCents, margem } from '@joe/shared';
import type { Db } from '../db/client';
import { schema as s } from '../db/client';

/**
 * Custo direto (centavos) por produto — nunca inclui custo indireto (carvão, embalagem, limpeza, gás),
 * esse é rateado à parte (ver services/rateio.ts e SPEC_adendo_rateio_custos.md).
 * Prioridade: ficha técnica (recalcula ao vivo com o custo atual do insumo) senão `produtos.custoDireto`
 * (valor manual, usado quando não há ficha técnica) senão null. Aceita Db ou uma transação.
 */
export async function custosProdutos(db: Pick<Db, 'select'>): Promise<Map<string, number | null>> {
  const [ins, ficha, prods] = await Promise.all([
    db.select({ id: s.insumos.id, custo: s.insumos.custoAtual }).from(s.insumos),
    db.select().from(s.fichaTecnica),
    db.select({ id: s.produtos.id, custoDireto: s.produtos.custoDireto }).from(s.produtos),
  ]);
  const custoIns = new Map(ins.map((i) => [i.id, toCents(i.custo)]));
  const porProduto = new Map<string, { quantidadeInsumo: number; custoInsumoCents: number }[]>();
  for (const f of ficha) {
    const l = porProduto.get(f.produtoId) ?? [];
    l.push({ quantidadeInsumo: Number(f.quantidadeInsumo), custoInsumoCents: custoIns.get(f.insumoId) ?? 0 });
    porProduto.set(f.produtoId, l);
  }
  return new Map(prods.map((p) => {
    const daFicha = custoProdutoCents(porProduto.get(p.id) ?? []);
    return [p.id, daFicha ?? (p.custoDireto != null ? toCents(p.custoDireto) : null)];
  }));
}

/** Custo de uma variante de combo; refrigeranteId substitui o item do grupo "refrigerante". */
export function custoVariante(
  itens: { produtoId: string | null; quantidade: string; ehCarneEscolhida: boolean; grupoEscolha: string | null }[],
  carneId: string, custos: Map<string, number | null>, refrigeranteId?: string,
): number | null {
  return custoComboCents(
    itens.map((i) => ({
      quantidade: Number(i.quantidade), ehCarneEscolhida: i.ehCarneEscolhida,
      custoUnitCents: i.produtoId ? (i.grupoEscolha === 'refrigerante' && refrigeranteId ? custos.get(refrigeranteId) ?? null : custos.get(i.produtoId) ?? null) : null,
    })),
    custos.get(carneId) ?? null,
  );
}

export { margem };
