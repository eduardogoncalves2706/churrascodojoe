import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';

export const vendedores = new Hono<Env>();
const db = () => getDb();

/* ---------- Vendedores (cadastro) ---------- */
// Lista é aberta a qualquer papel (quem cria pedido escolhe o vendedor, igual motoboy) — mas
// comissão/valor é dado financeiro, só admin vê, igual /colaboradores em config.ts.
vendedores.get('/vendedores', async (c) => {
  const rows = await db().select().from(s.vendedores).where(eq(s.vendedores.ativo, true)).orderBy(asc(s.vendedores.nome));
  return c.json(c.get('user').papel === 'admin' ? rows : rows.map(({ id, nome, codigo }) => ({ id, nome, codigo })));
});

const vendedorBody = z.object({
  nome: z.string().min(1), codigo: z.string().min(1), tipoComissao: z.enum(s.tipoComissaoEnum.enumValues).default('percentual'),
  valorComissao: z.number().min(0).default(0), usuarioEmail: z.string().email().nullish(),
});
vendedores.post('/vendedores', requireAdmin, zValidator('json', vendedorBody), async (c) => {
  const b = c.req.valid('json');
  return c.json((await db().insert(s.vendedores).values({ ...b, valorComissao: b.valorComissao.toFixed(2) }).returning())[0], 201);
});
vendedores.patch('/vendedores/:id', requireAdmin, zValidator('json', vendedorBody.partial().extend({ ativo: z.boolean().optional() })), async (c) => {
  const { valorComissao, ...b } = c.req.valid('json');
  return c.json((await db().update(s.vendedores).set({ ...b, ...(valorComissao !== undefined ? { valorComissao: valorComissao.toFixed(2) } : {}), updatedAt: new Date() }).where(eq(s.vendedores.id, c.req.param('id'))).returning())[0]);
});

/* ---------- Comissões (tela de acompanhamento) — dado financeiro, admin-only ---------- */
vendedores.get('/comissoes', requireAdmin, async (c) => {
  const { vendedorId, status, de, ate } = c.req.query();
  const conds = [];
  if (vendedorId) conds.push(eq(s.comissoes.vendedorId, vendedorId));
  if (status) conds.push(eq(s.comissoes.status, status as never));
  if (de) conds.push(gte(s.pedidos.dataOperacao, de));
  if (ate) conds.push(lte(s.pedidos.dataOperacao, ate));
  const rows = await db().select({
    com: s.comissoes, vendedorNome: s.vendedores.nome, vendedorCodigo: s.vendedores.codigo,
    numeroDia: s.pedidos.numeroDia, dataOperacao: s.pedidos.dataOperacao, cliente: s.pedidos.nomeClienteSnapshot, totalPedido: s.pedidos.total, statusPedido: s.pedidos.status,
  }).from(s.comissoes)
    .innerJoin(s.vendedores, eq(s.vendedores.id, s.comissoes.vendedorId)).innerJoin(s.pedidos, eq(s.pedidos.id, s.comissoes.pedidoId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(s.pedidos.dataOperacao), desc(s.comissoes.createdAt)).limit(500);
  return c.json(rows.map((r) => ({
    ...r.com, vendedorNome: r.vendedorNome, vendedorCodigo: r.vendedorCodigo, numeroDia: r.numeroDia, dataOperacao: r.dataOperacao, cliente: r.cliente, totalPedido: r.totalPedido, statusPedido: r.statusPedido,
  })));
});

/** Total pendente/pago por vendedor no período — "quanto será pago a cada um" da tela de acompanhamento. */
vendedores.get('/comissoes/resumo', requireAdmin, async (c) => {
  const { de, ate } = c.req.query();
  const conds = [sql`${s.comissoes.status} <> 'cancelada'`];
  if (de) conds.push(gte(s.pedidos.dataOperacao, de));
  if (ate) conds.push(lte(s.pedidos.dataOperacao, ate));
  const rows = await db().select({
    vendedorId: s.vendedores.id, vendedorNome: s.vendedores.nome, vendedorCodigo: s.vendedores.codigo,
    qtd: sql<number>`count(*)::int`,
    pendente: sql<string>`coalesce(sum(coalesce(${s.comissoes.valorFinal}, ${s.comissoes.valorCalculado})) filter (where ${s.comissoes.status} = 'pendente'), 0)`,
    pago: sql<string>`coalesce(sum(coalesce(${s.comissoes.valorFinal}, ${s.comissoes.valorCalculado})) filter (where ${s.comissoes.status} = 'paga'), 0)`,
  }).from(s.comissoes)
    .innerJoin(s.vendedores, eq(s.vendedores.id, s.comissoes.vendedorId)).innerJoin(s.pedidos, eq(s.pedidos.id, s.comissoes.pedidoId))
    .where(and(...conds)).groupBy(s.vendedores.id, s.vendedores.nome, s.vendedores.codigo).orderBy(asc(s.vendedores.nome));
  return c.json(rows);
});

/** Ajuste manual: admin pode corrigir o valor (`valorFinal`, null = volta a usar o calculado) e/ou
 * marcar como paga/cancelada — o sistema nunca fecha (marca paga) sozinho. */
const ajusteBody = z.object({ valorFinal: z.number().min(0).nullish(), status: z.enum(s.statusComissaoEnum.enumValues).optional(), motivoAjuste: z.string().nullish() });
vendedores.patch('/comissoes/:id', requireAdmin, zValidator('json', ajusteBody), async (c) => {
  const { valorFinal, ...b } = c.req.valid('json');
  const set: Record<string, unknown> = { ...b, updatedAt: new Date() };
  if (valorFinal !== undefined) set.valorFinal = valorFinal === null ? null : valorFinal.toFixed(2);
  return c.json((await db().update(s.comissoes).set(set).where(eq(s.comissoes.id, c.req.param('id'))).returning())[0]);
});
