import { describe, expect, it } from 'vitest';
import { app } from './app';
import { parseOfx } from './db/import-extrato';
import { getDb } from './db/client';
import { registrarPagamento } from './services/pedidos';

const call = (path: string, init?: RequestInit & { role?: string }) =>
  app.request(`/v1${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-mock-role': init?.role ?? 'admin', ...(init?.headers ?? {}) } });
const json = async (r: Response) => r.json() as Promise<any>;

describe('tabela de preços e combos (seed da planilha)', () => {
  it('mostra margem do produto para admin e esconde para operador', async () => {
    const admin = await json(await call('/produtos'));
    const picanha = admin.find((p: any) => p.nome === 'Picanha');
    expect(picanha.custoCents).toBe(5556);
    expect(picanha.margemPct).toBeCloseTo(49.0, 1);
    const op = await json(await call('/produtos', { role: 'operador' }));
    expect(op[0]).not.toHaveProperty('custoCents');
    expect(op[0]).not.toHaveProperty('margemPct');
  });

  it('combo 1 costela: custo ~R$63,74', async () => {
    const combos = await json(await call('/combos'));
    const v = combos.find((c: any) => c.nome.startsWith('Combo 1')).variantes.find((x: any) => x.carne === 'Costela');
    expect(v.precoCents).toBe(14999);
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

  it('operador não acessa usuários; sem Cognito configurado, admin recebe 501 claro', async () => {
    expect((await call('/usuarios', { role: 'operador' })).status).toBe(403);
    const r = await call('/usuarios');
    expect(r.status).toBe(501);
  });
});

describe('fluxo de novo pedido', () => {
  it('cria, numera, paga, avança status e cancela', async () => {
    const prods = await json(await call('/produtos'));
    const combos = await json(await call('/combos'));
    const coca = prods.find((p: any) => p.nome === 'Coca');
    const picanha = prods.find((p: any) => p.nome === 'Picanha');
    const precoPicanha = Number(picanha.precoVenda);
    const variante = combos.find((c: any) => c.nome.startsWith('Combo 2')).variantes.find((x: any) => x.carne === 'Picanha');
    const precoVariante = variante.precoCents / 100;

    const tel = `55519${Math.floor(10000000 + Math.random() * 89999999)}`;
    const r = await call('/pedidos', { method: 'POST', body: JSON.stringify({
      novoCliente: { nome: 'Teste E2E', telefone: tel }, canal: 'whatsapp', tipo: 'retirada',
      itens: [{ comboVarianteId: variante.id, quantidade: 1, refrigeranteId: coca.id }, { produtoId: picanha.id, quantidade: 2 }],
      pagamentos: [{ forma: 'pix', valor: 100 }],
    }) });
    expect(r.status).toBe(201);
    const p = await json(r);
    expect(Number(p.total)).toBeCloseTo(precoVariante + 2 * precoPicanha, 2);
    expect(p.statusPagamento).toBe('parcial');

    const det = await json(await call(`/pedidos/${p.id}`));
    expect(det.itens[0].descricaoSnapshot).toBe('Combo 2 – 4 pessoas – Picanha · Refri: Coca');
    expect(det.itens[0].escolhas.composicao).toEqual(expect.arrayContaining([
      expect.objectContaining({ nome: 'Picanha', quantidade: 2 }), expect.objectContaining({ nome: 'Coração', quantidade: 1 }), expect.objectContaining({ nome: 'Coca', quantidade: 1 }),
    ]));
    expect(det.custoTotal).not.toBeNull();
    const detOp = await json(await call(`/pedidos/${p.id}`, { role: 'operador' }));
    expect(detOp).not.toHaveProperty('custoTotal');

    const pg = await json(await call(`/pedidos/${p.id}/pagamentos`, { method: 'POST', body: JSON.stringify({ forma: 'dinheiro', valor: Number(p.total) - 100 }) }));
    expect(pg.statusPagamento).toBe('pago');

    // snapshot: mudar preço não altera pedido antigo
    await call(`/produtos/${picanha.id}`, { method: 'PATCH', body: JSON.stringify({ precoVenda: precoPicanha + 10 }) });
    const depois = await json(await call(`/pedidos/${p.id}`));
    expect(Number(depois.itens[1].precoUnitarioSnapshot)).toBe(precoPicanha);
    await call(`/produtos/${picanha.id}`, { method: 'PATCH', body: JSON.stringify({ precoVenda: precoPicanha, motivo: 'restaura teste' }) });

    expect((await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'saiu_entrega' }) })).status).toBe(400);
    expect((await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'em_preparo' }) })).status).toBe(200);

    const prod = await json(await call('/producao'));
    expect(prod.produtos.find((x: any) => x.nome === 'Picanha').quantidade).toBeGreaterThanOrEqual(4);
    const picanhaInsumo = prod.insumos.find((x: any) => x.nome === 'Picanha');
    expect(picanhaInsumo).toBeTruthy();
    // Produção reaproveita o estoque de verdade do módulo Estoque, não mais um campo digitado e
    // perdido ao recarregar a página — "em estoque" e "a comprar" vêm junto na resposta.
    expect(typeof picanhaInsumo.estoqueAtual).toBe('number');
    expect(picanhaInsumo.aComprar).toBeGreaterThanOrEqual(0);

    expect((await call(`/pedidos/${p.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: '' }) })).status).toBe(400);
    expect((await call(`/pedidos/${p.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: 'teste' }) })).status).toBe(200);
    const wa = await json(await call(`/pedidos/${p.id}/resumo-whatsapp`));
    expect(wa.texto).toContain('Churrasco do Joe');
  });

  it('rejeita fracionado em produto que não permite', async () => {
    const prods = await json(await call('/produtos'));
    const r = await call('/pedidos', { method: 'POST', body: JSON.stringify({ itens: [{ produtoId: prods.find((p: any) => p.nome === 'Geleia defumada').id, quantidade: 0.5 }], canal: 'balcao', tipo: 'retirada' }) });
    expect(r.status).toBe(400);
  });

  it('permite 1/2 espeto de carne (preço vira metade)', async () => {
    const prods = await json(await call('/produtos'));
    const costela = prods.find((p: any) => p.nome === 'Costela');
    expect(costela.permiteFracionado).toBe(true);
    const r = await json(await call('/pedidos', { method: 'POST', body: JSON.stringify({ itens: [{ produtoId: costela.id, quantidade: 0.5 }], canal: 'balcao', tipo: 'retirada' }) }));
    expect(Number(r.total)).toBeCloseTo(Number(costela.precoVenda) / 2, 2);
  });

  it('permite editar os itens até o pedido ser retirado/entregue', async () => {
    const prods = await json(await call('/produtos'));
    const coca = prods.find((p: any) => p.nome === 'Coca');
    const guarana = prods.find((p: any) => p.nome === 'Guaraná');
    const r = await call('/pedidos', { method: 'POST', body: JSON.stringify({ nomeCliente: 'Edição', canal: 'balcao', tipo: 'retirada', itens: [{ produtoId: coca.id, quantidade: 1 }] }) });
    const p = await json(r);
    expect(Number(p.total)).toBe(15);

    const editado = await json(await call(`/pedidos/${p.id}/itens`, { method: 'PUT', body: JSON.stringify([{ produtoId: coca.id, quantidade: 2 }, { produtoId: guarana.id, quantidade: 1 }]) }));
    expect(Number(editado.total)).toBe(42);
    expect(editado.itens).toHaveLength(2);

    await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'em_preparo' }) });
    await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'pronto' }) });
    await call(`/pedidos/${p.id}/status`, { method: 'POST', body: JSON.stringify({ para: 'retirado' }) });

    const bloqueado = await call(`/pedidos/${p.id}/itens`, { method: 'PUT', body: JSON.stringify([{ produtoId: coca.id, quantidade: 1 }]) });
    expect(bloqueado.status).toBe(400);
  });

  it('registrarPagamento com referenciaExterna é idempotente (webhook do gateway reenviado não credita 2x)', async () => {
    const coca = (await json(await call('/produtos'))).find((p: any) => p.nome === 'Coca');
    const p = await json(await call('/pedidos', { method: 'POST', body: JSON.stringify({ nomeCliente: 'Idempotência Pix', canal: 'balcao', tipo: 'retirada', itens: [{ produtoId: coca.id, quantidade: 1 }] }) }));

    const db = getDb();
    const primeiro = await registrarPagamento(db, p.id, 'pix', Number(p.total), 'ORD-mesma-order');
    const segundo = await registrarPagamento(db, p.id, 'pix', Number(p.total), 'ORD-mesma-order'); // mesma referência = webhook duplicado
    expect(primeiro).toBe('pago'); expect(segundo).toBe('pago');

    const detalhe = await json(await call(`/pedidos/${p.id}`));
    expect(detalhe.pagamentos).toHaveLength(1); // não duplicou a linha de pagamento
  });

  it('estoque de produto pronto pra vender: desconta na venda, devolve ao cancelar/editar', async () => {
    const prod = await json(await call('/produtos', { method: 'POST', body: JSON.stringify({ nome: `Maionese teste ${crypto.randomUUID()}`, categoria: 'acompanhamento', precoVenda: 10, controlaEstoque: true }) }));
    await call(`/produtos/${prod.id}`, { method: 'PATCH', body: JSON.stringify({ estoqueTotal: 20, estoqueVenda: 5 }) });

    const p1 = await json(await call('/pedidos', { method: 'POST', body: JSON.stringify({ nomeCliente: 'Estoque', canal: 'balcao', tipo: 'retirada', itens: [{ produtoId: prod.id, quantidade: 2 }] }) }));
    const depois1 = (await json(await call('/produtos'))).find((x: any) => x.id === prod.id);
    expect(Number(depois1.estoqueVenda)).toBe(3); // 5 - 2
    expect(Number(depois1.estoqueTotal)).toBe(20); // nunca muda com a venda

    // editar itens: devolve os 2 antigos e desconta os 3 novos
    await call(`/pedidos/${p1.id}/itens`, { method: 'PUT', body: JSON.stringify([{ produtoId: prod.id, quantidade: 3 }]) });
    const depois2 = (await json(await call('/produtos'))).find((x: any) => x.id === prod.id);
    expect(Number(depois2.estoqueVenda)).toBe(2); // 5 - 3

    // cancelar: devolve os 3
    await call(`/pedidos/${p1.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: 'teste' }) });
    const depois3 = (await json(await call('/produtos'))).find((x: any) => x.id === prod.id);
    expect(Number(depois3.estoqueVenda)).toBe(5);

    // zerado: some da lista que Novo pedido usa (disponivelHoje por si só não garante mais isso)
    await call(`/produtos/${prod.id}`, { method: 'PATCH', body: JSON.stringify({ estoqueVenda: 0 }) });
    const zerado = (await json(await call('/produtos'))).find((x: any) => x.id === prod.id);
    expect(Number(zerado.estoqueVenda)).toBe(0);
    expect(zerado.controlaEstoque).toBe(true);
  });
});

