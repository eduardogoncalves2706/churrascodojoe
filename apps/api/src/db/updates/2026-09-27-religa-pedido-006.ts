import { desc, eq } from 'drizzle-orm';
import { encontrarOuCriarCliente } from '../../services/clientes';
import type { Db } from '../client';
import { schema as s } from '../client';

/** Cria (se não existir) o cliente "Marcia / André" e religa o pedido #6 a ele. Idempotente. */
export async function religarPedido006(db: Db) {
  const { cliente, novo } = await encontrarOuCriarCliente(db, { nome: 'Marcia / André' });
  const [pedido] = await db.select().from(s.pedidos).where(eq(s.pedidos.numeroDia, 6)).orderBy(desc(s.pedidos.dataOperacao)).limit(1);
  if (!pedido) return { ok: false, motivo: 'pedido #6 não encontrado nesta data de operação' };
  if (pedido.clienteId === cliente.id) return { ok: true, jaEstavaLigado: true, clienteId: cliente.id, clienteNovo: novo };
  await db.update(s.pedidos).set({ clienteId: cliente.id, nomeClienteSnapshot: cliente.nome, updatedAt: new Date() }).where(eq(s.pedidos.id, pedido.id));
  await db.insert(s.pedidoStatusHistorico).values({ pedidoId: pedido.id, de: pedido.status, para: pedido.status, usuario: 'sistema', nota: `Religado ao cliente ${cliente.nome}` });
  return { ok: true, jaEstavaLigado: false, clienteId: cliente.id, clienteNovo: novo };
}
