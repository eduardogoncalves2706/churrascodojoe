import { zValidator } from '@hono/zod-validator';
import { PAPEIS } from '@joe/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { ErroUsuarios, convidarUsuario, definirAtivo, definirPapel, listarUsuarios, reenviarConvite } from '../services/usuarios';

export const usuarios = new Hono<Env>();

usuarios.onError((e, c) => {
  if (e instanceof ErroUsuarios) return c.json({ error: { code: 'usuarios', message: e.message } }, e.status as never);
  throw e;
});

usuarios.use('*', requireAdmin);

usuarios.get('/usuarios', async (c) => c.json(await listarUsuarios()));

usuarios.post('/usuarios', zValidator('json', z.object({ nome: z.string().min(1), email: z.email(), papel: z.enum(PAPEIS) })), async (c) => {
  const { nome, email, papel } = c.req.valid('json');
  await convidarUsuario(nome, email, papel);
  return c.json({ ok: true }, 201);
});

usuarios.patch('/usuarios/:email', zValidator('json', z.object({ papel: z.enum(PAPEIS).optional(), ativo: z.boolean().optional() })), async (c) => {
  const email = decodeURIComponent(c.req.param('email'));
  const { papel, ativo } = c.req.valid('json');
  if (papel) await definirPapel(email, papel);
  if (ativo !== undefined) await definirAtivo(email, ativo);
  return c.json({ ok: true });
});

usuarios.post('/usuarios/:email/reenviar', async (c) => {
  await reenviarConvite(decodeURIComponent(c.req.param('email')));
  return c.json({ ok: true });
});