describe('clientes', () => {
  it('reaproveita cliente pelo telefone em vez de duplicar', async () => {
    const tel = `5551${Math.floor(10000000 + Math.random() * 89999999)}`;
    const c1 = await json(await call('/clientes', { method: 'POST', body: JSON.stringify({ nome: 'Fulano', telefone: tel }) }));
    const c2 = await json(await call('/clientes', { method: 'POST', body: JSON.stringify({ nome: 'Fulano da Silva', telefone: tel }) }));
    expect(c2.id).toBe(c1.id);
    expect(c2.nome).toBe('Fulano da Silva');
    expect(c2.jaExistia).toBe(true);
  });

  it('sem telefone, usa o nome (sem diferenciar maiúsculas) para não duplicar', async () => {
    const nome = `Cliente Sem Fone ${Date.now()}`;
    const c1 = await json(await call('/clientes', { method: 'POST', body: JSON.stringify({ nome }) }));
    expect(c1.telefone).toBeNull();
    const c2 = await json(await call('/clientes', { method: 'POST', body: JSON.stringify({ nome: nome.toUpperCase() }) }));
    expect(c2.id).toBe(c1.id);
  });
});

describe('financeiro', () => {
  it('DRE não quebra em mês com 31 dias', async () => {
    // regressão: "${mes}-31" é inválido em meses de 30 (ou 28/29) dias e o Postgres rejeitava a query
    for (const mes of ['2026-09', '2026-02', '2026-01']) {
      const r = await call(`/dre?mes=${mes}`);
      expect(r.status).toBe(200);
      const dre = await json(r);
      expect(dre.mes).toBe(mes);
      expect(typeof dre.receita).toBe('number');
    }
  });

  it('rateio calcula custo indireto por pedido', async () => {
    const r = await json(await call('/rateio?dias=30'));
    expect(r.qtdPedidos).toBeGreaterThanOrEqual(0);
    expect(r.custoIndiretoPorPedidoCents).toBe(r.qtdPedidos > 0 ? Math.round(r.totalIndiretoCents / r.qtdPedidos) : 0);
  });

  it('operador não acessa financeiro', async () => {
    expect((await call('/dre', { role: 'operador' })).status).toBe(403);
    expect((await call('/lancamentos', { role: 'operador' })).status).toBe(403);
  });

  const OFX_EXEMPLO = `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261101120000
<TRNAMT>150.00
<FITID>stone-0001
<MEMO>Recebimento Pix - Pedido 017
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103083000
<TRNAMT>-45.90
<FITID>stone-0002
<MEMO>Compra - Supermercado Nutri
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261104000000
<TRNAMT>-12.50
<MEMO>Sem FITID — usa chave alternativa
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it('parseOfx lê transações no formato "SGML" (sem fechar tag) que a maioria dos bancos/fintechs usa', () => {
    const linhas = parseOfx(OFX_EXEMPLO);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ fitid: 'stone-0001', data: '2026-11-01', valor: 150, tipo: 'entrada' });
    expect(linhas[1]).toMatchObject({ fitid: 'stone-0002', data: '2026-11-03', valor: -45.9, tipo: 'saida' });
    expect(linhas[2].fitid).toBeTruthy(); // sem FITID no arquivo: cai na chave alternativa, nunca fica vazio
    expect(linhas[2].tipo).toBe('saida');
  });

  it('importa extrato, cria lançamentos "a classificar" e reimportar não duplica', async () => {
    // FITID só precisa ser único entre si; precisa mudar a cada execução da suíte (banco local persiste
    // entre rodadas), senão a 2ª rodada já encontra os lançamentos da 1ª e o teste de "importa 3" falha.
    const run = Date.now();
    const ofx = OFX_EXEMPLO
      .replaceAll('stone-0001', `teste-${run}-0001`).replaceAll('stone-0002', `teste-${run}-0002`)
      .replace('Sem FITID — usa chave alternativa', `Sem FITID — usa chave alternativa (${run})`); // 3ª linha não tem FITID; precisa variar pra não colidir com a rodada anterior
    const contas = await json(await call('/contas'));
    const conta = contas.find((c: any) => c.nome === 'Maquininha') ?? contas[0];

    const r1 = await json(await call('/importar-extrato', { method: 'POST', body: JSON.stringify({ ofx, contaId: conta.id }) }));
    expect(r1).toMatchObject({ total: 3, importados: 3, duplicados: 0 });

    const r2 = await json(await call('/importar-extrato', { method: 'POST', body: JSON.stringify({ ofx, contaId: conta.id }) }));
    expect(r2).toMatchObject({ total: 3, importados: 0, duplicados: 3 }); // idempotente: mesmo arquivo de novo

    const lancamentos = await json(await call('/lancamentos?categoriaId=' + (await buscarCategoriaId('A classificar (saída)'))));
    expect(lancamentos.some((l: any) => l.descricao.includes('Supermercado Nutri'))).toBe(true);
  });

  async function buscarCategoriaId(nome: string) {
    const categorias = await json(await call('/categorias'));
    return categorias.find((c: any) => c.nome === nome)?.id;
  }
});

describe('estoque', () => {
  it('registrar entrada de compra soma no estoque atual do insumo', async () => {
    const insumos = await json(await call('/insumos'));
    const carvao = insumos.find((i: any) => i.nome === 'Carvão');

    const antes = (await json(await call('/estoque'))).find((e: any) => e.insumoId === carvao.id);
    await call('/estoque/lotes', { method: 'POST', body: JSON.stringify({ insumoId: carvao.id, origem: 'compra', quantidade: 10, validade: null }) });
    const depois = (await json(await call('/estoque'))).find((e: any) => e.insumoId === carvao.id);

    expect(depois.estoqueAtual).toBe((antes?.estoqueAtual ?? 0) + 10);
  });

  it('desativar um lote tira ele da conta do estoque atual', async () => {
    const insumos = await json(await call('/insumos'));
    const arroz = insumos.find((i: any) => i.nome === 'Arroz');

    const lote = await json(await call('/estoque/lotes', { method: 'POST', body: JSON.stringify({ insumoId: arroz.id, origem: 'compra', quantidade: 25 }) }));
    const comLote = (await json(await call('/estoque'))).find((e: any) => e.insumoId === arroz.id);
    await call(`/estoque/lotes/${lote.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: false }) });
    const semLote = (await json(await call('/estoque'))).find((e: any) => e.insumoId === arroz.id);

    expect(semLote.estoqueAtual).toBe(comLote.estoqueAtual - 25);
  });

  it('necessidade da semana nunca pede negativo (já tem estoque suficiente = 0 a comprar)', async () => {
    const r = await json(await call('/estoque/necessidade?de=2026-01-01&ate=2026-01-01')); // período sem pedido nenhum
    expect(Array.isArray(r)).toBe(true);
    for (const item of r) expect(item.aComprar).toBeGreaterThanOrEqual(0);
  });

  it('operador não acessa estoque (mesmo custo/fornecedor sensível que o resto do catálogo)', async () => {
    expect((await call('/estoque', { role: 'operador' })).status).toBe(403);
  });
});

describe('configurações sensíveis (credenciais de gateway)', () => {
  it('GET nunca devolve o valor salvo — só diz se está configurado, e só pra admin', async () => {
    await call('/configuracoes/mercadopago_access_token', { method: 'PUT', body: JSON.stringify('APP_USR-segredo-de-verdade') });

    const comoAdmin = await json(await call('/configuracoes/mercadopago_access_token'));
    expect(comoAdmin).toEqual({ configurado: true });
    expect(JSON.stringify(comoAdmin)).not.toContain('segredo-de-verdade');

    expect((await call('/configuracoes/mercadopago_access_token', { role: 'operador' })).status).toBe(403);
  });

  it('chave sensível nunca cadastrada responde "não configurado", nunca 404 com o valor', async () => {
    const r = await json(await call('/configuracoes/mercadopago_webhook_secret'));
    expect(r).toEqual(expect.objectContaining({ configurado: expect.any(Boolean) }));
  });

  it('config não-sensível continua liberada pra qualquer papel autenticado, igual antes', async () => {
    expect((await call('/configuracoes/negocio_nome', { role: 'operador' })).status).toBe(200);
  });
});
