import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth, type Env } from './auth';
import { catalogo } from './routes/catalogo';
import { clientes } from './routes/clientes';
import { config } from './routes/config';
import { pedidos } from './routes/pedidos';
import { usuarios } from './routes/usuarios';

export const app = new Hono<Env>();
app.use('*', cors({ origin: (o) => (process.env.CORS_ORIGIN ? (o === process.env.CORS_ORIGIN ? o : '') : o), allowHeaders: ['authorization', 'content-type', 'x-mock-role'] }));
app.get('/health', (c) => c.json({ ok: true }));

const v1 = new Hono<Env>();
v1.use('*', auth);
v1.route('/', config);
v1.route('/', catalogo);
v1.route('/', clientes);
v1.route('/', pedidos);
v1.route('/', usuarios);
app.route('/v1', v1);

app.notFound((c) => c.json({ error: { code: 'nao_encontrado', message: 'Rota não encontrada' } }, 404));
app.onError((e, c) => {
  console.error(e.message); // sem dados de cliente nos logs
  return c.json({ error: { code: 'erro_interno', message: 'Erro interno' } }, 500);
});
