import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth, type Env } from './auth';
import { catalogo } from './routes/catalogo';
import { clientes } from './routes/clientes';
import { config } from './routes/config';
import { financeiro } from './routes/financeiro';
import { pedidos } from './routes/pedidos';
import { publicRoutes } from './routes/public';
import { usuarios } from './routes/usuarios';

export const app = new Hono<Env>();
// CORS_ORIGIN = app interno; CORS_ORIGIN_PUBLIC = site público (origens diferentes).
const origensPermitidas = [process.env.CORS_ORIGIN, process.env.CORS_ORIGIN_PUBLIC].filter(Boolean);
app.use('*', cors({ origin: (o) => (origensPermitidas.length === 0 ? o : origensPermitidas.includes(o) ? o : ''), allowHeaders: ['authorization', 'content-type', 'x-mock-role'] }));
app.get('/health', (c) => c.json({ ok: true }));

// Rotas públicas (site): sem login. Registradas antes de /v1 pra não passar pelo middleware de auth.
app.route('/v1/public', publicRoutes);

const v1 = new Hono<Env>();
v1.use('*', auth);
v1.route('/', config);
v1.route('/', catalogo);
v1.route('/', clientes);
v1.route('/', pedidos);
v1.route('/', usuarios);
v1.route('/', financeiro);
app.route('/v1', v1);

app.notFound((c) => c.json({ error: { code: 'nao_encontrado', message: 'Rota não encontrada' } }, 404));
app.onError((e, c) => {
  console.error(e.message); // sem dados de cliente nos logs
  return c.json({ error: { code: 'erro_interno', message: 'Erro interno' } }, 500);
});
