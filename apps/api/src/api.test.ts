import { describe, expect, it } from 'vitest';
import { app } from './app';

const call = (path: string, init?: RequestInit & { role?: string }) =>
  app.request(`/v1${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-mock-role': init?.role ?? 'admin', ...(init?.headers ?? {}) } });
const json = async (r: Response) => r.json() as Promise<any>;

describe('tabela de preços e combos (seed da planilha)', () => {
  it('mostra margem do produto para admin e esconde para operador', async () => {
    const admin = await json(await call('/produtos'));
    const picanha = admin.find((p: any) => p.nome === 'Picanha');
    expect(picanha.custoCents).toBe(5556);
    expect(picanha.margemPct).toBeCloseTo(49.4, 1);
    const op = await json(await call('/produtos', { role: 'operador' }));
    expect(op[0]).not.toHaveProperty('custoCents');
    expect(op[0]).not.toHaveProperty('margemPct');
  });

  it('combo 1 costela: custo ~R$63,74', async () => {
    const combos = await json(await call('/combos'));
    const v = combos.find((c: any) => c.nome.startsWith('Combo 1')).variantes.find((x: any) => x.carne === 'Costela');
    expect(v.precoCents).toBe(13999);
    expect(v.custoCents).toBeGreaterThan(6370);
    expect(v.custoCents).toBeLessThan(6380);
  });

  it('PATCH de preço não zera os outros campos do produto', async () => {
    const prods = await json(await call('/produtos'));
    const coracao = prods.find((p: any) => p.nome === 'Coração');
    await call(`/produtos/${coracao.id}`, { method: 'PATCH', body: JSON.stringify({ precoVenda: 49.9 }) });
    const depois = (await json(await call('/produtos'))).find((p: any) => p.nome === 'Coração');
    expect(depois.permiteFracionado).toBe(true);
    expect(depois.unidadeVenda).toBe(coracao.unidadeVenda);
  });

  it('operador não acessa insumos', async () => {
    expect((await call('/insumos', { role: 'operador' })).status).toBe(403);
  });
});

describe('fluxo de novo pedido', () => {
  it('cria, numera, paga, avança status e cancela', async () => {
    const prods = await json(await call('/produtos'));
    const combos = await json(await call('/combos'));
    const coca = prods.find((p: any) => p.nome === 'Coca');
    const picanha = prods.find((p: any) => p.nome === 'Picanha');
    const variante = combos.find((c: any) => c.nome.startsWith('Combo 2')).variantes.find((x: any) => x.carne === 'Picanha');

    const tel = `55519${Math.floor(10000000 + Math.random() * 89999999)}`;
    const r = await call('/pedidos', { method: 'POST', body: JSON.stringify({
      novoCliente: { nome: 'Teste E2E', telefone: tel }, canal: 'whatsapp', tipo: 'retirada',
      itens: [{ comboVarianteId: variante.id, quantidade: 1, refrigeranteId: coca.id }, { produtoId: picanha.id, quantidade: 2 }],
      pagamentos: [{ forma: 'pix', valor: 100 }],
    }) });
    expect(r.status).toBe(201);
    const p = await json(r);
    expect(Number(p.total)).toBeCloseTo(299.99 + 2 * 109.9, 2);
    expect(p.statusPagamento).toBe('parcial');

    const det = await json(await call(`/pedidos/${p.id}`));
    expect(det.itens[0].descricaoSnapshot).toBe('Combo 2 – 4 pessoas – Picanha · Refri: Coca');
    expect(det.itens[0].escolhas.composicao).toEqual(expect.arrayContaining([
      { nome: 'Picanha', quantidade: 2 }, { nome: 'Coração', quantidade: 1 }, { nome: 'Coca', quantidade: 1 },
    ]));
    expect(det.custoTotal).not.toBeNull();
    const detOp = await json(await call(`/pedidos/${p.id}`, { role: 'operador' }));
    expect(detOp).not.toHaveProperty('custoTotal');

    const pg = await json(await call(`/pedidos/${p.id}/pagamentos`, { method: 'POST', body: JSON.stringify({ forma: 'dinheiro', valor: 419.79 }) }));
    expect(pg.statusPagamento).toBe('pago');

    // snapshot: mudar preço não altera pedido antigo
    await call(`/produtos/${picanha.id}`, { method: 'PATCH', body: JSON.stringify({ precoVenda: 120 }) });
    const depois = await json(await call(`/pedidos/${p.id}`));
    expect(Number(depois.itens[1].precoUnitarioSnapshot)).toBe(109.9);
    await call(`/produtos/${picanha.id}`, { method: 'PATCH', body: JSON.stringify({ precoVenda: 109.9, motivo: 'restaura teste' }) });

    expect((await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'saiu_entrega' }) })).status).toBe(400);
    expect((await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'em_preparo' }) })).status).toBe(200);

    const prod = await json(await call('/producao'));
    expect(prod.produtos.find((x: any) => x.nome === 'Picanha').quantidade).toBeGreaterThanOrEqual(4);
    expect(prod.insumos.find((x: any) => x.nome === 'Picanha')).toBeTruthy();

    expect((await call(`/pedidos/${p.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: '' }) })).status).toBe(400);
    expect((await call(`/pedidos/${p.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: 'teste' }) })).status).toBe(200);
    const wa = await json(await call(`/pedidos/${p.id}/resumo-whatsapp`));
    expect(wa.texto).toContain('Churrasco do Joe');
  });

  it('rejeita fracionado em produto que não permite', async () => {
    const prods = await json(await call('/produtos'));
    const r = await call('/pedidos', { method: 'POST', body: JSON.stringify({ itens: [{ produtoId: prods.find((p: any) => p.nome === 'Picanha').id, quantidade: 0.5 }], canal: 'balcao', tipo: 'retirada' }) });
    expect(r.status).toBe(400);
  });
});
