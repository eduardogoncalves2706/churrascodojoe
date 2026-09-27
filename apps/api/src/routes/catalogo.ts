import { zValidator } from '@hono/zod-validator';
import { aplicarPercentual, arredondarPreco, fromCents, margem, toCents } from '@joe/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { isAdmin, requireAdmin, stripCustos, type Env } from '../auth';
import { getDb, schema as s } from '../db/client';
import { custosProdutos, custoVariante } from '../services/custos';

export const catalogo = new Hono<Env>();
const db = () => getDb();
const money = z.number().min(0);

/* ---------- Produtos ---------- */
catalogo.get('/produtos', async (c) => {
  const [rows, custos] = await Promise.all([db().select().from(s.produtos).orderBy(asc(s.produtos.ordem), asc(s.produtos.nome)), custosProdutos(db())]);
  const out = rows.map((p) => {
    const custoCents = custos.get(p.id) ?? null;
    return { ...p, precoCents: toCents(p.precoVenda), custoCents, ...margem(toCents(p.precoVenda), custoCents) };
  });
  return c.json(isAdmin(c) ? out : stripCustos(out));
});

const produtoCampos = {
  nome: z.string().min(1), categoria: z.enum(s.categoriaProdutoEnum.enumValues), precoVenda: money, parceiro: z.string().nullish(),
};
// defaults só na criação: em .partial() um default sobrescreveria campos não enviados no PATCH
const produtoBody = z.object({ ...produtoCampos, unidadeVenda: z.string().default('unidade'), permiteFracionado: z.boolean().default(false), vendidoAPrecoDeCusto: z.boolean().default(false) });
const produtoPatch = z.object({ ...produtoCampos, unidadeVenda: z.string(), permiteFracionado: z.boolean(), vendidoAPrecoDeCusto: z.boolean() }).partial();

catalogo.post('/produtos', requireAdmin, zValidator('json', produtoBody), async (c) => {
  const b = c.req.valid('json');
  const [p] = await db().insert(s.produtos).values({ ...b, precoVenda: b.precoVenda.toFixed(2) }).returning();
  await db().insert(s.produtoPrecosHistorico).values({ produtoId: p.id, preco: p.precoVenda, motivo: 'Cadastro' });
  return c.json(p, 201);
});

catalogo.patch('/produtos/:id', zValidator('json', produtoPatch.extend({ disponivelHoje: z.boolean().optional(), ativo: z.boolean().optional(), ordem: z.number().int().optional(), motivo: z.string().optional() })), async (c) => {
  const id = c.req.param('id');
  const { motivo, precoVenda, ...rest } = c.req.valid('json');
  const admin = isAdmin(c);
  // operador só pode marcar "disponível hoje"
  const patch: Record<string, unknown> = admin ? rest : rest.disponivelHoje !== undefined ? { disponivelHoje: rest.disponivelHoje } : {};
  if (admin && precoVenda !== undefined) {
    const [atual] = await db().select().from(s.produtos).where(eq(s.produtos.id, id));
    if (atual && toCents(atual.precoVenda) !== toCents(precoVenda)) {
      patch.precoVenda = precoVenda.toFixed(2);
      await db().insert(s.produtoPrecosHistorico).values({ produtoId: id, preco: precoVenda.toFixed(2), motivo: motivo ?? 'Edição manual' });
    }
  }
  if (!Object.keys(patch).length) return c.json({ error: { code: 'forbidden', message: 'Sem permissão para esta alteração' } }, 403);
  const [p] = await db().update(s.produtos).set({ ...patch, updatedAt: new Date() }).where(eq(s.produtos.id, id)).returning();
  return c.json(p);
});

catalogo.get('/produtos/:id/historico', requireAdmin, async (c) =>
  c.json(await db().select().from(s.produtoPrecosHistorico).where(eq(s.produtoPrecosHistorico.produtoId, c.req.param('id'))).orderBy(desc(s.produtoPrecosHistorico.createdAt))));

