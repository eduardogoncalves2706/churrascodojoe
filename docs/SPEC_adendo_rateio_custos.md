# Adendo à SPEC — Rateio de custos indiretos

## Regra
- `produtos.custo` / ficha técnica = **custo direto** do produto (carne, pão, bebida, doce). **Não** embutir carvão, embalagem, sacola, limpeza ou gás no custo do produto.
- A margem da tela **Cardápio e Preços** passa a se chamar **Margem direta** = (preço − custo direto) ÷ preço.
- Custos indiretos são lançados normalmente no Financeiro (categorias: Carvão/Lenha, Embalagens, Limpeza, Gás) e rateados por cálculo, nunca digitados no produto. Isso evita contar o mesmo gasto duas vezes no DRE (uma vez no CMV e outra como despesa).

## Cálculo do rateio (Financeiro)
- Nova configuração `base_rateio`: `pedido` (padrão) ou `receita`.
- Para um período (padrão: últimos 30 dias de operação):
  - `total_indireto` = soma dos lançamentos realizados das categorias marcadas como `rateavel = true`
  - Base `pedido`: `custo_indireto_por_pedido = total_indireto ÷ nº de pedidos entregues/retirados`
  - Base `receita`: `percentual_indireto = total_indireto ÷ receita de vendas`
- Adicionar coluna `rateavel boolean` em `categorias_financeiras`.

## Onde aparece
- **DRE:** Receita → (−) CMV direto → **Margem de contribuição** → (−) Custos indiretos rateáveis → **Margem operacional** → demais despesas.
- **Cardápio (admin):** coluna opcional "Margem após rateio" = (preço − custo direto − preço × percentual_indireto) ÷ preço, calculada com a base `receita`, com tooltip mostrando o período e o percentual usados.
- **Detalhe do pedido (admin):** margem do pedido com e sem o custo indireto por pedido.
- **Dashboard:** card "Custo indireto por pedido" e "% indireto sobre receita" no mês.

## Import de custos
- Endpoint/script `pnpm import:custos custos_produtos.csv` (colunas `produto,custo_unitario,origem`): casa pelo nome exato do produto, atualiza o custo direto, grava histórico com `origem` como motivo, e lista no final os nomes não encontrados. Linhas com custo vazio são ignoradas.

---

## Status da implementação (2026-09-27)

- ✅ `produtos.custo_direto` + `produto_custo_historico` — usado só quando o produto **não** tem ficha técnica (ficha sempre manda, recalcula ao vivo com o custo do insumo).
- ✅ `categorias_financeiras.rateavel` + `grupo_dre = 'custo_indireto'` para Carvão/Lenha, Embalagens, Limpeza, Gás.
- ✅ `configuracoes.base_rateio` (seed: `receita`).
- ✅ `services/rateio.ts` — `calcularRateio`, `margemAposRateioProduto`, `margemAposRateioPedido`.
- ✅ `GET /rateio`, `GET /dre` (mensal, com Margem de contribuição e Margem operacional).
- ✅ `pnpm import:custos <arquivo.csv>` — implementado no schema/base pronto para rodar.
- ⏳ **Pendente:** coluna "Margem após rateio" no Cardápio (admin), margem com/sem rateio no detalhe do pedido, card no Dashboard, tela de Financeiro completa (lançamentos, fluxo de caixa, DRE, fechamento de caixa, contas a pagar/receber).
