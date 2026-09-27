import { eq, sql } from 'drizzle-orm';
import { getDb, schema as s } from './client';

type Cat = (typeof s.categoriaInsumoEnum.enumValues)[number];

const INSUMOS: [string, string, string, Cat][] = [
  ['Picanha', 'kg', '50.00', 'carne'], ['Maminha', 'kg', '40.00', 'carne'], ['Alcatra', 'kg', '40.00', 'carne'],
  ['Vazio', 'kg', '40.00', 'carne'], ['Costela', 'kg', '20.00', 'carne'], ['Linguiça/Salsichão', 'peça', '30.00', 'carne'],
  ['Pão de alho', 'bandeja', '10.00', 'acompanhamento'], ['Coração', 'pacote', '20.00', 'carne'], ['Carvão', 'saco 5 kg', '20.00', 'combustivel'],
  ['Arroz', 'kg', '3.70', 'acompanhamento'], ['Maionese', 'porção 500 g', '5.00', 'acompanhamento'], ['Coca', 'garrafa', '10.00', 'bebida'],
  ['Guaraná', 'garrafa', '8.00', 'bebida'], ['Pepsi', 'garrafa', '8.00', 'bebida'], ['Geleia defumada', 'unidade', '16.90', 'outros'],
  ['Detergente', 'frasco', '2.50', 'limpeza'], ['Desinfetante', 'frasco', '20.00', 'limpeza'], ['Álcool', 'frasco', '8.00', 'limpeza'],
  ['Saco de lixo', 'pacote', '20.00', 'limpeza'], ['Panos descartáveis', 'rolo', '50.00', 'limpeza'],
  ['Embalagem quente', 'pacote 100 un', '60.00', 'embalagem'], ['Sacolas', 'pacote 100 un', '30.00', 'embalagem'],
  ['Papel alumínio', 'rolo', '4.00', 'embalagem'], ['Papel toalha', 'pacote', '5.00', 'limpeza'],
];

type CatP = (typeof s.categoriaProdutoEnum.enumValues)[number];
interface P { nome: string; cat: CatP; un: string; preco: string; insumo?: string; ficha?: number; fator?: number; fracionado?: boolean; parceiro?: string; custo?: boolean }
const PRODUTOS: P[] = [
  ...(['Picanha:109.90', 'Maminha:89.90', 'Alcatra:89.90', 'Vazio:89.90', 'Costela:64.90'] as const).map((x): P => {
    const [nome, preco] = x.split(':');
    return { nome, cat: 'carne', un: 'espeto', preco, insumo: nome, fator: 0.9, ficha: 1 / 0.9 };
  }),
  { nome: 'Salsichão', cat: 'carne', un: 'peça', preco: '59.90', insumo: 'Linguiça/Salsichão', fator: 1, ficha: 1, fracionado: true },
  { nome: 'Salsichão (unidade)', cat: 'carne', un: 'unidade', preco: '3.99' },
  { nome: 'Pão de alho (bandeja)', cat: 'acompanhamento', un: 'bandeja', preco: '29.90', insumo: 'Pão de alho', ficha: 1 },
  { nome: 'Pão de alho (unidade)', cat: 'acompanhamento', un: 'unidade', preco: '14.99', insumo: 'Pão de alho', fator: 2, ficha: 0.5 },
  { nome: 'Coração', cat: 'carne', un: 'espeto', preco: '49.90', insumo: 'Coração', fator: 1.5, ficha: 1 / 1.5, fracionado: true },
  { nome: 'Arroz 500 g', cat: 'acompanhamento', un: 'porção', preco: '9.99', insumo: 'Arroz', ficha: 0.5 },
  { nome: 'Maionese 300 g', cat: 'acompanhamento', un: 'porção', preco: '13.99', insumo: 'Maionese', ficha: 0.6 },
  { nome: 'Coca', cat: 'bebida', un: 'garrafa', preco: '15.00', insumo: 'Coca', ficha: 1 },
  { nome: 'Guaraná', cat: 'bebida', un: 'garrafa', preco: '12.00', insumo: 'Guaraná', ficha: 1 },
  { nome: 'Pepsi', cat: 'bebida', un: 'garrafa', preco: '12.00', insumo: 'Pepsi', ficha: 1 },
  { nome: 'Geleia defumada', cat: 'geleia', un: 'unidade', preco: '29.90', insumo: 'Geleia defumada', ficha: 1, parceiro: 'King of Geleia' },
  { nome: 'Doces', cat: 'sobremesa', un: 'unidade', preco: '0.00', parceiro: 'Doces by Nick', custo: true },
];