const reajusteBody = z.object({
  percentual: z.number(), arredondar: z.enum(['nenhum', '90', '99']).default('nenhum'),
  produtoIds: z.array(z.uuid()).default([]), varianteIds: z.array(z.uuid()).default([]), motivo: z.string().default('Reajuste em lote'),
});
catalogo.post('/produtos/reajuste', requireAdmin, zValidator('json', reajusteBody), async (c) => {
  const b = c.req.valid('json');
  const dryRun = c.req.query('dryRun') === 'true';
  const prods = b.produtoIds.length ? await db().select().from(s.produtos).where(inArray(s.produtos.id, b.produtoIds)) : [];
  const vars = b.varianteIds.length ? await db().select().from(s.comboVariantes).where(inArray(s.comboVariantes.id, b.varianteIds)) : [];
  const novo = (v: string) => arredondarPreco(aplicarPercentual(toCents(v), b.percentual), b.arredondar);
  const previa = [
    ...prods.map((p) => ({ tipo: 'produto' as const, id: p.id, nome: p.nome, de: p.precoVenda, para: fromCents(novo(p.precoVenda)) })),
    ...vars.map((v) => ({ tipo: 'variante' as const, id: v.id, nome: v.id, de: v.preco, para: fromCents(novo(v.preco)) })),
  ];
  if (!dryRun) {
    await db().transaction(async (tx) => {
      for (const i of previa) {
        if (i.tipo === 'produto') {
          await tx.update(s.produtos).set({ precoVenda: i.para, updatedAt: new Date() }).where(eq(s.produtos.id, i.id));
          await tx.insert(s.produtoPrecosHistorico).values({ produtoId: i.id, preco: i.para, motivo: b.motivo });
        } else await tx.update(s.comboVariantes).set({ preco: i.para, updatedAt: new Date() }).where(eq(s.comboVariantes.id, i.id));
      }
    });
  }
  return c.json({ dryRun, itens: previa });
});

/* ---------- Combos ---------- */
catalogo.get('/combos', async (c) => {
  const [combos, itens, variantes, prods, custos] = await Promise.all([
    db().select().from(s.combos).orderBy(asc(s.combos.ordem)), db().select().from(s.comboItens), db().select().from(s.comboVariantes),
    db().select().from(s.produtos), custosProdutos(db()),
  ]);
  const nome = new Map(prods.map((p) => [p.id, p]));
  const out = combos.map((cb) => {
    const its = itens.filter((i) => i.comboId === cb.id);
    return {
      ...cb,
      itens: its.map((i) => ({ ...i, nome: i.produtoId ? nome.get(i.produtoId)?.nome : 'Carne escolhida' })),
      variantes: variantes.filter((v) => v.comboId === cb.id).map((v) => {
        const precoCents = toCents(v.preco);
        const custoCents = custoVariante(its, v.carneProdutoId, custos);
        const cheio = its.reduce((a, i) => a + Math.round(Number(i.quantidade) * toCents((i.produtoId ? nome.get(i.produtoId) : nome.get(v.carneProdutoId))?.precoVenda ?? 0)), 0);
        return { ...v, carne: nome.get(v.carneProdutoId)?.nome, precoCents, custoCents, precoCheioAvulsoCents: cheio, descontoCents: cheio - precoCents, ...margem(precoCents, custoCents) };
      }),
    };
  });
  return c.json(isAdmin(c) ? out : stripCustos(out));
});

