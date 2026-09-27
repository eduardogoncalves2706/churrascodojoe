import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';

export const config = new Hono<Env>();

config.get('/me', (c) => c.json(c.get('user')));
config.get('/configuracoes/:chave', async (c) => {
  const [r] = await getDb().select().from(s.configuracoes).where(eq(s.configuracoes.chave, c.req.param('chave')));
  return r ? c.json(r.valor) : c.json({ error: { code: 'nao_encontrado', message: 'Configuração não encontrada' } }, 404);
});
config.put('/configuracoes/:chave', requireAdmin, zValidator('json', z.unknown()), async (c) => {
  const chave = c.req.param('chave'); const valor = c.req.valid('json') ?? null;
  await getDb().insert(s.configuracoes).values({ chave, valor }).onConflictDoUpdate({ target: s.configuracoes.chave, set: { valor, updatedAt: new Date() } });
  return c.json({ ok: true });
});

/** Lista de colaboradores ativos (motoboys para atribuição de entregas). Valores de remuneração só para admin. */
config.get('/colaboradores', async (c) => {
  const rows = await getDb().select().from(s.colaboradores).where(eq(s.colaboradores.ativo, true));
  return c.json(c.get('user').papel === 'admin' ? rows : rows.map(({ id, nome, tipo }) => ({ id, nome, tipo })));
});
