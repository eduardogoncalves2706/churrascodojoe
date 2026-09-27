import { handle } from 'hono/aws-lambda';
import { app } from './app';
import { getDb } from './db/client';
import { runMigrations } from './db/migrate';
import { seed } from './db/seed';
import { corrigirPrecos27_09 } from './db/updates/2026-09-27-correcoes';
import { habilitarFracionadoCarnes } from './db/updates/2026-09-27-fracionado-carnes';
import { normalizarTelefones } from './db/updates/2026-09-27-normaliza-telefones';
import { atualizarPrecosControlePedidos } from './db/updates/2026-09-precos-controle-pedidos';

const http = handle(app);

/**
 * Manutenção: invocação direta (IAM) da Lambda com { joeAdmin: '...' }.
 * Eventos do API Gateway nunca carregam essa chave no topo, então não é acionável pela internet.
 */
export const handler = async (event: Record<string, unknown>, ctx: never) => {
  if (event?.joeAdmin === 'migrate') { await runMigrations(`${process.env.LAMBDA_TASK_ROOT}/migrations`); return { ok: 'migrate' }; }
  if (event?.joeAdmin === 'seed') { await seed(); return { ok: 'seed' }; }
  if (event?.joeAdmin === 'atualizar-precos-2026-09') { return { ok: await atualizarPrecosControlePedidos(getDb()) }; }
  if (event?.joeAdmin === 'correcoes-2026-09-27') { return { ok: await corrigirPrecos27_09(getDb()) }; }
  if (event?.joeAdmin === 'fracionado-carnes-2026-09-27') { return { ok: await habilitarFracionadoCarnes(getDb()) }; }
  if (event?.joeAdmin === 'normaliza-telefones-2026-09-27') { return { ok: await normalizarTelefones(getDb()) }; }
  return http(event as never, ctx);
};