catalogo.post('/combos', requireAdmin, zValidator('json', z.object({ nome: z.string().min(1), descricao: z.string().optional(), pessoas: z.number().int().positive() })), async (c) => {
  const [r] = await db().insert(s.combos).values(c.req.valid('json')).returning();
  return c.json(r, 201);
});
catalogo.patch('/combos/:id', requireAdmin, zValidator('json', z.object({ nome: z.string().optional(), descricao: z.string().nullish(), pessoas: z.number().int().optional(), ativo: z.boolean().optional() })), async (c) => {
  const [r] = await db().update(s.combos).set({ ...c.req.valid('json'), updatedAt: new Date() }).where(eq(s.combos.id, c.req.param('id'))).returning();
  return c.json(r);
});
catalogo.put('/combos/:id/itens', requireAdmin, zValidator('json', z.array(z.object({
  produtoId: z.uuid().nullable(), quantidade: z.number().positive(), ehCarneEscolhida: z.boolean().default(false), grupoEscolha: z.string().nullish(),
}))), async (c) => {
  const id = c.req.param('id');
  await db().transaction(async (tx) => {
    await tx.delete(s.comboItens).where(eq(s.comboItens.comboId, id));
    const itens = c.req.valid('json');
    if (itens.length) await tx.insert(s.comboItens).values(itens.map((i) => ({ ...i, comboId: id, quantidade: String(i.quantidade) })));
  });
  return c.json({ ok: true });
});
catalogo.put('/combos/:id/variantes', requireAdmin, zValidator('json', z.array(z.object({ carneProdutoId: z.uuid(), preco: money, ativo: z.boolean().default(true) }))), async (c) => {
  const id = c.req.param('id');
  for (const v of c.req.valid('json')) {
    await db().insert(s.comboVariantes).values({ comboId: id, carneProdutoId: v.carneProdutoId, preco: v.preco.toFixed(2), ativo: v.ativo })
      .onConflictDoUpdate({ target: [s.comboVariantes.comboId, s.comboVariantes.carneProdutoId], set: { preco: v.preco.toFixed(2), ativo: v.ativo, updatedAt: new Date() } });
  }
  return c.json({ ok: true });
});

/* ---------- Insumos e fornecedores (admin) ---------- */
catalogo.get('/insumos', requireAdmin, async (c) => {
  const [rows, hist] = await Promise.all([db().select().from(s.insumos).orderBy(asc(s.insumos.categoria), asc(s.insumos.nome)), db().select().from(s.insumoCustosHistorico).orderBy(desc(s.insumoCustosHistorico.createdAt))]);
  return c.json(rows.map((i) => {
    const h = hist.filter((x) => x.insumoId === i.id);
    return { ...i, custoCents: toCents(i.custoAtual), custoAnteriorCents: h[1] ? toCents(h[1].custo) : null, ultimoCustoEm: h[0]?.vigenteDesde ?? null };
  }));
});
const insumoBody = z.object({ nome: z.string().min(1), categoria: z.enum(s.categoriaInsumoEnum.enumValues), unidadeCompra: z.string().min(1), custoAtual: money, fornecedorPadraoId: z.uuid().nullish() });
catalogo.post('/insumos', requireAdmin, zValidator('json', insumoBody), async (c) => {
  const b = c.req.valid('json');
  const [i] = await db().insert(s.insumos).values({ ...b, custoAtual: b.custoAtual.toFixed(2) }).returning();
  await db().insert(s.insumoCustosHistorico).values({ insumoId: i.id, custo: i.custoAtual, fornecedorId: b.fornecedorPadraoId, observacao: 'Cadastro' });
  return c.json(i, 201);
});
catalogo.patch('/insumos/:id', requireAdmin, zValidator('json', insumoBody.omit({ custoAtual: true }).partial().extend({ ativo: z.boolean().optional() })), async (c) => {
  const [i] = await db().update(s.insumos).set({ ...c.req.valid('json'), updatedAt: new Date() }).where(eq(s.insumos.id, c.req.param('id'))).returning();
  return c.json(i);
});
/** Atualiza custo: grava histórico; margens de produtos/combos recalculam sozinhas (custo vem da ficha ao vivo). */
catalogo.post('/insumos/:id/custo', requireAdmin, zValidator('json', z.object({ custo: money, fornecedorId: z.uuid().nullish(), observacao: z.string().optional() })), async (c) => {
  const b = c.req.valid('json'); const id = c.req.param('id');
  await db().transaction(async (tx) => {
    await tx.update(s.insumos).set({ custoAtual: b.custo.toFixed(2), updatedAt: new Date() }).where(eq(s.insumos.id, id));
    await tx.insert(s.insumoCustosHistorico).values({ insumoId: id, custo: b.custo.toFixed(2), fornecedorId: b.fornecedorId, observacao: b.observacao });
  });
  return c.json({ ok: true });
});
catalogo.get('/insumos/:id/historico', requireAdmin, async (c) =>
  c.json(await db().select().from(s.insumoCustosHistorico).where(eq(s.insumoCustosHistorico.insumoId, c.req.param('id'))).orderBy(desc(s.insumoCustosHistorico.createdAt))));

