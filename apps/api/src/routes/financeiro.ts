import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';
import { calcularRateio, periodoPadrao } from '../services/rateio';

export const financeiro = new Hono<Env>();
const db = () => getDb();
financeiro.use('*', requireAdmin); // Financeiro é todo admin-only

/* ---------- Contas ---------- */
financeiro.get('/contas', async (c) => c.json(await db().select().from(s.contasFinanceiras).orderBy(asc(s.contasFinanceiras.nome))));
const contaBody = z.object({ nome: z.string().min(1), tipo: z.enum(s.tipoContaEnum.enumValues), saldoInicial: z.number().default(0) });
financeiro.post('/contas', zValidator('json', contaBody), async (c) => {
  const b = c.req.valid('json');
  return c.json((await db().insert(s.contasFinanceiras).values({ ...b, saldoInicial: b.saldoInicial.toFixed(2) }).returning())[0], 201);
});
financeiro.patch('/contas/:id', zValidator('json', contaBody.partial().extend({ ativo: z.boolean().optional() })), async (c) => {
  const { saldoInicial, ...b } = c.req.valid('json');
  return c.json((await db().update(s.contasFinanceiras).set({ ...b, ...(saldoInicial !== undefined ? { saldoInicial: saldoInicial.toFixed(2) } : {}), updatedAt: new Date() }).where(eq(s.contasFinanceiras.id, c.req.param('id'))).returning())[0]);
});

/* ---------- Categorias ---------- */
financeiro.get('/categorias', async (c) => c.json(await db().select().from(s.categoriasFinanceiras).orderBy(asc(s.categoriasFinanceiras.nome))));
const categoriaBody = z.object({ nome: z.string().min(1), tipo: z.enum(s.tipoCategoriaEnum.enumValues), grupoDre: z.enum(s.grupoDreEnum.enumValues), rateavel: z.boolean().default(false) });
financeiro.post('/categorias', zValidator('json', categoriaBody), async (c) => c.json((await db().insert(s.categoriasFinanceiras).values(c.req.valid('json')).returning())[0], 201));
financeiro.patch('/categorias/:id', zValidator('json', categoriaBody.partial().extend({ ativo: z.boolean().optional() })), async (c) =>
  c.json((await db().update(s.categoriasFinanceiras).set({ ...c.req.valid('json'), updatedAt: new Date() }).where(eq(s.categoriasFinanceiras.id, c.req.param('id'))).returning())[0]));

