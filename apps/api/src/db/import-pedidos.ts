import { toCents, fromCents } from '@joe/shared';
import { eq } from 'drizzle-orm';
import { encontrarOuCriarCliente } from '../services/clientes';
import { custoVariante, custosProdutos } from '../services/custos';
import type { Db } from './client';
import { schema as s } from './client';

/** Parser CSV simples com suporte a campos entre aspas (vírgula e aspas escapadas "" dentro do campo). */
function parseCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = ''; let linha: string[] = []; let dentroAspas = false;
  const txt = texto.replace(/\r\n/g, '\n');
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (dentroAspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') dentroAspas = false;
      else campo += c;
    } else if (c === '"') dentroAspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); campo = ''; linhas.push(linha); linha = []; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cabecalho, ...resto] = linhas.filter((l) => l.length > 1 || l[0] !== '');
  return resto.map((l) => Object.fromEntries(cabecalho.map((h, i) => [h, l[i] ?? ''])));
}

const NOMES_VENDA_INTERNA = /venda interna\/sem cliente cadastrado/i;
const NOME_AMBIGUO = /vincular manualmente/i;
/** "Coca normal" não existe mais no cardápio — só "Coca zero" (anotado nos próprios dados de origem). */
const remapProduto = (nome: string) => (nome === 'Coca' ? 'Coca zero' : nome);

const FORMA_PAGAMENTO: Record<string, string> = { pix: 'pix', dinheiro: 'dinheiro', credito: 'credito', debito: 'debito', nao_informado: 'outro' };

export interface ResultadoImportPedidos {
  criados: number; jaExistiam: number; semClientePorFlag: number; itensNaoResolvidos: string[]; erros: string[];
}

