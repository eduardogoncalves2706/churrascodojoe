import { zValidator } from '@hono/zod-validator';
import { dataOperacaoLocal, formatBRL, toCents, type Canal } from '@joe/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { custosProdutos } from '../services/custos';
import { criarPedido, ErroNegocio, resumoWhatsappCliente } from '../services/pedidos';

export const publicRoutes = new Hono();
const db = () => getDb();

publicRoutes.onError((e, c) => {
  if (e instanceof ErroNegocio) return c.json({ error: { code: e.code, message: e.message } }, e.status as never);
  console.error(e.message);
  return c.json({ error: { code: 'erro_interno', message: 'Erro interno' } }, 500);
});

async function config<T>(chave: string, padrao: T): Promise<T> {
  const [r] = await db().select().from(s.configuracoes).where(eq(s.configuracoes.chave, chave));
  return r ? (r.valor as T) : padrao;
}

/** Aberto agora = hoje é dia de operação e a hora local está dentro do horário configurado. */
async function calcularStatus() {
  const horario = await config('horario_pico', { inicio: 11, fim: 14 });
  const dias = await config('dias_operacao', ['sab', 'dom']);
  const agora = new Date();
  const fmt = (opt: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opt }).format(agora);
  const diaSemana = { sáb: 'sab', dom: 'dom', seg: 'seg', ter: 'ter', qua: 'qua', qui: 'qui', sex: 'sex' }[fmt({ weekday: 'short' }).replace('.', '')] ?? 'seg';
  const hora = Number(fmt({ hour: '2-digit', hour12: false }));
  const diaDeOperacao = (dias as string[]).includes(diaSemana);
  const aberto = diaDeOperacao && hora >= horario.inicio && hora < horario.fim;
  return {
    aberto,
    mensagem: aberto ? `Aberto agora — pedidos até ${horario.fim}h` : diaDeOperacao ? `Fechado agora — hoje das ${horario.inicio}h às ${horario.fim}h` : 'Fechado — funcionamos aos sábados, domingos e feriados, das 11h às 14h',
    horario, diasOperacao: dias,
  };
}

publicRoutes.get('/status', async (c) => {
  const r = await calcularStatus();
  return c.body(JSON.stringify(r), 200, { 'Cache-Control': 'max-age=30', 'content-type': 'application/json' });
});

publicRoutes.get('/site', async (c) => {
  const [whatsapp, instagram, horarioTexto, enderecoModo, enderecoTexto, enderecoMapsUrl, cnpj, razaoSocial, aceitaPedidos, regiaoEntrega, faq, parceiros] = await Promise.all([
    config('site_whatsapp', ''), config('site_instagram', ''),
    config('site_horario_texto', 'Sábados, domingos e feriados, das 11h às 14h. Encomendas podem ser feitas a qualquer momento durante a semana, para entrega no fim de semana.'),
    config('site_endereco_modo', 'completo'), config('site_endereco_texto', ''), config('site_endereco_maps_url', ''),
    config('site_cnpj', ''), config('site_razao_social', ''),
    config('site_aceita_pedidos_site', true), config('site_regiao_entrega_texto', 'Canoas e Região Metropolitana'),
    config('site_faq', [
      { pergunta: 'Funcionam durante a semana?', resposta: 'A operação é só sábados, domingos e feriados, mas você pode encomendar durante a semana pelo WhatsApp para retirar ou receber no fim de semana.' },
      { pergunta: 'Qual a área de entrega?', resposta: 'Canoas e região metropolitana. Confirmamos o valor da entrega pelo WhatsApp conforme o endereço.' },
      { pergunta: 'Posso encomendar para outro dia?', resposta: 'Sim! É só chamar no WhatsApp e combinar o dia e horário.' },
      { pergunta: 'Quais formas de pagamento?', resposta: 'Pix, dinheiro (com troco) ou cartão na entrega/retirada.' },
    ]),
    config('site_parceiros', [{ nome: 'Doces by Nick', instagram: null }, { nome: 'King of Geleia', instagram: null }]),
  ]);
  return c.body(JSON.stringify({
    whatsapp, instagram, horarioTexto, endereco: { modo: enderecoModo, texto: enderecoTexto || null, mapsUrl: enderecoMapsUrl || null }, cnpj: cnpj || null, razaoSocial: razaoSocial || null,
    aceitaPedidosSite: aceitaPedidos, regiaoEntregaTexto: regiaoEntrega, faq, parceiros,
  }), 200, { 'Cache-Control': 'max-age=300', 'content-type': 'application/json' });
});