const COMBOS = [
  { nome: 'Combo 1 – 2 pessoas', pessoas: 2, q: [1, 0.5, 1, 0.5, 1, 1, 1], precos: { Costela: '139.99', Vazio: '156.99', Alcatra: '156.99', Maminha: '156.99', Picanha: '174.99' } },
  { nome: 'Combo 2 – 4 pessoas', pessoas: 4, q: [2, 1, 2, 0.5, 2, 2, 1], precos: { Costela: '259.99', Vazio: '274.99', Alcatra: '274.99', Maminha: '274.99', Picanha: '299.99' } },
];
const COMBO_ITENS = ['*carne', 'Coração', 'Pão de alho (unidade)', 'Salsichão', 'Arroz 500 g', 'Maionese 300 g', 'Coca'];

export async function seed() {
  const db = getDb();
  for (const [nome, un, custo, cat] of INSUMOS) {
    const [row] = await db.insert(s.insumos).values({ nome, unidadeCompra: un, custoAtual: custo, categoria: cat }).onConflictDoNothing().returning();
    if (row) await db.insert(s.insumoCustosHistorico).values({ insumoId: row.id, custo, observacao: 'Custo inicial (seed)' });
  }
  const ins = new Map((await db.select().from(s.insumos)).map((i) => [i.nome, i.id]));

  let ordem = 0;
  for (const p of PRODUTOS) {
    const [row] = await db.insert(s.produtos).values({
      nome: p.nome, categoria: p.cat, unidadeVenda: p.un, precoVenda: p.preco, permiteFracionado: !!p.fracionado,
      parceiro: p.parceiro, vendidoAPrecoDeCusto: !!p.custo, ordem: ordem++,
    }).onConflictDoNothing().returning();
    if (row) await db.insert(s.produtoPrecosHistorico).values({ produtoId: row.id, preco: p.preco, motivo: 'Preço inicial (seed)' });
  }
  const prod = new Map((await db.select().from(s.produtos)).map((x) => [x.nome, x.id]));

  for (const p of PRODUTOS) {
    if (!p.insumo || p.ficha == null) continue;
    await db.insert(s.fichaTecnica).values({ produtoId: prod.get(p.nome)!, insumoId: ins.get(p.insumo)!, quantidadeInsumo: p.ficha.toFixed(4) }).onConflictDoNothing();
    if (p.fator) await db.insert(s.rendimentoInsumo).values({ insumoId: ins.get(p.insumo)!, produtoId: prod.get(p.nome)!, fator: String(p.fator) }).onConflictDoNothing();
  }

  let co = 0;
  for (const c of COMBOS) {
    const [row] = await db.insert(s.combos).values({ nome: c.nome, pessoas: c.pessoas, ordem: co++ }).onConflictDoNothing().returning();
    const combo = row ?? (await db.select().from(s.combos).where(eq(s.combos.nome, c.nome)))[0];
    const has = await db.select({ n: sql<number>`count(*)::int` }).from(s.comboItens).where(eq(s.comboItens.comboId, combo.id));
    if (!has[0].n) {
      await db.insert(s.comboItens).values(COMBO_ITENS.map((n, i) => ({
        comboId: combo.id, produtoId: n === '*carne' ? null : prod.get(n)!, quantidade: String(c.q[i]),
        ehCarneEscolhida: n === '*carne', grupoEscolha: n === 'Coca' ? 'refrigerante' : null,
      })));
    }
    for (const [carne, preco] of Object.entries(c.precos)) {
      await db.insert(s.comboVariantes).values({ comboId: combo.id, carneProdutoId: prod.get(carne)!, preco }).onConflictDoNothing();
    }
  }

  const [nutri] = await db.insert(s.fornecedores).values({ nome: 'Nutri', prazoPagamentoDias: 5, formaPagamentoPadrao: 'boleto' }).onConflictDoNothing().returning();
  void nutri;
  await db.insert(s.colaboradores).values([
    { nome: 'Motoboy', tipo: 'motoboy', valorFixoDia: '30.00', valorPorEntrega: '10.00' },
    { nome: 'Ajudante', tipo: 'ajudante', valorFixoDia: '75.00' },
  ]).onConflictDoNothing();
  if (!(await db.select().from(s.socios).limit(1)).length) {
    await db.insert(s.socios).values([{ nome: 'Sócio 1', percentual: '50' }, { nome: 'Sócio 2', percentual: '50' }]);
  }
  // Entrega grátis dentro de Canoas; fora de Canoas o valor é combinado à parte (taxa editável no pedido).
  const BAIRROS_CANOAS = [
    'Brigadeira', 'Centro', 'Estância Velha', 'Fátima', 'Guajuviras', 'Harmonia', 'Igara', 'Industrial',
    'Marechal Rondon', 'Mathias Velho', 'Mato Grande', 'Niterói', 'Nossa Senhora das Graças', 'Olaria',
    'Rio Branco', 'São José', 'São Luiz',
  ];
  await db.insert(s.bairrosEntrega).values(BAIRROS_CANOAS.map((nome) => ({ nome, cidade: 'Canoas', taxaEntrega: '0.00' }))).onConflictDoNothing();

  const cfg: Record<string, unknown> = {
    taxas_maquininha: { pix: 0.49, debito: 1.43, credito: 3.36, dinheiro: 0 }, horario_pico: { inicio: 11, fim: 14 }, dias_operacao: ['sab', 'dom'],
    mensagem_whatsapp_confirmacao: 'Pedido confirmado! Já estamos preparando.', margem_minima_pct: 40, comanda_formato: 'termica80', base_rateio: 'receita',
  };
  for (const [chave, valor] of Object.entries(cfg)) await db.insert(s.configuracoes).values({ chave, valor }).onConflictDoNothing();

  await db.insert(s.contasFinanceiras).values([
    { nome: 'Caixa físico', tipo: 'caixa' }, { nome: 'Conta PJ', tipo: 'banco' }, { nome: 'Maquininha', tipo: 'maquininha' },
  ]).onConflictDoNothing();

  type GrupoDre = (typeof s.grupoDreEnum.enumValues)[number];
  const CATEGORIAS: [string, 'entrada' | 'saida', GrupoDre, boolean?][] = [
    ['Vendas', 'entrada', 'receita_vendas'], ['Outras receitas', 'entrada', 'outras_receitas'],
    ['Insumos/Carnes (Nutri)', 'saida', 'cmv'],
    // Rateáveis: custo indireto dividido pelos pedidos do período (SPEC_adendo_rateio_custos.md) — nunca no custo do produto.
    ['Carvão/Lenha', 'saida', 'custo_indireto', true], ['Embalagens', 'saida', 'custo_indireto', true],
    ['Limpeza', 'saida', 'custo_indireto', true], ['Gás', 'saida', 'custo_indireto', true],
    ['Motoboy', 'saida', 'entrega'], ['Ajudantes', 'saida', 'pessoal'],
    ['Água', 'saida', 'utilidades'], ['Luz', 'saida', 'utilidades'], ['Internet', 'saida', 'utilidades'], ['Aluguel', 'saida', 'ocupacao'],
    ['Impostos', 'saida', 'impostos'], ['Taxa de cartão', 'saida', 'taxas'], ['Meta Ads/Marketing', 'saida', 'marketing'],
    ['Investimento em equipamento', 'saida', 'investimento'], ['Aporte de sócio', 'entrada', 'aporte_socio'],
    ['Distribuição de lucro', 'saida', 'retirada_socio'], ['Reserva administrativa', 'saida', 'reserva'], ['Reserva de investimento', 'saida', 'reserva'],
  ];
  await db.insert(s.categoriasFinanceiras).values(CATEGORIAS.map(([nome, tipo, grupoDre, rateavel]) => ({ nome, tipo, grupoDre, rateavel: !!rateavel }))).onConflictDoNothing();

  console.log('seed ok');
}
