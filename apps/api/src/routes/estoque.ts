import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';
import { estoqueAtualPorInsumo, necessidadeInsumos, validadeMaisProxima } from '../services/estoque';

export const estoque = new Hono<Env>();
const db = () => getDb();
estoque.use('*', requireAdmin); // custo/fornecedor de insumo é dado sensível, igual ao resto do catálogo de custos

/** "O que temos": estoque atual + validade mais próxima por insumo. */
estoque.get('/estoque', async (c) => {
  const [insumos, atual, validade] = await Promise.all([
    db().select().from(s.insumos).where(eq(s.insumos.ativo, true)).orderBy(asc(s.insumos.categoria), asc(s.insumos.nome)),
    estoqueAtualPorInsumo(db()), validadeMaisProxima(db()),
  ]);
  return c.json(insumos.map((i) => ({
    insumoId: i.id, nome: i.nome, categoria: i.categoria, unidadeCompra: i.unidadeCompra,
    estoqueMinimo: Number(i.estoqueMinimo ?? 0), estoqueAtual: atual.get(i.id) ?? 0, validadeMaisProxima: validade.get(i.id) ?? null,
  })));
});

/** "O que comprar pra semana": explode os pedidos do período em insumo, desconta o que já tem. */
estoque.get('/estoque/necessidade', async (c) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const de = c.req.query('de') ?? hoje;
  const ate = c.req.query('ate') ?? hoje;
  return c.json(await necessidadeInsumos(db(), de, ate));
});

/** Histórico de lotes de um insumo (ou de todos, mais recentes primeiro). */
estoque.get('/estoque/lotes', async (c) => {
  const insumoId = c.req.query('insumoId');
  const rows = await db().select({ l: s.estoqueLotes, insumo: s.insumos.nome, fornecedor: s.fornecedores.nome })
    .from(s.estoqueLotes).innerJoin(s.insumos, eq(s.insumos.id, s.estoqueLotes.insumoId))
    .leftJoin(s.fornecedores, eq(s.fornecedores.id, s.estoqueLotes.fornecedorId))
    .where(insumoId ? eq(s.estoqueLotes.insumoId, insumoId) : undefined)
    .orderBy(desc(s.estoqueLotes.createdAt)).limit(200);
  return c.json(rows.map((r) => ({ ...r.l, insumo: r.insumo, fornecedor: r.fornecedor })));
});

const loteBody = z.object({
  insumoId: z.uuid(), origem: z.enum(['compra', 'ajuste']).default('compra'), quantidade: z.number(),
  validade: z.iso.date().nullish(), fornecedorId: z.uuid().nullish(), custoUnitario: z.number().min(0).nullish(), observacao: z.string().nullish(),
});
/** Registra entrada de compra (quantidade positiva) ou ajuste manual (pode ser negativo, ex.: perda). */
estoque.post('/estoque/lotes', zValidator('json', loteBody), async (c) => {
  const b = c.req.valid('json');
  const [l] = await db().insert(s.estoqueLotes).values({
    ...b, quantidade: b.quantidade.toFixed(3), custoUnitario: b.custoUnitario?.toFixed(2), createdBy: c.get('user').nome,
  }).returning();
  // Compra com custo informado atualiza o custo atual do insumo (mesma lógica de "/insumos/:id/custo").
  if (b.origem === 'compra' && b.custoUnitario != null) {
    const custo = b.custoUnitario.toFixed(2);
    await db().update(s.insumos).set({ custoAtual: custo, updatedAt: new Date() }).where(eq(s.insumos.id, b.insumoId));
    await db().insert(s.insumoCustosHistorico).values({ insumoId: b.insumoId, custo, fornecedorId: b.fornecedorId, observacao: 'Entrada de estoque' });
  }
  return c.json(l, 201);
});

/** Desativa um lote (acabou antes da validade, ou foi lançado errado) sem apagar o histórico. */
estoque.patch('/estoque/lotes/:id', zValidator('json', z.object({ ativo: z.boolean().optional(), quantidade: z.number().optional(), observacao: z.string().nullish() })), async (c) => {
  const { quantidade, ...b } = c.req.valid('json');
  const [l] = await db().update(s.estoqueLotes).set({
    ...b, ...(quantidade !== undefined ? { quantidade: quantidade.toFixed(3) } : {}), updatedAt: new Date(),
  }).where(eq(s.estoqueLotes.id, c.req.param('id'))).returning();
  return c.json(l);
});
