import { toCents, fromCents } from '@joe/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schema as s } from '../db/client';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** `percentualOuValor` é bruto (não centavos): 5 = 5% se "percentual", ou um valor em R$ se "fixo"
 * (esse sim convertido pra centavos aqui, já que nesse caso é dinheiro de verdade). */
export function calcularComissaoCents(tipoComissao: 'percentual' | 'fixo', percentualOuValor: number, valorBaseCents: number): number {
  if (tipoComissao === 'fixo') return toCents(percentualOuValor);
  return Math.round((valorBaseCents * percentualOuValor) / 100);
}

/**
 * Cria ou atualiza a comissão do pedido a partir do vendedor/valores atuais — chamada sempre que o
 * pedido muda (confirmado, itens editados, cancelado). Nunca sobrescreve `valorFinal`/`status` quando
 * já existe uma linha (ajuste manual do admin é definitivo); só reage automaticamente: sem vendedor,
 * ou pedido cancelado/recusado → cancela a comissão existente (nunca apaga, fica no histórico).
 */
export async function sincronizarComissao(tx: Tx, pedidoId: string) {
  const [p] = await tx.select().from(s.pedidos).where(eq(s.pedidos.id, pedidoId));
  if (!p) return;
  const [existente] = await tx.select().from(s.comissoes).where(eq(s.comissoes.pedidoId, pedidoId));

  if (!p.vendedorId || p.status === 'cancelado' || p.status === 'recusado') {
    if (existente && existente.status !== 'cancelada') {
      await tx.update(s.comissoes).set({ status: 'cancelada', updatedAt: new Date() }).where(eq(s.comissoes.id, existente.id));
    }
    return;
  }
  // Só gera/recalcula quando o pedido já foi de fato vendido — rascunho e pré-pedido do site
  // (aguardando_confirmacao) ainda não "contam" como venda pra fins de comissão.
  if (p.status === 'rascunho' || p.status === 'aguardando_confirmacao') return;

  const [vendedor] = await tx.select().from(s.vendedores).where(eq(s.vendedores.id, p.vendedorId));
  if (!vendedor || !vendedor.ativo) return;

  const valorBaseCents = toCents(p.subtotal) - toCents(p.desconto);
  const valorCalculadoCents = calcularComissaoCents(vendedor.tipoComissao, Number(vendedor.valorComissao), valorBaseCents);
  const campos = {
    vendedorId: vendedor.id, valorBase: fromCents(valorBaseCents), tipoComissao: vendedor.tipoComissao,
    percentualOuValor: vendedor.valorComissao, valorCalculado: fromCents(valorCalculadoCents),
  };
  if (!existente) {
    await tx.insert(s.comissoes).values({ pedidoId, ...campos });
  } else {
    // Reativa se tinha sido cancelada automaticamente antes (ex.: vendedor removido e depois religado).
    await tx.update(s.comissoes).set({ ...campos, status: existente.status === 'cancelada' ? 'pendente' : existente.status, updatedAt: new Date() }).where(eq(s.comissoes.id, existente.id));
  }
}
