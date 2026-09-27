import { sql } from 'drizzle-orm';
import {
  boolean, date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const audit = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
const qty = (name: string, scale = 3) => numeric(name, { precision: 12, scale });

export const papelEnum = pgEnum('papel', ['admin', 'operador']);
export const categoriaInsumoEnum = pgEnum('categoria_insumo', ['carne', 'acompanhamento', 'bebida', 'limpeza', 'embalagem', 'combustivel', 'outros']);
export const categoriaProdutoEnum = pgEnum('categoria_produto', ['carne', 'acompanhamento', 'bebida', 'sobremesa', 'geleia', 'outros']);
export const colaboradorTipoEnum = pgEnum('colaborador_tipo', ['motoboy', 'ajudante', 'socio']);
export const canalEnum = pgEnum('canal', ['whatsapp', 'instagram', 'balcao', 'telefone', 'site', 'outro']);
export const tipoPedidoEnum = pgEnum('tipo_pedido', ['entrega', 'retirada']);
export const statusPedidoEnum = pgEnum('status_pedido', ['aguardando_confirmacao', 'recusado', 'rascunho', 'confirmado', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue', 'retirado', 'cancelado']);
export const statusPagamentoEnum = pgEnum('status_pagamento', ['pendente', 'parcial', 'pago', 'estornado']);
export const formaPagamentoEnum = pgEnum('forma_pagamento', ['pix', 'dinheiro', 'credito', 'debito', 'outro']);
export const tipoContaEnum = pgEnum('tipo_conta', ['caixa', 'banco', 'maquininha']);
export const tipoCategoriaEnum = pgEnum('tipo_categoria', ['entrada', 'saida']);
export const grupoDreEnum = pgEnum('grupo_dre', [
  'receita_vendas', 'outras_receitas', 'cmv', 'custo_indireto', 'pessoal', 'entrega', 'ocupacao', 'utilidades', 'marketing', 'taxas',
  'impostos', 'investimento', 'aporte_socio', 'retirada_socio', 'reserva', 'transferencia',
]);
export const tipoLancamentoEnum = pgEnum('tipo_lancamento', ['entrada', 'saida', 'transferencia']);
export const statusLancamentoEnum = pgEnum('status_lancamento', ['previsto', 'realizado', 'cancelado']);

export const usuarios = pgTable('usuarios', {
  id: id(), cognitoSub: text('cognito_sub').unique(), nome: text('nome').notNull(), email: text('email').notNull(),
  papel: papelEnum('papel').notNull().default('operador'), ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const socios = pgTable('socios', {
  id: id(), nome: text('nome').notNull(), percentual: numeric('percentual', { precision: 5, scale: 2 }).notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id), ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const fornecedores = pgTable('fornecedores', {
  id: id(), nome: text('nome').notNull().unique(), telefone: text('telefone'), prazoPagamentoDias: integer('prazo_pagamento_dias').notNull().default(0),
  formaPagamentoPadrao: text('forma_pagamento_padrao'), observacoes: text('observacoes'), ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const configuracoes = pgTable('configuracoes', {
  chave: text('chave').primaryKey(), valor: jsonb('valor').notNull(), ...audit,
});

export const insumos = pgTable('insumos', {
  id: id(), nome: text('nome').notNull().unique(), categoria: categoriaInsumoEnum('categoria').notNull(), unidadeCompra: text('unidade_compra').notNull(),
  custoAtual: money('custo_atual').notNull().default('0'), fornecedorPadraoId: uuid('fornecedor_padrao_id').references(() => fornecedores.id),
  ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const insumoCustosHistorico = pgTable('insumo_custos_historico', {
  id: id(), insumoId: uuid('insumo_id').notNull().references(() => insumos.id), custo: money('custo').notNull(),
  fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id), vigenteDesde: date('vigente_desde').notNull().defaultNow(),
  observacao: text('observacao'), ...audit,
});

export const produtos = pgTable('produtos', {
  id: id(), nome: text('nome').notNull().unique(), categoria: categoriaProdutoEnum('categoria').notNull(), unidadeVenda: text('unidade_venda').notNull().default('unidade'),
  precoVenda: money('preco_venda').notNull().default('0'), permiteFracionado: boolean('permite_fracionado').notNull().default(false),
  parceiro: text('parceiro'), vendidoAPrecoDeCusto: boolean('vendido_a_preco_de_custo').notNull().default(false),
  // Custo direto "manual": só usado quando o produto não tem ficha técnica (bebida, doce de parceiro,
  // venda avulsa sem insumo cadastrado). Com ficha técnica, o custo vem dela e este campo é ignorado —
  // ver services/custos.ts. Nunca inclui custo indireto (carvão, embalagem, limpeza, gás): isso é rateio.
  custoDireto: money('custo_direto'),
  disponivelHoje: boolean('disponivel_hoje').notNull().default(true), ordem: integer('ordem').notNull().default(0), ativo: boolean('ativo').notNull().default(true),
  // Landing page pública (docs/SPEC_landing_page.md)
  descricaoCurta: text('descricao_curta'), imagemKey: text('imagem_key'), visivelSite: boolean('visivel_site').notNull().default(true),
  destaqueSite: boolean('destaque_site').notNull().default(false), ordemSite: integer('ordem_site').notNull().default(0),
  ...audit,
});

export const produtoCustoHistorico = pgTable('produto_custo_historico', {
  id: id(), produtoId: uuid('produto_id').notNull().references(() => produtos.id), custo: money('custo').notNull(),
  vigenteDesde: date('vigente_desde').notNull().defaultNow(), motivo: text('motivo'), ...audit,
});

export const produtoPrecosHistorico = pgTable('produto_precos_historico', {
  id: id(), produtoId: uuid('produto_id').notNull().references(() => produtos.id), preco: money('preco').notNull(),
  vigenteDesde: date('vigente_desde').notNull().defaultNow(), motivo: text('motivo'), ...audit,
});

export const fichaTecnica = pgTable('ficha_tecnica', {
  id: id(), produtoId: uuid('produto_id').notNull().references(() => produtos.id), insumoId: uuid('insumo_id').notNull().references(() => insumos.id),
  quantidadeInsumo: qty('quantidade_insumo', 4).notNull(), ...audit,
}, (t) => [unique().on(t.produtoId, t.insumoId)]);

export const rendimentoInsumo = pgTable('rendimento_insumo', {
  id: id(), insumoId: uuid('insumo_id').notNull().references(() => insumos.id), produtoId: uuid('produto_id').notNull().references(() => produtos.id),
  fator: numeric('fator', { precision: 8, scale: 4 }).notNull(), ...audit,
}, (t) => [unique().on(t.insumoId, t.produtoId)]);

export const combos = pgTable('combos', {
  id: id(), nome: text('nome').notNull().unique(), descricao: text('descricao'), pessoas: integer('pessoas').notNull(),
  ativo: boolean('ativo').notNull().default(true), ordem: integer('ordem').notNull().default(0),
  descricaoCurta: text('descricao_curta'), imagemKey: text('imagem_key'), visivelSite: boolean('visivel_site').notNull().default(true), ordemSite: integer('ordem_site').notNull().default(0),
  ...audit,
});

export const comboItens = pgTable('combo_itens', {
  id: id(), comboId: uuid('combo_id').notNull().references(() => combos.id), produtoId: uuid('produto_id').references(() => produtos.id),
  quantidade: qty('quantidade').notNull(), ehCarneEscolhida: boolean('eh_carne_escolhida').notNull().default(false), grupoEscolha: text('grupo_escolha'), ...audit,
});

export const comboVariantes = pgTable('combo_variantes', {
  id: id(), comboId: uuid('combo_id').notNull().references(() => combos.id), carneProdutoId: uuid('carne_produto_id').notNull().references(() => produtos.id),
  preco: money('preco').notNull(), ativo: boolean('ativo').notNull().default(true), ...audit,
}, (t) => [unique().on(t.comboId, t.carneProdutoId)]);

export const bairrosEntrega = pgTable('bairros_entrega', {
  id: id(), nome: text('nome').notNull(), cidade: text('cidade').notNull().default('Canoas'), taxaEntrega: money('taxa_entrega').notNull().default('0'),
  atende: boolean('atende').notNull().default(true), visivelSite: boolean('visivel_site').notNull().default(true), ...audit,
}, (t) => [unique().on(t.nome, t.cidade)]);

export const clientes = pgTable('clientes', {
  // Telefone é opcional (import de clientes antigos sem telefone); quando presente, é único.
  // Sem telefone, o nome é o critério de dedupe (ver services/clientes.ts).
  id: id(), nome: text('nome').notNull(), telefone: text('telefone'), instagram: text('instagram'), observacoes: text('observacoes'),
  ativo: boolean('ativo').notNull().default(true), ...audit,
}, (t) => [uniqueIndex('clientes_telefone_uniq').on(t.telefone).where(sql`telefone is not null`)]);

export const enderecosCliente = pgTable('enderecos_cliente', {
  id: id(), clienteId: uuid('cliente_id').notNull().references(() => clientes.id), logradouro: text('logradouro').notNull(), numero: text('numero'),
  complemento: text('complemento'), bairroId: uuid('bairro_id').references(() => bairrosEntrega.id), referencia: text('referencia'),
  principal: boolean('principal').notNull().default(false), ...audit,
});

export const colaboradores = pgTable('colaboradores', {
  id: id(), nome: text('nome').notNull().unique(), tipo: colaboradorTipoEnum('tipo').notNull(), valorFixoDia: money('valor_fixo_dia').notNull().default('0'),
  valorPorEntrega: money('valor_por_entrega').notNull().default('0'), chavePix: text('chave_pix'), ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const pedidos = pgTable('pedidos', {
  id: id(), numeroDia: integer('numero_dia').notNull(), dataOperacao: date('data_operacao').notNull(),
  clienteId: uuid('cliente_id').references(() => clientes.id), nomeClienteSnapshot: text('nome_cliente_snapshot'), telefoneSnapshot: text('telefone_snapshot'),
  canal: canalEnum('canal').notNull().default('whatsapp'), tipo: tipoPedidoEnum('tipo').notNull().default('retirada'),
  agendadoPara: timestamp('agendado_para', { withTimezone: true }), status: statusPedidoEnum('status').notNull().default('confirmado'),
  enderecoTexto: text('endereco_texto'), bairroId: uuid('bairro_id').references(() => bairrosEntrega.id), referencia: text('referencia'),
  subtotal: money('subtotal').notNull().default('0'), desconto: money('desconto').notNull().default('0'), taxaEntrega: money('taxa_entrega').notNull().default('0'),
  total: money('total').notNull().default('0'), custoTotal: money('custo_total'), statusPagamento: statusPagamentoEnum('status_pagamento').notNull().default('pendente'),
  trocoPara: money('troco_para'), motoboyId: uuid('motoboy_id').references(() => colaboradores.id), observacoes: text('observacoes'), motivoCancelamento: text('motivo_cancelamento'),
  createdBy: text('created_by'), ...audit,
}, (t) => [unique().on(t.dataOperacao, t.numeroDia)]);

export const pedidoItens = pgTable('pedido_itens', {
  id: id(), pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id), produtoId: uuid('produto_id').references(() => produtos.id),
  comboVarianteId: uuid('combo_variante_id').references(() => comboVariantes.id), descricaoSnapshot: text('descricao_snapshot').notNull(),
  quantidade: qty('quantidade').notNull(), precoUnitarioSnapshot: money('preco_unitario_snapshot').notNull(), custoUnitarioSnapshot: money('custo_unitario_snapshot'),
  subtotal: money('subtotal').notNull(), escolhas: jsonb('escolhas'), observacao: text('observacao'), ...audit,
});

export const pedidoStatusHistorico = pgTable('pedido_status_historico', {
  id: id(), pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id), de: text('de'), para: text('para').notNull(),
  usuario: text('usuario'), nota: text('nota'), em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
});

export const contasFinanceiras = pgTable('contas_financeiras', {
  id: id(), nome: text('nome').notNull().unique(), tipo: tipoContaEnum('tipo').notNull(), saldoInicial: money('saldo_inicial').notNull().default('0'),
  ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const categoriasFinanceiras = pgTable('categorias_financeiras', {
  id: id(), nome: text('nome').notNull().unique(), tipo: tipoCategoriaEnum('tipo').notNull(), grupoDre: grupoDreEnum('grupo_dre').notNull(),
  // Categoria de custo indireto (carvão/lenha, embalagens, limpeza, gás) que entra no rateio por pedido —
  // ver SPEC_adendo_rateio_custos.md. Nunca true para receita/CMV/pessoal etc.
  rateavel: boolean('rateavel').notNull().default(false), ativo: boolean('ativo').notNull().default(true), ...audit,
});

export const lancamentos = pgTable('lancamentos', {
  id: id(), tipo: tipoLancamentoEnum('tipo').notNull(), categoriaId: uuid('categoria_id').notNull().references(() => categoriasFinanceiras.id),
  contaId: uuid('conta_id').notNull().references(() => contasFinanceiras.id), contaDestinoId: uuid('conta_destino_id').references(() => contasFinanceiras.id),
  descricao: text('descricao').notNull(), valor: money('valor').notNull(), dataCompetencia: date('data_competencia').notNull(),
  dataVencimento: date('data_vencimento').notNull(), dataPagamento: date('data_pagamento'), status: statusLancamentoEnum('status').notNull().default('previsto'),
  pedidoId: uuid('pedido_id').references(() => pedidos.id), fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id),
  colaboradorId: uuid('colaborador_id').references(() => colaboradores.id), socioId: uuid('socio_id').references(() => socios.id),
  anexoKey: text('anexo_key'), recorrenciaId: uuid('recorrencia_id'), observacao: text('observacao'), createdBy: text('created_by'), ...audit,
});

export const pagamentos = pgTable('pagamentos', {
  id: id(), pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id), forma: formaPagamentoEnum('forma').notNull(), valor: money('valor').notNull(),
  taxa: money('taxa').notNull().default('0'), recebidoEm: timestamp('recebido_em', { withTimezone: true }).notNull().defaultNow(),
  contaId: uuid('conta_id').references(() => contasFinanceiras.id), lancamentoId: uuid('lancamento_id').references(() => lancamentos.id), ...audit,
});
