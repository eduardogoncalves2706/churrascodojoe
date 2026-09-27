import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { schema as s } from '../client';

/** Remove definitivamente os pedidos cancelados (testes feitos ao validar o sistema). Idempotente. */
export async function limparPedidosCancelados(db: Db) {
  const cancelados = await db.select({ id: s.pedidos.id, numeroDia: s.pedidos.numeroDia, nome: s.pedidos.nomeClienteSnapshot }).from(s.pedidos).where(eq(s.pedidos.status, 'cancelado'));
  for (const p of cancelados) {
    await db.delete(s.pagamentos).where(eq(s.pagamentos.pedidoId, p.id));
    await db.delete(s.pedidoStatusHistorico).where(eq(s.pedidoStatusHistorico.pedidoId, p.id));
    await db.delete(s.pedidoItens).where(eq(s.pedidoItens.pedidoId, p.id));
    await db.delete(s.pedidos).where(eq(s.pedidos.id, p.id));
  }
  return { removidos: cancelados.map((p) => `#${String(p.numeroDia).padStart(3, '0')} ${p.nome ?? ''}`.trim()) };
}
