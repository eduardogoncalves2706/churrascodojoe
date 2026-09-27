import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { schema as s } from '../client';

const MOTIVO = 'Sincronizado com Controle_Pedidos_Churrasco.xlsx (aba Preços)';

/** Preços atualizados de itens já cadastrados. */
const PRECOS: [string, string][] = [
  ['Picanha', '109.00'], ['Maminha', '89.90'], ['Alcatra', '89.90'], ['Vazio', '89.90'], ['Costela', '64.90'],
  ['Salsichão', '59.90'], ['Pão de alho (bandeja)', '29.90'], ['Pão de alho (unidade)', '14.95'], ['Coração', '49.90'],
  ['Arroz 500 g', '9.99'], ['Maionese 300 g', '13.99'], ['Geleia defumada', '29.90'],
];

type CategoriaProduto = (typeof s.categoriaProdutoEnum.enumValues)[number];
interface NovoProduto { nome: string; categoria: CategoriaProduto; unidadeVenda: string; preco: string; permiteFracionado?: boolean }
/** Itens novos na planilha, sem correspondente no cadastro. Sem ficha técnica (custo do insumo não veio na planilha). */
const NOVOS_PRODUTOS: NovoProduto[] = [
  { nome: 'Sobrecoxa', categoria: 'carne', unidadeVenda: 'espeto', preco: '49.90', permiteFracionado: true },
  { nome: 'Cerveja Heineken', categoria: 'bebida', unidadeVenda: 'unidade', preco: '9.99' },
  { nome: 'Cerveja Corona', categoria: 'bebida', unidadeVenda: 'unidade', preco: '9.99' },
  { nome: 'Refrigerante 2L', categoria: 'bebida', unidadeVenda: 'unidade', preco: '15.00' },
  { nome: 'Quindim', categoria: 'sobremesa', unidadeVenda: 'unidade', preco: '7.00' },
  { nome: 'Cone especial', categoria: 'sobremesa', unidadeVenda: 'unidade', preco: '12.00' },
  { nome: 'Cone tradicional', categoria: 'sobremesa', unidadeVenda: 'unidade', preco: '10.00' },
  { nome: 'Pudim P', categoria: 'sobremesa', unidadeVenda: 'unidade', preco: '10.00' },
  { nome: 'Pudim G', categoria: 'sobremesa', unidadeVenda: 'unidade', preco: '35.00' },
  { nome: 'Tortinha de Limão', categoria: 'sobremesa', unidadeVenda: 'unidade', preco: '10.00' },
];

/** Preço das variantes de combo por carne. */
const VARIANTES: [string, [string, string][]][] = [
  ['Combo 1 – 2 pessoas', [['Costela', '149.99'], ['Vazio', '164.99'], ['Alcatra', '164.99'], ['Maminha', '164.99'], ['Picanha', '184.99']]],
  ['Combo 2 – 4 pessoas', [['Costela', '259.99'], ['Vazio', '274.99'], ['Alcatra', '274.99'], ['Maminha', '274.99'], ['Picanha', '299.99']]],
];

/** Idempotente: só grava histórico/atualiza quando o preço realmente muda. */
export async function atualizarPrecosControlePedidos(db: Db) {
  let precosAlterados = 0; let produtosCriados = 0; let variantesAlteradas = 0;

  for (const [nome, preco] of PRECOS) {
    const [p] = await db.select().from(s.produtos).where(eq(s.produtos.nome, nome));
    if (!p) { console.warn(`produto não encontrado, ignorado: ${nome}`); continue; }
    if (Number(p.precoVenda) === Number(preco)) continue;
    await db.update(s.produtos).set({ precoVenda: preco, updatedAt: new Date() }).where(eq(s.produtos.id, p.id));
    await db.insert(s.produtoPrecosHistorico).values({ produtoId: p.id, preco, motivo: MOTIVO });
    precosAlterados++;
  }

  let ordem = (await db.select({ n: sql<number>`coalesce(max(ordem),0)` }).from(s.produtos))[0].n;
  for (const np of NOVOS_PRODUTOS) {
    const [criado] = await db.insert(s.produtos).values({
      nome: np.nome, categoria: np.categoria, unidadeVenda: np.unidadeVenda, precoVenda: np.preco,
      permiteFracionado: np.permiteFracionado ?? false, ordem: ++ordem,
    }).onConflictDoNothing().returning();
    if (criado) {
      await db.insert(s.produtoPrecosHistorico).values({ produtoId: criado.id, preco: np.preco, motivo: MOTIVO });
      produtosCriados++;
    }
  }

  for (const [comboNome, precos] of VARIANTES) {
    const [combo] = await db.select().from(s.combos).where(eq(s.combos.nome, comboNome));
    if (!combo) { console.warn(`combo não encontrado, ignorado: ${comboNome}`); continue; }
    for (const [carneNome, preco] of precos) {
      const [carne] = await db.select().from(s.produtos).where(eq(s.produtos.nome, carneNome));
      if (!carne) continue;
      const [v] = await db.select().from(s.comboVariantes).where(sql`${s.comboVariantes.comboId} = ${combo.id} and ${s.comboVariantes.carneProdutoId} = ${carne.id}`);
      if (v && Number(v.preco) === Number(preco)) continue;
      await db.insert(s.comboVariantes).values({ comboId: combo.id, carneProdutoId: carne.id, preco })
        .onConflictDoUpdate({ target: [s.comboVariantes.comboId, s.comboVariantes.carneProdutoId], set: { preco, updatedAt: new Date() } });
      variantesAlteradas++;
    }
  }

  return { precosAlterados, produtosCriados, variantesAlteradas };
}
