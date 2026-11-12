import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';

export const config = new Hono<Env>();

// Chave de credencial (ex.: token de gateway de pagamento) — GET genérico nunca devolve o valor
// real pra essas, só admin consegue nem checar se está configurado. Qualquer config nova que seja
// um segredo (não operacional) entra aqui.
const CHAVES_SENSIVEIS = new Set(['mercadopago_access_token', 'mercadopago_webhook_secret']);

config.get('/me', (c) => c.json(c.get('user')));
config.get('/configuracoes/:chave', async (c) => {
  const chave = c.req.param('chave');
  const sensivel = CHAVES_SENSIVEIS.has(chave);
  if (sensivel && c.get('user').papel !== 'admin') return c.json({ error: { code: 'forbidden', message: 'Sem permissão' } }, 403);
  const [r] = await getDb().select().from(s.configuracoes).where(eq(s.configuracoes.chave, chave));
  // Sensível sempre responde {configurado}, mesmo nunca cadastrada — contrato fixo, sem 404 nesse caso.
  if (sensivel) return c.json({ configurado: !!r?.valor });
  if (!r) return c.json({ error: { code: 'nao_encontrado', message: 'Configuração não encontrada' } }, 404);
  return c.json(r.valor);
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