/* ---------- Lançamentos ---------- */
financeiro.get('/lancamentos', async (c) => {
  const { de, ate, status, categoriaId, contaId } = c.req.query();
  const conds = [];
  if (de) conds.push(gte(s.lancamentos.dataCompetencia, de));
  if (ate) conds.push(lte(s.lancamentos.dataCompetencia, ate));
  if (status) conds.push(eq(s.lancamentos.status, status as never));
  if (categoriaId) conds.push(eq(s.lancamentos.categoriaId, categoriaId));
  if (contaId) conds.push(eq(s.lancamentos.contaId, contaId));
  const rows = await db().select({ l: s.lancamentos, categoria: s.categoriasFinanceiras.nome, grupoDre: s.categoriasFinanceiras.grupoDre, conta: s.contasFinanceiras.nome })
    .from(s.lancamentos).innerJoin(s.categoriasFinanceiras, eq(s.categoriasFinanceiras.id, s.lancamentos.categoriaId)).innerJoin(s.contasFinanceiras, eq(s.contasFinanceiras.id, s.lancamentos.contaId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(s.lancamentos.dataVencimento)).limit(200);
  return c.json(rows.map((r) => ({ ...r.l, categoria: r.categoria, grupoDre: r.grupoDre, conta: r.conta })));
});

const lancamentoBody = z.object({
  tipo: z.enum(s.tipoLancamentoEnum.enumValues), categoriaId: z.uuid(), contaId: z.uuid(), contaDestinoId: z.uuid().nullish(),
  descricao: z.string().min(1), valor: z.number().positive(), dataCompetencia: z.iso.date(), dataVencimento: z.iso.date(),
  dataPagamento: z.iso.date().nullish(), status: z.enum(s.statusLancamentoEnum.enumValues).default('previsto'),
  fornecedorId: z.uuid().nullish(), colaboradorId: z.uuid().nullish(), socioId: z.uuid().nullish(), observacao: z.string().nullish(),
});
financeiro.post('/lancamentos', zValidator('json', lancamentoBody), async (c) => {
  const b = c.req.valid('json');
  return c.json((await db().insert(s.lancamentos).values({ ...b, valor: b.valor.toFixed(2), createdBy: c.get('user').nome }).returning())[0], 201);
});
financeiro.patch('/lancamentos/:id', zValidator('json', lancamentoBody.partial()), async (c) => {
  const { valor, ...b } = c.req.valid('json');
  return c.json((await db().update(s.lancamentos).set({ ...b, ...(valor !== undefined ? { valor: valor.toFixed(2) } : {}), updatedAt: new Date() }).where(eq(s.lancamentos.id, c.req.param('id'))).returning())[0]);
});
financeiro.post('/lancamentos/:id/pagar', zValidator('json', z.object({ dataPagamento: z.iso.date().optional() })), async (c) => {
  const dataPagamento = c.req.valid('json').dataPagamento ?? new Date().toISOString().slice(0, 10);
  return c.json((await db().update(s.lancamentos).set({ status: 'realizado', dataPagamento, updatedAt: new Date() }).where(eq(s.lancamentos.id, c.req.param('id'))).returning())[0]);
});

/* ---------- Fluxo de caixa ---------- */
financeiro.get('/fluxo-caixa', async (c) => {
  const de = c.req.query('de') ?? periodoPadrao().de; const ate = c.req.query('ate') ?? periodoPadrao().ate;
  const rows = await db().select({
    data: s.lancamentos.dataCompetencia, tipo: s.lancamentos.tipo, status: s.lancamentos.status, valor: s.lancamentos.valor, conta: s.contasFinanceiras.nome,
  }).from(s.lancamentos).innerJoin(s.contasFinanceiras, eq(s.contasFinanceiras.id, s.lancamentos.contaId))
    .where(and(gte(s.lancamentos.dataCompetencia, de), lte(s.lancamentos.dataCompetencia, ate))).orderBy(asc(s.lancamentos.dataCompetencia));
  return c.json({ de, ate, lancamentos: rows });
});

/* ---------- Rateio de custos indiretos ---------- */
financeiro.get('/rateio', async (c) => {
  const padrao = periodoPadrao(Number(c.req.query('dias') ?? 30));
  const de = c.req.query('de') ?? padrao.de; const ate = c.req.query('ate') ?? padrao.ate;
  return c.json(await calcularRateio(db(), de, ate));
});

/* ---------- DRE mensal (simplificado) ---------- */
financeiro.get('/dre', async (c) => {
  const mes = c.req.query('mes') ?? new Date().toISOString().slice(0, 7); // YYYY-MM
  const de = `${mes}-01`;
  const [ano, mesNum] = mes.split('-').map(Number);
  const ate = new Date(Date.UTC(ano, mesNum, 0)).toISOString().slice(0, 10); // último dia do mês

  const vendas = await db().select({ receita: sql<string>`coalesce(sum(total),0)`, cmv: sql<string>`coalesce(sum(custo_total),0)` }).from(s.pedidos)
    .where(and(gte(s.pedidos.dataOperacao, de), lte(s.pedidos.dataOperacao, ate), sql`${s.pedidos.status} in ('entregue','retirado')`));

  const porGrupo = await db().select({ grupo: s.categoriasFinanceiras.grupoDre, valor: sql<string>`coalesce(sum(${s.lancamentos.valor}),0)` })
    .from(s.lancamentos).innerJoin(s.categoriasFinanceiras, eq(s.categoriasFinanceiras.id, s.lancamentos.categoriaId))
    .where(and(eq(s.lancamentos.status, 'realizado'), gte(s.lancamentos.dataCompetencia, de), lte(s.lancamentos.dataCompetencia, ate)))
    .groupBy(s.categoriasFinanceiras.grupoDre);

  const grupos = Object.fromEntries(porGrupo.map((g) => [g.grupo, Number(g.valor)]));
  const receita = Number(vendas[0].receita); const cmvDireto = Number(vendas[0].cmv);
  const despesasOperacionais = ['pessoal', 'entrega', 'ocupacao', 'utilidades', 'marketing', 'taxas', 'impostos']
    .reduce((a, g) => a + (grupos[g] ?? 0), 0);
  const custoIndireto = grupos['custo_indireto'] ?? 0; // carvão, embalagem, limpeza, gás (categorias rateáveis)
  const margemContribuicao = receita - cmvDireto - custoIndireto;
  const resultadoOperacional = margemContribuicao - despesasOperacionais;

  return c.json({
    mes, receita, cmvDireto, custoIndireto, margemContribuicao, despesasOperacionais, resultadoOperacional,
    porGrupo: grupos, outrasReceitas: grupos['outras_receitas'] ?? 0,
  });
});
