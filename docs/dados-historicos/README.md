# Dados históricos para importar

Arquivos que o Eduardo mandou para importar assim que o módulo correspondente existir.

## fluxo-caixa-2026-09.csv
Fluxo de caixa de setembro/2026 (linha por lançamento: dia, categoria Despesa/Receita, descrição,
data do fluxo, data de pagamento/recebimento, valor, saldo acumulado). Duas linhas de compra de
churrasqueira têm data do fluxo retroativa (parcela de compra feita em junho) — usar essa data como
`data_competencia` e a "Data Pgto/Receb." como `data_vencimento`/`data_pagamento`.

**Usar na Fase 4** para popular `lancamentos` (categoria por texto → mapear para `categorias_financeiras`
da seed) e abrir o saldo inicial da conta em -R$ 120,00 no dia 2/9 (ou ajustar `saldo_inicial` da conta
para que o acumulado bata). Ainda não importado — as tabelas financeiras não existem no schema até a
Fase 4 começar.

## Pendente: clientes e pedidos
Ainda não recebido. Preciso de nome + telefone de cada cliente (telefone é a chave de busca do
sistema); endereço/bairro e observações são opcionais. Para pedidos, preciso saber ao menos: cliente,
data, itens (produto/combo, quantidade, preço) e total — sem isso não dá para popular `pedidos` e
`pedido_itens` com dados confiáveis.
