import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { schema as s } from '../client';

const MOTIVO = 'Correção de preço informada pelo Eduardo (27/09)';

/** Preços de produtos já cadastrados, corrigidos. */
const PRECOS: [string, string][] = [
  ['Salsichão (unidade)', '8.50'], // era 3,99 (valor herdado da planilha antiga, errado)
  ['Sobrecoxa', '49.99'], // era 49,90
];

/** Idempotente. Cadastra o insumo Sobrecoxa (10,90/kg), a ficha técnica do espeto (rende 1,5 espeto/kg,
 * ou seja 5 sobrecoxas por espeto inteiro) e o produto "Sobrecoxa (unidade)" vendido avulso. */
export async function corrigirPrecos27_09(db: Db) {
  let precosAlterados = 0;

  for (const [nome, preco] of PRECOS) {
    const [p] = await db.select().from(s.produtos).where(eq(s.produtos.nome, nome));
    if (!p) { console.warn(`produto não encontrado, ignorado: ${nome}`); continue; }
    if (Number(p.precoVenda) === Number(preco)) continue;
    await db.update(s.produtos).set({ precoVenda: preco, updatedAt: new Date() }).where(eq(s.produtos.id, p.id));
    await db.insert(s.produtoPrecosHistorico).values({ produtoId: p.id, preco, motivo: MOTIVO });
    precosAlterados++;
  }

  const [insumo] = await db.insert(s.insumos).values({ nome: 'Sobrecoxa', categoria: 'carne', unidadeCompra: 'kg', custoAtual: '10.90' })
    .onConflictDoNothing().returning();
  if (insumo) await db.insert(s.insumoCustosHistorico).values({ insumoId: insumo.id, custo: '10.90', observacao: MOTIVO });
  const [{ id: insumoId }] = insumo ? [insumo] : await db.select({ id: s.insumos.id }).from(s.insumos).where(eq(s.insumos.nome, 'Sobrecoxa'));

  const [espeto] = await db.select().from(s.produtos).where(eq(s.produtos.nome, 'Sobrecoxa'));
  let fichaCriada = false; let rendimentoCriado = false;
  if (espeto) {
    const [ficha] = await db.insert(s.fichaTecnica).values({ produtoId: espeto.id, insumoId, quantidadeInsumo: (1 / 1.5).toFixed(4) }).onConflictDoNothing().returning();
    fichaCriada = !!ficha;
    const [rend] = await db.insert(s.rendimentoInsumo).values({ insumoId, produtoId: espeto.id, fator: '1.5' }).onConflictDoNothing().returning();
    rendimentoCriado = !!rend;
  }

  const [unidade, criadaUnidade] = await (async () => {
    const [row] = await db.insert(s.produtos).values({ nome: 'Sobrecoxa (unidade)', categoria: 'carne', unidadeVenda: 'unidade', precoVenda: '14.90', ordem: 999 })
      .onConflictDoNothing().returning();
    return [row, !!row] as const;
  })();
  if (criadaUnidade) await db.insert(s.produtoPrecosHistorico).values({ produtoId: unidade!.id, preco: '14.90', motivo: MOTIVO });

  return { precosAlterados, insumoSobrecoxaCriado: !!insumo, fichaCriada, rendimentoCriado, unidadeSobrecoxaCriada: criadaUnidade };
}
