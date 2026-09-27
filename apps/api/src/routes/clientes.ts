import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';
import { encontrarOuCriarCliente, normTel } from '../services/clientes';

export const clientes = new Hono<Env>();
const db = () => getDb();

async function comEnderecos<T extends { id: string }>(rows: T[]) {
  const ends = await db().select().from(s.enderecosCliente);
  return rows.map((r) => ({ ...r, enderecos: ends.filter((e) => e.clienteId === (r as { id: string }).id) }));
}

clientes.get('/clientes', async (c) => {
  const busca = c.req.query('busca')?.trim();
  const inativoDias = Number(c.req.query('inativoDias') ?? 0);
  const where = busca ? or(ilike(s.clientes.nome, `%${busca}%`), ilike(s.clientes.telefone, `%${busca.replace(/\D/g, '') || busca}%`)) : undefined;
  const rows = await db().select({
    c: s.clientes,
    pedidos: sql<number>`count(${s.pedidos.id}) filter (where ${s.pedidos.status} <> 'cancelado')::int`,
    totalGasto: sql<string>`coalesce(sum(${s.pedidos.total}) filter (where ${s.pedidos.status} <> 'cancelado'),0)`,
    ultimoPedido: sql<string | null>`max(${s.pedidos.dataOperacao})`,
  }).from(s.clientes).leftJoin(s.pedidos, eq(s.pedidos.clienteId, s.clientes.id)).where(where).groupBy(s.clientes.id).orderBy(asc(s.clientes.nome)).limit(100);
  const out = rows.map((r) => ({ ...r.c, qtdPedidos: r.pedidos, totalGasto: r.totalGasto, ultimoPedido: r.ultimoPedido }));
  const lim = inativoDias > 0 ? Date.now() - inativoDias * 86400000 : 0;
  return c.json(lim ? out.filter((r) => !r.ultimoPedido || new Date(r.ultimoPedido).getTime() < lim) : out);
});

clientes.get('/clientes/:id', async (c) => {
  const [cl] = await db().select().from(s.clientes).where(eq(s.clientes.id, c.req.param('id')));
  if (!cl) return c.json({ error: { code: 'nao_encontrado', message: 'Cliente não encontrado' } }, 404);
  return c.json((await comEnderecos([cl]))[0]);
});

clientes.get('/clientes/por-telefone/:tel', async (c) => {
  const [cl] = await db().select().from(s.clientes).where(eq(s.clientes.telefone, normTel(c.req.param('tel'))));
  if (!cl) return c.json({ error: { code: 'nao_encontrado', message: 'Cliente não encontrado' } }, 404);
  return c.json((await comEnderecos([cl]))[0]);
});

const endBody = z.object({ logradouro: z.string().min(1), numero: z.string().nullish(), complemento: z.string().nullish(), bairroId: z.uuid().nullish(), referencia: z.string().nullish(), principal: z.boolean().default(true) });
// Telefone é opcional: cliente importado sem telefone é diferenciado pelo nome (ver services/clientes.ts).
const cliBody = z.object({ nome: z.string().min(1), telefone: z.string().min(8).optional(), instagram: z.string().nullish(), observacoes: z.string().nullish(), endereco: endBody.optional() });

clientes.post('/clientes', zValidator('json', cliBody), async (c) => {
  const { endereco, ...b } = c.req.valid('json');
  const { cliente, novo } = await encontrarOuCriarCliente(db(), b);
  if (endereco) await db().insert(s.enderecosCliente).values({ ...endereco, clienteId: cliente.id });
  return c.json({ ...(await comEnderecos([cliente]))[0], jaExistia: !novo }, novo ? 201 : 200);
});

const cliPatchBody = cliBody.omit({ endereco: true, telefone: true }).partial().extend({ telefone: z.string().optional(), ativo: z.boolean().optional() });
clientes.patch('/clientes/:id', zValidator('json', cliPatchBody), async (c) => {
  const b = c.req.valid('json');
  // string vazia = "limpar telefone" (volta a ficar opcional); omitido = mantém o atual
  const telefone = b.telefone === '' ? null : b.telefone ? normTel(b.telefone) : undefined;
  const [cl] = await db().update(s.clientes).set({ ...b, ...(telefone !== undefined ? { telefone } : {}), updatedAt: new Date() }).where(eq(s.clientes.id, c.req.param('id'))).returning();
  return c.json(cl);
});

clientes.post('/clientes/:id/enderecos', zValidator('json', endBody), async (c) => {
  const id = c.req.param('id'); const b = c.req.valid('json');
  if (b.principal) await db().update(s.enderecosCliente).set({ principal: false }).where(eq(s.enderecosCliente.clienteId, id));
  return c.json((await db().insert(s.enderecosCliente).values({ ...b, clienteId: id }).returning())[0], 201);
});

clientes.get('/clientes/:id/pedidos', async (c) =>
  c.json(await db().select().from(s.pedidos).where(eq(s.pedidos.clienteId, c.req.param('id'))).orderBy(desc(s.pedidos.createdAt)).limit(50)));

/* ---------- Bairros ---------- */
clientes.get('/bairros', async (c) => c.json(await db().select().from(s.bairrosEntrega).orderBy(asc(s.bairrosEntrega.cidade), asc(s.bairrosEntrega.nome))));
const bairroBody = z.object({ nome: z.string().min(1), cidade: z.string().min(1).default('Canoas'), taxaEntrega: z.number().min(0), atende: z.boolean().default(true) });
clientes.post('/bairros', requireAdmin, zValidator('json', bairroBody), async (c) => {
  const b = c.req.valid('json');
  return c.json((await db().insert(s.bairrosEntrega).values({ ...b, taxaEntrega: b.taxaEntrega.toFixed(2) }).returning())[0], 201);
});
clientes.patch('/bairros/:id', requireAdmin, zValidator('json', bairroBody.omit({ cidade: true, atende: true }).partial().extend({ cidade: z.string().optional(), atende: z.boolean().optional() })), async (c) => {
  const { taxaEntrega, ...b } = c.req.valid('json');
  return c.json((await db().update(s.bairrosEntrega).set({ ...b, ...(taxaEntrega !== undefined ? { taxaEntrega: taxaEntrega.toFixed(2) } : {}), updatedAt: new Date() }).where(and(eq(s.bairrosEntrega.id, c.req.param('id')))).returning())[0]);
});
