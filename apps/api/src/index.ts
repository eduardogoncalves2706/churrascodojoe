import { handle } from 'hono/aws-lambda';
import { app } from './app';
import { runMigrations } from './db/migrate';
import { seed } from './db/seed';

const http = handle(app);

/**
 * Manutenção: invocação direta (IAM) da Lambda com { joeAdmin: 'migrate' | 'seed' }.
 * Eventos do API Gateway nunca carregam essa chave no topo, então não é acionável pela internet.
 */
export const handler = async (event: Record<string, unknown>, ctx: never) => {
  if (event?.joeAdmin === 'migrate') { await runMigrations(`${process.env.LAMBDA_TASK_ROOT}/migrations`); return { ok: 'migrate' }; }
  if (event?.joeAdmin === 'seed') { await seed(); return { ok: 'seed' }; }
  return http(event as never, ctx);
};