publicRoutes.get('/cardapio', async (c) => {
  const [produtos, custos, combos, comboItensRows, comboVariantesRows] = await Promise.all([
    db().select().from(s.produtos).where(and(eq(s.produtos.ativo, true), eq(s.produtos.visivelSite, true))),
    custosProdutos(db()),
    db().select().from(s.combos).where(and(eq(s.combos.ativo, true), eq(s.combos.visivelSite, true))),
    db().select().from(s.comboItens), db().select().from(s.comboVariantes),
  ]);
  void custos; // custo nunca sai numa rota pública — só usado internamente, nunca no payload
  const nomeProd = new Map(produtos.map((p) => [p.id, p.nome]));
  const produtosPublicos = produtos.map((p) => ({
    id: p.id, categoria: p.categoria, nome: p.nome, descricaoCurta: p.descricaoCurta, unidadeVenda: p.unidadeVenda,
    precoCents: toCents(p.precoVenda), imagemKey: p.imagemKey, disponivelHoje: p.disponivelHoje, permiteFracionado: p.permiteFracionado,
    parceiro: p.parceiro, vendidoAPrecoDeCusto: p.vendidoAPrecoDeCusto, destaque: p.destaqueSite, ordem: p.ordemSite,
  })).sort((a, b) => a.ordem - b.ordem);
  const combosPublicos = combos.map((cb) => {
    const itens = comboItensRows.filter((i) => i.comboId === cb.id);
    return {
      id: cb.id, nome: cb.nome, descricaoCurta: cb.descricaoCurta, pessoas: cb.pessoas, imagemKey: cb.imagemKey,
      itens: itens.map((i) => ({ nome: i.ehCarneEscolhida ? 'Carne escolhida' : nomeProd.get(i.produtoId!) ?? '', quantidade: Number(i.quantidade), grupoEscolha: i.grupoEscolha })),
      variantes: comboVariantesRows.filter((v) => v.comboId === cb.id && v.ativo).map((v) => ({ id: v.id, carne: nomeProd.get(v.carneProdutoId) ?? '', precoCents: toCents(v.preco) })),
    };
  }).sort((a, b) => a.pessoas - b.pessoas);
  return c.body(JSON.stringify({ produtos: produtosPublicos, combos: combosPublicos }), 200, { 'Cache-Control': 'max-age=60', 'content-type': 'application/json' });
});

publicRoutes.get('/bairros', async (c) => {
  const rows = await db().select().from(s.bairrosEntrega).where(and(eq(s.bairrosEntrega.atende, true), eq(s.bairrosEntrega.visivelSite, true)));
  const out = rows.map((b) => ({ id: b.id, nome: b.nome, cidade: b.cidade, taxaCents: toCents(b.taxaEntrega) }));
  return c.body(JSON.stringify(out), 200, { 'Cache-Control': 'max-age=300', 'content-type': 'application/json' });
});

/* ---------- Antispam simples: honeypot + limite por telefone ---------- */
const itemSchema = z.object({ produtoId: z.uuid().optional(), comboVarianteId: z.uuid().optional(), quantidade: z.number().positive(), observacao: z.string().max(200).optional(), refrigeranteId: z.uuid().optional() });
const pedidoPublicoSchema = z.object({
  nome: z.string().min(1).max(120), telefone: z.string().min(10).max(20), site: z.string().max(0).optional(), // "site" = honeypot, deve vir vazio
  tipo: z.enum(['entrega', 'retirada']), bairroId: z.uuid().optional(), enderecoTexto: z.string().max(300).optional(), referencia: z.string().max(200).optional(),
  agendadoPara: z.iso.datetime({ offset: true }).optional(), itens: z.array(itemSchema).min(1), formaPagamento: z.string().max(30).optional(), observacoes: z.string().max(300).optional(),
});

publicRoutes.post('/pedidos', zValidator('json', pedidoPublicoSchema), async (c) => {
  const b = c.req.valid('json');
  if (b.site) return c.json({ error: { code: 'invalido', message: 'Requisição inválida' } }, 400); // honeypot preenchido = bot

  const digitos = b.telefone.replace(/\D/g, '');
  const dataOp = dataOperacaoLocal(b.agendadoPara ? new Date(b.agendadoPara) : new Date());
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(s.pedidos)
    .where(and(eq(s.pedidos.canal, 'site'), eq(s.pedidos.telefoneSnapshot, digitos.startsWith('55') ? `+${digitos}` : `+55${digitos}`), gte(s.pedidos.createdAt, umaHoraAtras)));
  if (n >= 3) throw new ErroNegocio('limite_pedidos', 'Muitos pedidos recentes com esse telefone. Chama no WhatsApp que a gente ajuda.', 429);

  const pedido = await criarPedido(db(), {
    novoCliente: { nome: b.nome, telefone: b.telefone }, canal: 'site' as Canal, tipo: b.tipo,
    agendadoPara: b.agendadoPara, itens: b.itens, bairroId: b.bairroId, enderecoTexto: b.enderecoTexto, referencia: b.referencia,
    observacoes: [b.observacoes, b.formaPagamento ? `Pagamento pretendido: ${b.formaPagamento}` : null].filter(Boolean).join(' · ') || undefined,
  }, 'site', 'aguardando_confirmacao');

  const [itens, bairro, whatsappLoja] = await Promise.all([
    db().select().from(s.pedidoItens).where(eq(s.pedidoItens.pedidoId, pedido.id)),
    pedido.bairroId ? db().select().from(s.bairrosEntrega).where(eq(s.bairrosEntrega.id, pedido.bairroId)) : Promise.resolve([]),
    config('site_whatsapp', ''),
  ]);
  const texto = resumoWhatsappCliente(pedido, itens, bairro[0]?.nome, b.formaPagamento);
  return c.json({
    numero: pedido.numeroDia, dataOperacao: pedido.dataOperacao, totalCents: toCents(pedido.total), totalFormatado: formatBRL(toCents(pedido.total)),
    textoWhatsapp: texto, whatsappUrl: whatsappLoja ? `https://wa.me/55${whatsappLoja.replace(/\D/g, '').replace(/^55/, '')}?text=${encodeURIComponent(texto)}` : null,
  }, 201);
});