export async function importarPedidos(db: Db, csvTexto: string): Promise<ResultadoImportPedidos> {
  const linhas = parseCsv(csvTexto);
  const grupos = new Map<string, Record<string, string>[]>();
  for (const l of linhas) {
    const ref = l.pedido_ref;
    if (!grupos.has(ref)) grupos.set(ref, []);
    grupos.get(ref)!.push(l);
  }

  const [produtos, combos, comboVariantesRows, comboItensRows] = await Promise.all([
    db.select().from(s.produtos), db.select().from(s.combos), db.select().from(s.comboVariantes), db.select().from(s.comboItens),
  ]);
  const produtoPorNome = new Map(produtos.map((p) => [p.nome, p]));
  const custos = await custosProdutos(db);

  const r: ResultadoImportPedidos = { criados: 0, jaExistiam: 0, semClientePorFlag: 0, itensNaoResolvidos: [], erros: [] };

  for (const [ref, itens] of grupos) {
    const cab = itens[0];
    try {
      const dataOperacao = cab.data_entrega;
      const numeroDia = Number(cab.numero_dia);
      const backdate = new Date(`${dataOperacao}T12:00:00-03:00`);

      // resolve cliente
      const semCliente = itens.some((i) => NOMES_VENDA_INTERNA.test(i.alerta ?? ''));
      const ambiguo = itens.some((i) => NOME_AMBIGUO.test(i.alerta ?? ''));
      let clienteId: string | null = null; let nomeSnapshot = cab.nome_cliente; let telefoneSnapshot: string | null = cab.telefone_cliente || null;
      if (!semCliente && cab.nome_cliente) {
        const { cliente } = await encontrarOuCriarCliente(db, { nome: cab.nome_cliente, telefone: cab.telefone_cliente || undefined });
        clienteId = cliente.id; nomeSnapshot = cliente.nome; telefoneSnapshot = cliente.telefone;
      } else if (semCliente) r.semClientePorFlag++;

      // monta as linhas de item
      const linhasItem: (typeof s.pedidoItens.$inferInsert)[] = [];
      let custoTotalCents = 0; let custoCompleto = true;
      for (const it of itens) {
        const nomeProduto = it.produto?.trim();
        const quantidade = Number(it.quantidade || 1);
        const valorItemCents = toCents(it.valor_item || 0);
        const precoUnitCents = toCents(it.preco_unitario || it.valor_item || 0);

        if (nomeProduto === 'Ajuste manual' || nomeProduto === 'Desconto') {
          linhasItem.push({
            pedidoId: '', produtoId: null, comboVarianteId: null, descricaoSnapshot: nomeProduto,
            quantidade: String(quantidade), precoUnitarioSnapshot: fromCents(precoUnitCents), custoUnitarioSnapshot: null,
            subtotal: fromCents(valorItemCents), escolhas: null, observacao: it.alerta || null,
          });
          custoCompleto = false;
          continue;
        }

        const comboMatch = /^Combo (\d) - (.+)$/.exec(nomeProduto ?? '');
        if (comboMatch) {
          const combo = combos.find((c) => c.nome.startsWith(`Combo ${comboMatch[1]} `));
          const carne = produtoPorNome.get(comboMatch[2].trim());
          const variante = combo && carne ? comboVariantesRows.find((v) => v.comboId === combo.id && v.carneProdutoId === carne.id) : undefined;
          if (!combo || !carne || !variante) { r.itensNaoResolvidos.push(`${ref}: combo "${nomeProduto}"`); custoCompleto = false; continue; }
          const itensCombo = comboItensRows.filter((ci) => ci.comboId === combo.id);
          const refriMatch = /refri do combo:\s*(.+)/i.exec(it.alerta ?? '');
          const refri = refriMatch ? produtoPorNome.get(refriMatch[1].trim()) : undefined;
          const custoVarianteCents = custoVariante(itensCombo, carne.id, custos, refri?.id);
          const nomes = new Map(produtos.map((p) => [p.id, p.nome]));
          const composicao = itensCombo.map((ci) => ({
            nome: ci.ehCarneEscolhida ? carne.nome : ci.grupoEscolha === 'refrigerante' && refri ? refri.nome : nomes.get(ci.produtoId!) ?? '',
            quantidade: Number(ci.quantidade),
          }));
          linhasItem.push({
            pedidoId: '', produtoId: null, comboVarianteId: variante.id, descricaoSnapshot: `${combo.nome} – ${carne.nome}${refri ? ` · Refri: ${refri.nome}` : ''}`,
            quantidade: String(quantidade), precoUnitarioSnapshot: fromCents(precoUnitCents),
            custoUnitarioSnapshot: custoVarianteCents == null ? null : fromCents(custoVarianteCents),
            subtotal: fromCents(valorItemCents), escolhas: refri ? { refrigeranteId: refri.id, composicao } : { composicao }, observacao: it.alerta && !refriMatch ? it.alerta : null,
          });
          if (custoVarianteCents == null) custoCompleto = false; else custoTotalCents += Math.round(custoVarianteCents * quantidade);
          continue;
        }

        const produto = produtoPorNome.get(remapProduto(nomeProduto ?? ''));
        if (!produto) { r.itensNaoResolvidos.push(`${ref}: produto "${nomeProduto}"`); custoCompleto = false; continue; }
        const custoUnit = custos.get(produto.id) ?? null;
        linhasItem.push({
          pedidoId: '', produtoId: produto.id, comboVarianteId: null, descricaoSnapshot: produto.nome,
          quantidade: String(quantidade), precoUnitarioSnapshot: fromCents(precoUnitCents), custoUnitarioSnapshot: custoUnit == null ? null : fromCents(custoUnit),
          subtotal: fromCents(valorItemCents), escolhas: null, observacao: it.alerta || null,
        });
        if (custoUnit == null) custoCompleto = false; else custoTotalCents += Math.round(custoUnit * quantidade);
      }

      const totalCents = toCents(cab.total_pedido);
      const motoboyCents = toCents(cab.valor_motoboy || 0);
      let observacoes = cab.observacoes || null;
      if (ambiguo) observacoes = `⚠ Nome compartilhado por mais de um cadastro — confira/religue o cliente. ${observacoes ?? ''}`.trim();
      if (motoboyCents > 0) observacoes = `${observacoes ?? ''} [Motoboy: ${fromCents(motoboyCents)}]`.trim();

      const inserted = await db.insert(s.pedidos).values({
        numeroDia, dataOperacao, clienteId, nomeClienteSnapshot: nomeSnapshot, telefoneSnapshot,
        canal: 'whatsapp', tipo: cab.tipo as never, agendadoPara: null, status: cab.status_pedido as never,
        enderecoTexto: null, bairroId: null, referencia: null,
        subtotal: cab.total_pedido, desconto: '0.00', taxaEntrega: '0.00', total: cab.total_pedido,
        custoTotal: custoCompleto ? fromCents(custoTotalCents) : null, statusPagamento: 'pago',
        trocoPara: null, motoboyId: null, observacoes, motivoCancelamento: null, createdBy: 'import histórico',
        createdAt: backdate, updatedAt: backdate,
      }).onConflictDoNothing().returning();

      if (!inserted.length) { r.jaExistiam++; continue; }
      const pedido = inserted[0];

      if (linhasItem.length) await db.insert(s.pedidoItens).values(linhasItem.map((l) => ({ ...l, pedidoId: pedido.id, createdAt: backdate, updatedAt: backdate })));
      await db.insert(s.pedidoStatusHistorico).values({ pedidoId: pedido.id, de: null, para: cab.status_pedido, usuario: 'import histórico', nota: `Pedido histórico importado (ref ${ref})`, em: backdate });
      await db.insert(s.pagamentos).values({
        pedidoId: pedido.id, forma: (FORMA_PAGAMENTO[cab.forma_pagamento] ?? 'outro') as never, valor: cab.valor_pago || cab.total_pedido,
        taxa: '0.00', recebidoEm: backdate, contaId: null, lancamentoId: null, createdAt: backdate, updatedAt: backdate,
      });
      r.criados++;
    } catch (e) {
      r.erros.push(`${ref}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return r;
}
