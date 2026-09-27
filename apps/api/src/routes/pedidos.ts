import { zValidator } from '@hono/zod-validator';
import { CANAIS, TIPOS_PEDIDO, STATUS_PEDIDO, FORMAS_PAGAMENTO, dataOperacaoLocal } from '@joe/shared';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { isAdmin, stripCustos, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';
import { atualizarItens, cancelarPedido, criarPedido, ErroNegocio, mudarStatus, registrarPagamento, resumoWhatsapp, STATUS_EDICAO_BLOQUEADA } from '../services/pedidos';

export const pedidos = new Hono<Env>();
const db = () => getDb();

const itemSchema = z.object({
  produtoId: z.uuid().optional(), comboVarianteId: z.uuid().optional(), quantidade: z.number().positive(),
  observacao: z.string().optional(), refrigeranteId: z.uuid().optional(), precoUnitario: z.number().min(0).optional(),
});
const pedidoSchema = z.object({
  clienteId: z.uuid().optional(), novoCliente: z.object({ nome: z.string().min(1), telefone: z.string().min(8).optional() }).optional(), nomeCliente: z.string().optional(),
  canal: z.enum(CANAIS).default('whatsapp'), tipo: z.enum(TIPOS_PEDIDO).default('retirada'), agendadoPara: z.iso.datetime({ offset: true }).optional(),
  itens: z.array(itemSchema).min(1), desconto: z.number().min(0).optional(), taxaEntrega: z.number().min(0).optional(), bairroId: z.uuid().optional(),
  enderecoTexto: z.string().optional(), referencia: z.string().optional(), trocoPara: z.number().min(0).optional(), observacoes: z.string().optional(),
  pagamentos: z.array(z.object({ forma: z.enum(FORMAS_PAGAMENTO), valor: z.number().positive() })).optional(),
});

/** Converte ErroNegocio em resposta padronizada. */
export function tratarErro(e: unknown, c: { json: (b: unknown, s: never) => Response }) {
  if (e instanceof ErroNegocio) return c.json({ error: { code: e.code, message: e.message } }, e.status as never);
  throw e;
}
pedidos.onError((e, c) => tratarErro(e, c as never));

pedidos.get('/pedidos', async (c) => {
  const data = c.req.query('data') ?? dataOperacaoLocal();
  const { status, tipo, canal, motoboyId } = c.req.query();
  const conds = [eq(s.pedidos.dataOperacao, data)];
  if (status) conds.push(eq(s.pedidos.status, status as never));
  if (tipo) conds.push(eq(s.pedidos.tipo, tipo as never));
  if (canal) conds.push(eq(s.pedidos.canal, canal as never));
  if (motoboyId) conds.push(eq(s.pedidos.motoboyId, motoboyId));
  if (c.req.query('pagamentoPendente') === 'true') conds.push(sql`${s.pedidos.statusPagamento} in ('pendente','parcial')`);
  const rows = await db().select({ p: s.pedidos, bairro: s.bairrosEntrega.nome }).from(s.pedidos)
    .leftJoin(s.bairrosEntrega, eq(s.bairrosEntrega.id, s.pedidos.bairroId)).where(and(...conds)).orderBy(asc(s.pedidos.numeroDia));
  const out = rows.map((r) => ({ ...r.p, bairro: r.bairro }));
  return c.json(isAdmin(c) ? out : stripCustos(out));
});

pedidos.post('/pedidos', zValidator('json', pedidoSchema), async (c) => {
  const p = await criarPedido(db(), c.req.valid('json'), c.get('user').nome);
  return c.json(p, 201);
});

async function carregar(id: string) {
  const [r] = await db().select({ p: s.pedidos, bairro: s.bairrosEntrega.nome }).from(s.pedidos)
    .leftJoin(s.bairrosEntrega, eq(s.bairrosEntrega.id, s.pedidos.bairroId)).where(eq(s.pedidos.id, id));
  if (!r) throw new ErroNegocio('nao_encontrado', 'Pedido não encontrado', 404);
  const [itens, historico, pags] = await Promise.all([
    db().select().from(s.pedidoItens).where(eq(s.pedidoItens.pedidoId, id)).orderBy(asc(s.pedidoItens.createdAt)),
    db().select().from(s.pedidoStatusHistorico).where(eq(s.pedidoStatusHistorico.pedidoId, id)).orderBy(asc(s.pedidoStatusHistorico.em)),
    db().select().from(s.pagamentos).where(eq(s.pagamentos.pedidoId, id)).orderBy(asc(s.pagamentos.recebidoEm)),
  ]);
  return { ...r.p, bairro: r.bairro, itens, historico, pagamentos: pags };
}

pedidos.get('/pedidos/:id', async (c) => {
  const p = await carregar(c.req.param('id'));
  return c.json(isAdmin(c) ? p : stripCustos(p));
});

const CAMPOS_LIVRES_MESMO_BLOQUEADO = ['motoboyId', 'clienteId'];
pedidos.patch('/pedidos/:id', zValidator('json', z.object({
  observacoes: z.string().nullish(), enderecoTexto: z.string().nullish(), referencia: z.string().nullish(), bairroId: z.uuid().nullish(), motoboyId: z.uuid().nullish(),
  clienteId: z.uuid().nullish(), taxaEntrega: z.number().min(0).optional(), desconto: z.number().min(0).optional(),
})), async (c) => {
  const id = c.req.param('id');
  const atual = await carregar(id);
  const b = c.req.valid('json');
  if (b.clienteId !== undefined && !isAdmin(c)) throw new ErroNegocio('forbidden', 'Apenas administradores religam o cliente do pedido', 403);
  const { taxaEntrega, desconto, ...resto } = b;
  const edicaoBloqueada = (STATUS_EDICAO_BLOQUEADA as readonly string[]).includes(atual.status);
  const soCampoLivre = Object.keys(resto).every((k) => CAMPOS_LIVRES_MESMO_BLOQUEADO.includes(k)) && Object.keys(resto).length > 0 && taxaEntrega === undefined && desconto === undefined;
  if (edicaoBloqueada && !soCampoLivre) throw new ErroNegocio('edicao_bloqueada', 'Pedido não pode mais ser editado');
  const set: Record<string, unknown> = { ...resto, updatedAt: new Date() };
  if (b.clienteId) {
    const [cliente] = await db().select().from(s.clientes).where(eq(s.clientes.id, b.clienteId));
    if (!cliente) throw new ErroNegocio('cliente_nao_encontrado', 'Cliente não encontrado', 404);
    set.nomeClienteSnapshot = cliente.nome; set.telefoneSnapshot = cliente.telefone;
    await db().insert(s.pedidoStatusHistorico).values({ pedidoId: id, de: atual.status, para: atual.status, usuario: c.get('user').nome, nota: `Religado ao cliente ${cliente.nome}` });
  }
  const nTaxa = taxaEntrega !== undefined ? taxaEntrega : Number(atual.taxaEntrega);
  const nDesc = desconto !== undefined ? desconto : Number(atual.desconto);
  if (taxaEntrega !== undefined) set.taxaEntrega = taxaEntrega.toFixed(2);
  if (desconto !== undefined) set.desconto = desconto.toFixed(2);
  if (taxaEntrega !== undefined || desconto !== undefined) {
    set.total = Math.max(0, Number(atual.subtotal) - nDesc + nTaxa).toFixed(2);
    await db().insert(s.pedidoStatusHistorico).values({ pedidoId: id, de: atual.status, para: atual.status, usuario: c.get('user').nome, nota: `Ajuste manual: taxa ${nTaxa.toFixed(2)}, desconto ${nDesc.toFixed(2)}` });
  }
  await db().update(s.pedidos).set(set).where(eq(s.pedidos.id, id));
  return c.json(await carregar(id));
});

pedidos.put('/pedidos/:id/itens', zValidator('json', z.array(itemSchema).min(1)), async (c) => {
  await atualizarItens(db(), c.req.param('id'), c.req.valid('json'), c.get('user').nome);
  const p = await carregar(c.req.param('id'));
  return c.json(isAdmin(c) ? p : stripCustos(p));
});

pedidos.post('/pedidos/:id/status', zValidator('json', z.object({ para: z.enum(STATUS_PEDIDO) })), async (c) => {
  await mudarStatus(db(), c.req.param('id'), c.req.valid('json').para, c.get('user').nome);
  return c.json({ ok: true });
});

pedidos.post('/pedidos/:id/cancelar', zValidator('json', z.object({ motivo: z.string().min(1) })), async (c) => {
  await cancelarPedido(db(), c.req.param('id'), c.req.valid('json').motivo, c.get('user').nome);
  return c.json({ ok: true });
});

pedidos.post('/pedidos/:id/pagamentos', zValidator('json', z.object({ forma: z.enum(FORMAS_PAGAMENTO), valor: z.number().positive() })), async (c) => {
  const { forma, valor } = c.req.valid('json');
  return c.json({ statusPagamento: await registrarPagamento(db(), c.req.param('id'), forma, valor) }, 201);
});

pedidos.get('/pedidos/:id/comanda', async (c) => c.json(stripCustos(await carregar(c.req.param('id')))));

pedidos.get('/pedidos/:id/resumo-whatsapp', async (c) => {
  const p = await carregar(c.req.param('id'));
  return c.json({ texto: resumoWhatsapp(p, p.itens, p.bairro) });
});

/* ---------- Produção e Agenda ---------- */
pedidos.get('/producao', async (c) => {
  const data = c.req.query('data') ?? dataOperacaoLocal();
  const ps = await db().select({ id: s.pedidos.id }).from(s.pedidos).where(and(eq(s.pedidos.dataOperacao, data), sql`${s.pedidos.status} not in ('cancelado','rascunho')`));
  if (!ps.length) return c.json({ data, pedidos: 0, produtos: [], insumos: [] });
  const [itens, variantes, comboItens, prods, ficha, insumos] = await Promise.all([
    db().select().from(s.pedidoItens).where(sql`${s.pedidoItens.pedidoId} in ${ps.map((p) => p.id)}`),
    db().select().from(s.comboVariantes), db().select().from(s.comboItens), db().select().from(s.produtos), db().select().from(s.fichaTecnica), db().select().from(s.insumos),
  ]);
  const nec = new Map<string, number>();
  const add = (id: string, q: number) => nec.set(id, (nec.get(id) ?? 0) + q);
  for (const it of itens) {
    const q = Number(it.quantidade);
    if (it.produtoId) add(it.produtoId, q);
    if (it.comboVarianteId) {
      const v = variantes.find((x) => x.id === it.comboVarianteId)!;
      const refri = (it.escolhas as { refrigeranteId?: string } | null)?.refrigeranteId;
      for (const ci of comboItens.filter((x) => x.comboId === v.comboId)) {
        const pid = ci.ehCarneEscolhida ? v.carneProdutoId : ci.grupoEscolha === 'refrigerante' && refri ? refri : ci.produtoId;
        if (pid) add(pid, q * Number(ci.quantidade));
      }
    }
  }
  const nomeP = new Map(prods.map((p) => [p.id, p]));
  const produtos = [...nec].map(([id, quantidade]) => ({ produtoId: id, nome: nomeP.get(id)!.nome, categoria: nomeP.get(id)!.categoria, unidade: nomeP.get(id)!.unidadeVenda, quantidade }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
  // Necessidade de insumos pela ficha técnica (equivale a quantidade ÷ fator de rendimento).
  const ins = new Map<string, number>();
  for (const f of ficha) { const q = nec.get(f.produtoId); if (q) ins.set(f.insumoId, (ins.get(f.insumoId) ?? 0) + q * Number(f.quantidadeInsumo)); }
  const nomeI = new Map(insumos.map((i) => [i.id, i]));
  const insumosOut = [...ins].map(([id, quantidade]) => ({ insumoId: id, nome: nomeI.get(id)!.nome, unidade: nomeI.get(id)!.unidadeCompra, quantidade: Math.round(quantidade * 1000) / 1000 }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return c.json({ data, pedidos: ps.length, produtos, insumos: insumosOut });
});

pedidos.get('/agenda', async (c) => {
  const de = c.req.query('de') ?? dataOperacaoLocal();
  const ate = c.req.query('ate') ?? de;
  const rows = await db().select().from(s.pedidos).where(and(gte(s.pedidos.dataOperacao, de), sql`${s.pedidos.dataOperacao} <= ${ate}`, sql`${s.pedidos.agendadoPara} is not null`, sql`${s.pedidos.status} <> 'cancelado'`)).orderBy(asc(s.pedidos.agendadoPara));
  const dias = new Map<string, { data: string; totalPrevisto: number; pedidos: typeof rows }>();
  for (const p of rows) {
    const d = dias.get(p.dataOperacao) ?? { data: p.dataOperacao, totalPrevisto: 0, pedidos: [] };
    d.pedidos.push(p); d.totalPrevisto += Number(p.total); dias.set(p.dataOperacao, d);
  }
  return c.json([...dias.values()]);
});
void desc; void lt;