catalogo.get('/fornecedores', requireAdmin, async (c) => c.json(await db().select().from(s.fornecedores).orderBy(asc(s.fornecedores.nome))));
const fornBody = z.object({ nome: z.string().min(1), telefone: z.string().nullish(), prazoPagamentoDias: z.number().int().min(0).default(0), formaPagamentoPadrao: z.string().nullish(), observacoes: z.string().nullish() });
const fornPatch = fornBody.omit({ prazoPagamentoDias: true }).partial().extend({ prazoPagamentoDias: z.number().int().min(0).optional() });
catalogo.post('/fornecedores', requireAdmin, zValidator('json', fornBody), async (c) => c.json((await db().insert(s.fornecedores).values(c.req.valid('json')).returning())[0], 201));
catalogo.patch('/fornecedores/:id', requireAdmin, zValidator('json', fornPatch.extend({ ativo: z.boolean().optional() })), async (c) =>
  c.json((await db().update(s.fornecedores).set({ ...c.req.valid('json'), updatedAt: new Date() }).where(eq(s.fornecedores.id, c.req.param('id'))).returning())[0]));

/* ---------- Ficha técnica e rendimentos ---------- */
catalogo.get('/produtos/:id/ficha-tecnica', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const rows = await db().select({ f: s.fichaTecnica, nome: s.insumos.nome, unidade: s.insumos.unidadeCompra, custo: s.insumos.custoAtual })
    .from(s.fichaTecnica).innerJoin(s.insumos, eq(s.insumos.id, s.fichaTecnica.insumoId)).where(eq(s.fichaTecnica.produtoId, id));
  const linhas = rows.map((r) => ({ insumoId: r.f.insumoId, nome: r.nome, unidade: r.unidade, quantidadeInsumo: Number(r.f.quantidadeInsumo), custoLinhaCents: Math.round(Number(r.f.quantidadeInsumo) * toCents(r.custo)) }));
  return c.json({ linhas, custoCents: linhas.length ? linhas.reduce((a, l) => a + l.custoLinhaCents, 0) : null });
});
catalogo.put('/produtos/:id/ficha-tecnica', requireAdmin, zValidator('json', z.array(z.object({ insumoId: z.uuid(), quantidadeInsumo: z.number().positive() }))), async (c) => {
  const id = c.req.param('id');
  await db().transaction(async (tx) => {
    await tx.delete(s.fichaTecnica).where(eq(s.fichaTecnica.produtoId, id));
    const l = c.req.valid('json');
    if (l.length) await tx.insert(s.fichaTecnica).values(l.map((x) => ({ produtoId: id, insumoId: x.insumoId, quantidadeInsumo: x.quantidadeInsumo.toFixed(4) })));
  });
  return c.json({ ok: true });
});
catalogo.get('/rendimentos', requireAdmin, async (c) =>
  c.json(await db().select({ r: s.rendimentoInsumo, insumo: s.insumos.nome, produto: s.produtos.nome }).from(s.rendimentoInsumo)
    .innerJoin(s.insumos, eq(s.insumos.id, s.rendimentoInsumo.insumoId)).innerJoin(s.produtos, eq(s.produtos.id, s.rendimentoInsumo.produtoId))));
catalogo.put('/rendimentos', requireAdmin, zValidator('json', z.array(z.object({ insumoId: z.uuid(), produtoId: z.uuid(), fator: z.number().positive() }))), async (c) => {
  for (const r of c.req.valid('json')) {
    await db().insert(s.rendimentoInsumo).values({ ...r, fator: String(r.fator) })
      .onConflictDoUpdate({ target: [s.rendimentoInsumo.insumoId, s.rendimentoInsumo.produtoId], set: { fator: String(r.fator), updatedAt: new Date() } });
  }
  return c.json({ ok: true });
});
