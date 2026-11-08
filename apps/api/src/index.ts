import { and, eq } from 'drizzle-orm';
import { handle } from 'hono/aws-lambda';
import { app } from './app';
import { getDb, schema as s } from './db/client';
import { importarClientes } from './db/import-clientes';
import { importarCustos } from './db/import-custos';
import { importarPedidos } from './db/import-pedidos';
import { runMigrations } from './db/migrate';
import { seed } from './db/seed';
import { corrigirPrecos27_09 } from './db/updates/2026-09-27-correcoes';
import { habilitarFracionadoCarnes } from './db/updates/2026-09-27-fracionado-carnes';
import { limparPedidosCancelados } from './db/updates/2026-09-27-limpa-pedidos-cancelados';
import { normalizarTelefones } from './db/updates/2026-09-27-normaliza-telefones';
import { religarPedido006 } from './db/updates/2026-09-27-religa-pedido-006';
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
  if (event?.joeAdmin === 'limpa-pedidos-cancelados-2026-09-27') { return { ok: await limparPedidosCancelados(getDb()) }; }
  if (event?.joeAdmin === 'religa-pedido-006-2026-09-27') { return { ok: await religarPedido006(getDb()) }; }
  if (event?.joeAdmin === 'importar-custos' && typeof event.csv === 'string') { return { ok: await importarCustos(getDb(), event.csv) }; }
  if (event?.joeAdmin === 'importar-clientes' && typeof event.csv === 'string') { return { ok: await importarClientes(getDb(), event.csv) }; }
  if (event?.joeAdmin === 'importar-pedidos' && typeof event.csv === 'string') { return { ok: await importarPedidos(getDb(), event.csv) }; }
  // Ajuste pontual de uma config (ex.: endereço do site) já semeada — seed() não sobrescreve o que já existe.
  if (event?.joeAdmin === 'config-set' && typeof event.chave === 'string') {
    const db = getDb();
    await db.insert(s.configuracoes).values({ chave: event.chave, valor: event.valor })
      .onConflictDoUpdate({ target: s.configuracoes.chave, set: { valor: event.valor } });
    return { ok: 'config-set', chave: event.chave };
  }
  if (event?.joeAdmin === 'config-get' && typeof event.chave === 'string') {
    const [r] = await getDb().select().from(s.configuracoes).where(eq(s.configuracoes.chave, event.chave));
    return { ok: 'config-get', valor: r?.valor ?? null };
  }
  // Apaga um pedido de teste (ex.: criado validando o /v1/public/pedidos) por número + data de operação.
  if (event?.joeAdmin === 'apaga-pedido-teste' && typeof event.numeroDia === 'number' && typeof event.dataOperacao === 'string') {
    const db = getDb();
    const [p] = await db.select().from(s.pedidos).where(and(eq(s.pedidos.numeroDia, event.numeroDia), eq(s.pedidos.dataOperacao, event.dataOperacao)));
    if (!p) return { ok: 'apaga-pedido-teste', achou: false };
    await db.delete(s.pagamentos).where(eq(s.pagamentos.pedidoId, p.id));
    await db.delete(s.pedidoStatusHistorico).where(eq(s.pedidoStatusHistorico.pedidoId, p.id));
    await db.delete(s.pedidoItens).where(eq(s.pedidoItens.pedidoId, p.id));
    await db.delete(s.pedidos).where(eq(s.pedidos.id, p.id));
    return { ok: 'apaga-pedido-teste', achou: true, nome: p.nomeClienteSnapshot };
  }
  return http(event as never, ctx);
};
