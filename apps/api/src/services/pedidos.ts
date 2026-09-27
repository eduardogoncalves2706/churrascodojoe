import { toCents, fromCents, STATUS_PEDIDO, dataOperacaoLocal } from '@joe/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schema as s } from '../db/client';
import { custoVariante, custosProdutos } from './custos';

export interface ItemInput {
  produtoId?: string; comboVarianteId?: string; quantidade: number; observacao?: string;
  refrigeranteId?: string; precoUnitario?: number;
}
export interface PedidoInput {
  clienteId?: string; novoCliente?: { nome: string; telefone: string }; nomeCliente?: string;
  canal: 'whatsapp' | 'instagram' | 'balcao' | 'telefone' | 'outro'; tipo: 'entrega' | 'retirada';
  agendadoPara?: string; itens: ItemInput[]; desconto?: number; taxaEntrega?: number; bairroId?: string;
  enderecoTexto?: string; referencia?: string; trocoPara?: number; observacoes?: string;
  pagamentos?: { forma: 'pix' | 'dinheiro' | 'credito' | 'debito' | 'outro'; valor: number }[];
}

export class ErroNegocio extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function statusPagamentoDe(totalCents: number, pagoCents: number) {
  if (pagoCents <= 0) return 'pendente' as const;
  return pagoCents >= totalCents ? ('pago' as const) : ('parcial' as const);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function criarPedido(db: Db, input: PedidoInput, usuario: string) {
  if (!input.itens.length) throw new ErroNegocio('sem_itens', 'O pedido precisa de ao menos um item');
  const custos = await custosProdutos(db);
  const agendado = input.agendadoPara ? new Date(input.agendadoPara) : null;
  const dataOperacao = dataOperacaoLocal(agendado ?? new Date());

  return db.transaction(async (tx: Tx) => {
    let clienteId = input.clienteId ?? null;
    let nome = input.nomeCliente ?? null;
    let telefone: string | null = null;
    if (!clienteId && input.novoCliente) {
      const [c] = await tx.insert(s.clientes).values(input.novoCliente).onConflictDoUpdate({ target: s.clientes.telefone, set: { nome: input.novoCliente.nome } }).returning();
      clienteId = c.id;
    }
    if (clienteId) {
      const [c] = await tx.select().from(s.clientes).where(eq(s.clientes.id, clienteId));
      if (!c) throw new ErroNegocio('cliente_nao_encontrado', 'Cliente não encontrado', 404);
      nome = c.nome; telefone = c.telefone;
    }

    let taxa = toCents(input.taxaEntrega ?? 0);
    if (input.tipo === 'entrega' && input.taxaEntrega == null && input.bairroId) {
      const [b] = await tx.select().from(s.bairrosEntrega).where(eq(s.bairrosEntrega.id, input.bairroId));
      taxa = b ? toCents(b.taxaEntrega) : 0;
    }
    if (input.tipo === 'retirada') taxa = 0;

    let subtotal = 0; let custoTotal = 0; let custoCompleto = true;
    const linhas: (typeof s.pedidoItens.$inferInsert)[] = [];
    for (const it of input.itens) {
      if (!(it.quantidade > 0)) throw new ErroNegocio('quantidade_invalida', 'Quantidade inválida');
      let preco = 0; let custo: number | null = null; let descricao = ''; let escolhas: unknown = null;
      if (it.comboVarianteId) {
        const [v] = await tx.select().from(s.comboVariantes).where(eq(s.comboVariantes.id, it.comboVarianteId));
        if (!v || !v.ativo) throw new ErroNegocio('combo_invalido', 'Variante de combo inválida');
        const [combo] = await tx.select().from(s.combos).where(eq(s.combos.id, v.comboId));
        const [carne] = await tx.select().from(s.produtos).where(eq(s.produtos.id, v.carneProdutoId));
        const itensCombo = await tx.select().from(s.comboItens).where(eq(s.comboItens.comboId, v.comboId));
        preco = toCents(v.preco);
        custo = custoVariante(itensCombo, v.carneProdutoId, custos, it.refrigeranteId);
        descricao = `${combo.nome} – ${carne.nome}`;
        if (it.refrigeranteId) {
          const [r] = await tx.select().from(s.produtos).where(eq(s.produtos.id, it.refrigeranteId));
          if (r) descricao += ` · Refri: ${r.nome}`;
          escolhas = { refrigeranteId: it.refrigeranteId };
        }
      } else if (it.produtoId) {
        const [p] = await tx.select().from(s.produtos).where(eq(s.produtos.id, it.produtoId));
        if (!p || !p.ativo) throw new ErroNegocio('produto_invalido', 'Produto inválido');
        if (!p.permiteFracionado && !Number.isInteger(it.quantidade)) throw new ErroNegocio('fracionado', `${p.nome} não permite quantidade fracionada`);
        preco = p.vendidoAPrecoDeCusto && it.precoUnitario != null ? toCents(it.precoUnitario) : toCents(p.precoVenda);
        custo = p.vendidoAPrecoDeCusto ? preco : custos.get(p.id) ?? null;
        descricao = p.nome;
      } else throw new ErroNegocio('item_invalido', 'Informe produto ou combo');
      const sub = Math.round(preco * it.quantidade);
      subtotal += sub;
      if (custo == null) custoCompleto = false; else custoTotal += Math.round(custo * it.quantidade);
      linhas.push({
        pedidoId: '', produtoId: it.produtoId ?? null, comboVarianteId: it.comboVarianteId ?? null, descricaoSnapshot: descricao,
        quantidade: String(it.quantidade), precoUnitarioSnapshot: fromCents(preco), custoUnitarioSnapshot: custo == null ? null : fromCents(custo),
        subtotal: fromCents(sub), escolhas, observacao: it.observacao ?? null,
      });
    }
    const desconto = toCents(input.desconto ?? 0);
    const total = Math.max(0, subtotal - desconto + taxa);
    const pagos = (input.pagamentos ?? []).reduce((a, p) => a + toCents(p.valor), 0);

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${dataOperacao}))`);
    const [{ prox }] = await tx.select({ prox: sql<number>`coalesce(max(${s.pedidos.numeroDia}),0)+1` }).from(s.pedidos).where(eq(s.pedidos.dataOperacao, dataOperacao));

    const [pedido] = await tx.insert(s.pedidos).values({
      numeroDia: Number(prox), dataOperacao, clienteId, nomeClienteSnapshot: nome, telefoneSnapshot: telefone, canal: input.canal, tipo: input.tipo,
      agendadoPara: agendado, status: 'confirmado', enderecoTexto: input.enderecoTexto, bairroId: input.bairroId, referencia: input.referencia,
      subtotal: fromCents(subtotal), desconto: fromCents(desconto), taxaEntrega: fromCents(taxa), total: fromCents(total),
      custoTotal: custoCompleto ? fromCents(custoTotal) : null, statusPagamento: statusPagamentoDe(total, pagos),
      trocoPara: input.trocoPara != null ? fromCents(toCents(input.trocoPara)) : null, observacoes: input.observacoes, createdBy: usuario,
    }).returning();
    await tx.insert(s.pedidoItens).values(linhas.map((l) => ({ ...l, pedidoId: pedido.id })));
    await tx.insert(s.pedidoStatusHistorico).values({ pedidoId: pedido.id, de: null, para: 'confirmado', usuario });
    for (const p of input.pagamentos ?? []) {
      await tx.insert(s.pagamentos).values({ pedidoId: pedido.id, forma: p.forma, valor: fromCents(toCents(p.valor)) });
    }
    return pedido;
  });
}

export async function registrarPagamento(db: Db, pedidoId: string, forma: 'pix' | 'dinheiro' | 'credito' | 'debito' | 'outro', valor: number) {
  return db.transaction(async (tx: Tx) => {
    const [p] = await tx.select().from(s.pedidos).where(eq(s.pedidos.id, pedidoId));
    if (!p) throw new ErroNegocio('nao_encontrado', 'Pedido não encontrado', 404);
    if (p.status === 'cancelado') throw new ErroNegocio('cancelado', 'Pedido cancelado');
    await tx.insert(s.pagamentos).values({ pedidoId, forma, valor: fromCents(toCents(valor)) });
    const pagos = await tx.select({ v: sql<string>`coalesce(sum(valor),0)` }).from(s.pagamentos).where(eq(s.pagamentos.pedidoId, pedidoId));
    const sp = statusPagamentoDe(toCents(p.total), toCents(pagos[0].v));
    await tx.update(s.pedidos).set({ statusPagamento: sp, updatedAt: new Date() }).where(eq(s.pedidos.id, pedidoId));
    return sp;
  });
}

export async function mudarStatus(db: Db, pedidoId: string, para: string, usuario: string, nota?: string) {
  if (!(STATUS_PEDIDO as readonly string[]).includes(para)) throw new ErroNegocio('status_invalido', 'Status inválido');
  return db.transaction(async (tx: Tx) => {
    const [p] = await tx.select().from(s.pedidos).where(eq(s.pedidos.id, pedidoId));
    if (!p) throw new ErroNegocio('nao_encontrado', 'Pedido não encontrado', 404);
    if (p.status === 'cancelado') throw new ErroNegocio('cancelado', 'Pedido cancelado não muda de status');
    if (para === 'saiu_entrega' && p.tipo !== 'entrega') throw new ErroNegocio('status_invalido', 'Retirada não sai para entrega');
    if ((para === 'retirado') && p.tipo !== 'retirada') throw new ErroNegocio('status_invalido', 'Entrega não é retirada');
    await tx.update(s.pedidos).set({ status: para as never, updatedAt: new Date() }).where(eq(s.pedidos.id, pedidoId));
    await tx.insert(s.pedidoStatusHistorico).values({ pedidoId, de: p.status, para, usuario, nota });
  });
}

export async function cancelarPedido(db: Db, pedidoId: string, motivo: string, usuario: string) {
  if (!motivo.trim()) throw new ErroNegocio('motivo_obrigatorio', 'Motivo do cancelamento é obrigatório');
  return db.transaction(async (tx: Tx) => {
    const [p] = await tx.select().from(s.pedidos).where(eq(s.pedidos.id, pedidoId));
    if (!p) throw new ErroNegocio('nao_encontrado', 'Pedido não encontrado', 404);
    if (p.status === 'cancelado') return;
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.pagamentos).where(eq(s.pagamentos.pedidoId, pedidoId));
    await tx.update(s.pedidos).set({
      status: 'cancelado', motivoCancelamento: motivo, statusPagamento: n > 0 ? 'estornado' : p.statusPagamento, updatedAt: new Date(),
    }).where(and(eq(s.pedidos.id, pedidoId)));
    await tx.insert(s.pedidoStatusHistorico).values({ pedidoId, de: p.status, para: 'cancelado', usuario, nota: motivo });
    // TODO(fase 4): estornar lançamentos financeiros dos pagamentos.
  });
}

export function resumoWhatsapp(p: typeof s.pedidos.$inferSelect, itens: (typeof s.pedidoItens.$inferSelect)[], bairro?: string | null): string {
  const brl = (v: string) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
  const linhas = [`*Churrasco do Joe — Pedido #${String(p.numeroDia).padStart(3, '0')}*`, ''];
  for (const i of itens) linhas.push(`${Number(i.quantidade)}x ${i.descricaoSnapshot} — ${brl(i.subtotal)}${i.observacao ? ` (${i.observacao})` : ''}`);
  linhas.push('');
  if (Number(p.desconto) > 0) linhas.push(`Desconto: -${brl(p.desconto)}`);
  if (p.tipo === 'entrega') linhas.push(`Entrega: ${brl(p.taxaEntrega)}`);
  linhas.push(`*Total: ${brl(p.total)}*`);
  linhas.push(p.tipo === 'entrega' ? `📍 ${p.enderecoTexto ?? ''}${bairro ? ` — ${bairro}` : ''}${p.referencia ? ` (${p.referencia})` : ''}` : '🏪 Retirada no ponto');
  if (p.agendadoPara) linhas.push(`🗓️ Agendado: ${new Date(p.agendadoPara).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`);
  return linhas.join('\n');
}
