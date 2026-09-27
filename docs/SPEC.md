# Churrasco do Joe — Sistema Interno de Pedidos, Preços e Fluxo de Caixa

> **Para o Claude Code:** este documento é a especificação completa do sistema. Salve-o no repositório como `docs/SPEC.md` e siga as fases da seção 12 na ordem. Antes de cada fase, leia a seção correspondente, implemente, rode os testes e só então avance. Onde houver `TODO(confirmar)`, implemente de forma configurável e pergunte ao Eduardo.

---

## 1. Contexto do negócio

O Churrasco do Joe é uma operação de churrasco gaúcho em Canoas/RS que funciona **apenas em fins de semana e feriados**, com pico de pedidos entre **11h e 14h**. Os pedidos chegam majoritariamente por **WhatsApp** (divulgação no Instagram), podem ser **encomendados durante a semana para entrega no fim de semana**, e são entregues por motoboy ou retirados no ponto (gazebo na calçada). A empresa tem **dois sócios em 50/50**.

Hoje tudo é controlado em uma planilha Excel (`planejamento_JOE.xlsx`) com três abas:

| Aba | O que tem | Vira no sistema |
|---|---|---|
| **Custos iniciais** | Itens de investimento (alvarás, churrasqueiras, balcão quente, geladeira, extintor...) com qtd × valor | Módulo **Investimentos** |
| **Custos x Receita Mensais** | Insumos com custo unitário e preço de venda, rendimento em espetos, custo médio por espeto, tabela de preços individual, composição e preço dos combos, despesas fixas mensais, meta de receita e divisão do resultado entre sócios | Módulos **Insumos**, **Produtos/Tabela de preços**, **Combos**, **Ficha técnica**, **Planejamento/Metas**, **Fluxo de caixa** |
| **Modelo** | Ideias: entregas com agendamento, encomendas na semana, combos família (kits 1, 2 e 3), canais WhatsApp e Instagram | Regras do módulo **Pedidos** |

> ⚠️ **Bug na planilha a NÃO replicar:** a coluna "receita" calcula `quantidade × despesa` (`=B2*F2`) quando deveria ser `quantidade × preço de venda` (`=B2*E2`). No sistema, receita = qtd × preço de venda e margem = receita − custo.

### Usuários
Poucos usuários (sócios e ajudantes). Dois papéis:
- **admin** — sócios: acesso total, incluindo financeiro, preços e relatórios.
- **operador** — ajudantes/atendentes: cria e acompanha pedidos, vê cardápio e clientes; **não** vê custos, margens nem financeiro.

### Uso principal
No dia de operação, o sistema é usado **no celular**, em pé, com pressa. O fluxo "novo pedido" precisa ser concluído em menos de 30 segundos. Fora da operação, os sócios usam no desktop para preços, financeiro e relatórios.

---

## 2. Stack e arquitetura

### 2.1 Visão geral

```
                 ┌──────────────────── Route 53 (domínio próprio) ───────────────────┐
                 │                                                                   │
        app.DOMINIO                                                      api.DOMINIO
                 │                                                                   │
        CloudFront + ACM                                          API Gateway (HTTP API) + ACM
                 │                                                                   │
        S3 (SPA React)                                            JWT Authorizer (Cognito)
                                                                                     │
                                                                  Lambda "api" (Node 20, Hono)
                                                                                     │
                                                         Aurora Serverless v2 PostgreSQL (Data API)
                                                                                     │
                                                         S3 "anexos" (fotos de notas/boletos)
        Cognito User Pool (login)        CloudWatch Logs + Alarms        AWS Budgets (alerta de custo)
```

### 2.2 Serviços AWS e por quê

| Serviço | Uso | Por quê |
|---|---|---|
| **Route 53** | DNS do domínio (`app.` e `api.`) | Domínio já existe; criar hosted zone ou delegar os registros |
| **ACM** | Certificados HTTPS | Gratuito. **Certificado do CloudFront deve ser emitido em `us-east-1`** |
| **S3 + CloudFront** | Hospedar o front (SPA) | Custo quase zero, HTTPS, cache global |
| **Cognito User Pool** | Login, papéis (grupos `admin` e `operador`) | Gratuito para poucos usuários; sem gerenciar senhas no nosso código |
| **API Gateway HTTP API** | Porta de entrada da API | Barato, autorizador JWT nativo do Cognito |
| **Lambda (Node.js 20, TypeScript)** | Uma única função com toda a API (Hono) | Paga só quando usa — ideal para operação de fim de semana |
| **Aurora Serverless v2 PostgreSQL** com **Data API** e **auto-pause (mín. 0 ACU)** | Banco relacional | Relatórios de caixa e DRE ficam simples em SQL; com Data API a Lambda **não precisa de VPC nem NAT Gateway**; pausa quando ninguém usa |
| **S3 (bucket privado)** | Anexos (foto de boleto, nota do fornecedor) | Upload via URL pré-assinada |
| **Secrets Manager** | Credencial do banco (usada pela Data API) | Exigido pela Data API |
| **CloudWatch** | Logs e alarmes (erros 5xx da Lambda) | Observabilidade básica |
| **AWS Budgets** | Alerta de custo por e-mail | Evitar surpresa na fatura |
| **AWS CDK (TypeScript)** | Infra como código | Tudo recriável com `cdk deploy` |
| **GitHub Actions + OIDC** | CI/CD | Deploy sem chave de acesso fixa |

**Região:** `sa-east-1` (São Paulo) para banco, Lambda e API. Apenas o certificado do CloudFront em `us-east-1`.

**Atenção ao auto-pause do Aurora:** ao retomar depois de pausado, a primeira requisição leva alguns segundos. Configurar pausa após **60 min** de inatividade; o front deve mostrar "Conectando ao banco..." e fazer retry em timeout. Alternativa se isso incomodar: **RDS PostgreSQL `db.t4g.micro`** (custo fixo mensal, sem pausa, mas exige Lambda em VPC). Deixar a escolha isolada na camada de acesso a dados (Drizzle) para trocar sem reescrever a aplicação.

> Validar os custos na AWS Pricing Calculator para `sa-east-1` antes de subir. Configurar o AWS Budgets com alerta logo no primeiro deploy.

### 2.3 Stack de código

- **Monorepo** com `pnpm workspaces`.
- **Front:** React 18 + Vite + TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Router, React Hook Form + Zod, Recharts (gráficos), `aws-amplify/auth` (apenas o módulo de auth do Cognito). PWA instalável (manifest + ícone) para abrir como app no celular.
- **API:** Hono rodando em Lambda (`hono/aws-lambda`), Zod para validação, Drizzle ORM com driver `drizzle-orm/aws-data-api/pg`.
- **Compartilhado:** pacote `shared` com schemas Zod e tipos usados por front e API.
- **Testes:** Vitest (unitários das regras de cálculo são obrigatórios), Playwright para o fluxo de novo pedido.
- **Qualidade:** ESLint + Prettier, TypeScript `strict`.

### 2.4 Estrutura do repositório

```
churrasco-joe/
├── apps/
│   ├── web/                 # React SPA
│   └── api/                 # Hono + Lambda
│       └── src/
│           ├── routes/      # um arquivo por módulo
│           ├── services/    # regras de negócio (preço, CMV, caixa)
│           ├── db/          # schema Drizzle, migrations, seed
│           └── index.ts
├── packages/
│   └── shared/              # schemas Zod, enums, tipos, formatadores (BRL)
├── infra/                   # AWS CDK
├── docs/SPEC.md             # este arquivo
├── .github/workflows/       # CI/CD
└── CLAUDE.md                # convenções resumidas para o Claude Code
```

---

## 3. Convenções obrigatórias

- **Dinheiro:** `NUMERIC(12,2)` no banco; no código, trabalhar em **centavos inteiros** nos cálculos e formatar como `R$ 1.234,56` só na exibição. Nunca usar float para dinheiro.
- **Quantidades:** `NUMERIC(12,3)` (permite 0,5 coração, 0,300 kg de maionese).
- **Datas:** armazenar em UTC (`timestamptz`); exibir e agrupar relatórios em `America/Sao_Paulo`. "Dia de operação" é a data local.
- **Snapshots:** pedido guarda nome, preço e custo dos itens no momento da venda. Alterar a tabela de preços **nunca** muda pedidos antigos.
- **Soft delete:** cadastros têm `ativo boolean`; nada é apagado fisicamente.
- **Auditoria:** tabelas principais têm `created_at`, `updated_at`, `created_by`.
- **Interface em português**, textos com a voz da marca (direta, gaúcha) mas sem exagero em telas operacionais.
- **Autorização na API**, não só no front: rotas de custo, margem e financeiro exigem grupo `admin`; respostas para `operador` não incluem campos de custo.

---

## 4. Identidade visual (do Manual de Marca)

Tema **escuro** por padrão.

| Token | Cor | Uso |
|---|---|---|
| `--bg` | `#0D0A07` | Fundo |
| `--surface` | `#2B1507` | Cards, painéis |
| `--primary` | `#D4420A` | Botões principais, destaques (laranja fogueira) |
| `--primary-hover` | `#F07020` | Hover, badges |
| `--danger` / brasa | `#8B1A00` | Cancelado, saídas no caixa |
| `--text` | `#F5EDD8` | Texto (creme) |
| `--accent` | `#C8A060` | Dourado: totais, valores, títulos secundários |

Gradiente de marca (usar só em cabeçalho/login): `#0D0A07 → #2B1507 → #D4420A → #F07020`.

Fontes (Google Fonts): **Bebas Neue** para títulos e números grandes do dashboard; **Barlow** para texto; **Barlow Condensed Bold** para rótulos, botões e tabelas; **Playfair Display Italic** só no login/tagline. Entradas (verde) e saídas (brasa) no fluxo de caixa devem ser distinguíveis também por sinal (+/−), não só por cor. A **comanda impressa** é preto e branco.

---

## 5. Banco de dados

Schema em Drizzle; abaixo, o modelo lógico. Todas as tabelas têm `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` (omitidos abaixo).

### 5.1 Cadastros de base

**usuarios** — `cognito_sub text unique`, `nome`, `email`, `papel enum('admin','operador')`, `ativo`.

**socios** — `nome`, `percentual numeric(5,2)` (hoje 50 / 50), `usuario_id fk null`, `ativo`. A soma dos percentuais ativos deve ser 100.

**fornecedores** — `nome` (ex.: Nutri), `telefone`, `prazo_pagamento_dias int` (Nutri = 5, boleto), `forma_pagamento_padrao`, `observacoes`, `ativo`.

**configuracoes** — `chave text pk`, `valor jsonb`. Chaves iniciais: `taxas_maquininha` (por forma de pagamento), `horario_pico` (11h–14h), `dias_operacao`, `mensagem_whatsapp_confirmacao`.

### 5.2 Insumos e custos

**insumos** — o que é comprado.
- `nome`, `categoria enum('carne','acompanhamento','bebida','limpeza','embalagem','combustivel','outros')`
- `unidade_compra text` (kg, peça, bandeja, pacote, saco 5kg, porção 500g, garrafa, frasco, rolo, pacote 100un)
- `custo_atual numeric(12,2)` (custo por unidade de compra)
- `fornecedor_padrao_id fk null`, `ativo`

**insumo_custos_historico** — `insumo_id`, `custo`, `fornecedor_id`, `vigente_desde date`, `observacao`. Toda alteração de `custo_atual` gera uma linha.

### 5.3 Produtos, preços e ficha técnica

**produtos** — o que é vendido avulso (tabela individual).
- `nome`, `categoria enum('carne','acompanhamento','bebida','sobremesa','geleia','outros')`
- `unidade_venda text` (espeto, kg, unidade, bandeja, porção, garrafa) — `TODO(confirmar)` se carnes da tabela individual são por espeto ou por kg
- `preco_venda numeric(12,2)`
- `permite_fracionado boolean` (ex.: meio coração)
- `parceiro text null` (Doces by Nick, King of Geleia) e `vendido_a_preco_de_custo boolean` (doces da parceria: sem margem)
- `disponivel_hoje boolean` (esgotou → some do novo pedido sem desativar), `ordem int`, `ativo`

**produto_precos_historico** — `produto_id`, `preco`, `vigente_desde`, `motivo`.

**ficha_tecnica** — quanto de insumo cada produto consome, para calcular CMV.
- `produto_id`, `insumo_id`, `quantidade_insumo numeric(12,4)` (em unidade de compra do insumo por 1 unidade de venda)
- Custo do produto = Σ(quantidade_insumo × custo_atual do insumo).

**rendimento_insumo** — reproduz a coluna "Qtd Espetos" da planilha.
- `insumo_id`, `produto_id`, `fator numeric(8,4)` = unidades de produto por unidade de insumo
- Valores da planilha: carnes 0,9 espeto/kg · linguiça 1/peça · pão de alho 2/bandeja · coração 1,5/pacote.
- Usado na tela **Produção** para converter pedidos em compra de insumos, e para sugerir a ficha técnica (`quantidade_insumo = 1 / fator`).

### 5.4 Combos

Os combos têm composição fixa e **o preço varia conforme a carne escolhida**.

**combos** — `nome` (Combo 1 – 2 pessoas; Combo 2 – 4 pessoas), `descricao`, `pessoas int`, `ativo`, `ordem`.

**combo_itens** — `combo_id`, `produto_id null`, `quantidade`, `eh_carne_escolhida boolean`, `grupo_escolha text null` (ex.: "refrigerante" quando o cliente escolhe o sabor).

**combo_variantes** — `combo_id`, `carne_produto_id`, `preco numeric(12,2)`, `ativo`.

Seed a partir da planilha:

| | Combo 1 (2 pessoas) | Combo 2 (4 pessoas) |
|---|---|---|
| Carne escolhida | 1 espeto | 2 espetos |
| Coração | 0,5 | 1 |
| Pão de alho | 1 | 2 |
| Salsichão | 0,5 | 0,5 |
| Arroz | 500 g | 1 kg |
| Maionese | 300 g | 600 g |
| Refrigerante | 1 | 1 |
| **Preço – costela** | R$ 139,99 | R$ 259,99 |
| **Preço – vazio / alcatra / maminha** | R$ 156,99 | R$ 274,99 |
| **Preço – picanha** | R$ 174,99 | R$ 299,99 |

A tela de combos deve mostrar, por variante, **custo calculado** (soma da ficha técnica dos itens), **preço**, **margem R$ e %**, e o "preço cheio avulso" (soma dos itens pela tabela individual) para mostrar o desconto do combo.

### 5.5 Clientes e entrega

**clientes** — `nome`, `telefone text unique` (formato E.164, chave de busca principal), `instagram null`, `observacoes` (ex.: "gosta mal passada"), `ativo`.

**enderecos_cliente** — `cliente_id`, `logradouro`, `numero`, `complemento`, `bairro_id`, `referencia`, `principal boolean`.

**bairros_entrega** — `nome` (Mathias Velho, etc.), `cidade` (Canoas, Estância Velha), `taxa_entrega numeric(12,2)`, `atende boolean`.

### 5.6 Equipe

**colaboradores** — `nome`, `tipo enum('motoboy','ajudante','socio')`, `valor_fixo_dia numeric` , `valor_por_entrega numeric`, `chave_pix`, `ativo`.
- Motoboy: fixo R$ 30,00 + R$ 10,00 por entrega.
- Ajudante: diária R$ 75,00.

**escalas** — `data date`, `colaborador_id`, `presente boolean`, `qtd_entregas int` (calculado dos pedidos para motoboy), `valor_devido numeric` (calculado), `lancamento_id fk null` (lançamento gerado), `observacao`. Unique (`data`, `colaborador_id`).

### 5.7 Pedidos

**pedidos**
- `numero_dia int` (sequencial por dia de operação: #001, #002...) + `data_operacao date`; unique (`data_operacao`, `numero_dia`)
- `cliente_id fk null` (pedido de balcão pode ser sem cadastro), `nome_cliente_snapshot`, `telefone_snapshot`
- `canal enum('whatsapp','instagram','balcao','telefone','outro')`
- `tipo enum('entrega','retirada')`
- `agendado_para timestamptz null` (encomenda feita na semana ou horário marcado)
- `status enum('rascunho','confirmado','em_preparo','pronto','saiu_entrega','entregue','retirado','cancelado')`
- Endereço snapshot: `endereco_texto`, `bairro_id`, `referencia`
- `subtotal`, `desconto`, `taxa_entrega`, `total` (numeric 12,2)
- `custo_total numeric` (soma dos custos snapshot; visível só a admin)
- `status_pagamento enum('pendente','parcial','pago','estornado')`
- `troco_para numeric null`
- `motoboy_id fk null`
- `observacoes`, `motivo_cancelamento null`
- `created_by`

**pedido_itens**
- `pedido_id`, `produto_id null`, `combo_variante_id null` (um dos dois obrigatório)
- `descricao_snapshot` (ex.: "Combo 2 – Picanha · Refri: Coca")
- `quantidade`, `preco_unitario_snapshot`, `custo_unitario_snapshot`, `subtotal`
- `escolhas jsonb` (sabor do refri etc.), `observacao` (ex.: "ao ponto")

**pedido_status_historico** — `pedido_id`, `de`, `para`, `usuario_id`, `em timestamptz`.

**pagamentos** — permite dividir pagamento.
- `pedido_id`, `forma enum('pix','dinheiro','credito','debito','outro')`, `valor`, `taxa numeric` (calculada pela configuração da maquininha), `recebido_em`, `conta_id` (onde entrou), `lancamento_id`.

### 5.8 Financeiro

**contas_financeiras** — `nome` (Caixa físico, Conta PJ, Maquininha), `tipo enum('caixa','banco','maquininha')`, `saldo_inicial`, `ativo`.

**categorias_financeiras** — `nome`, `tipo enum('entrada','saida')`, `grupo_dre enum('receita_vendas','outras_receitas','cmv','pessoal','entrega','ocupacao','utilidades','marketing','taxas','impostos','investimento','aporte_socio','retirada_socio','reserva','transferencia')`.
Seed: Vendas; Insumos/Carnes (Nutri); Coração e carvão (compra avulsa); Embalagens; Limpeza; Motoboy; Ajudantes; Água; Luz; Internet; Aluguel; Impostos; Taxa de cartão; Meta Ads/Marketing; Investimento em equipamento; Aporte de sócio; Distribuição de lucro; Reserva administrativa; Reserva de investimento.

**lancamentos** — coração do fluxo de caixa.
- `tipo enum('entrada','saida','transferencia')`
- `categoria_id`, `conta_id`, `conta_destino_id null` (transferência)
- `descricao`, `valor numeric(12,2)` (sempre positivo; o sinal vem do tipo)
- `data_competencia date` (a que mês/dia pertence — usado no DRE)
- `data_vencimento date` (quando deve ser pago/recebido — usado no fluxo previsto)
- `data_pagamento date null` (quando efetivamente saiu/entrou — usado no realizado)
- `status enum('previsto','realizado','cancelado')`
- Vínculos opcionais: `pedido_id`, `fornecedor_id`, `colaborador_id`, `socio_id`, `investimento_id`
- `anexo_key text null` (S3), `recorrencia_id null`, `observacao`

**recorrencias** — `descricao`, `categoria_id`, `conta_id`, `valor`, `frequencia enum('mensal','semanal')`, `dia`, `ativo`. Gera lançamentos previstos dos próximos 3 meses (água, luz, internet, aluguel).

**fechamentos_caixa** — `data_operacao`, `conta_id`, `saldo_inicial`, `total_entradas`, `total_saidas`, `saldo_esperado`, `saldo_contado`, `diferenca`, `observacao`, `fechado_por`. Unique (`data_operacao`, `conta_id`).

**metas_mensais** — reproduz o planejamento da aba "Custos x Receita".
- `mes date` (primeiro dia do mês), `meta_receita` (hoje R$ 37.510,00), `observacao`
- **metas_mensais_categorias** — `meta_id`, `categoria_id`, `valor_orcado` (Material 3.542; Água 500; Luz 500; Entrega 2.000; Reserva adm. 5.000; Reserva investimento 5.000; Pessoal 2.000)

**investimentos** — reproduz a aba "Custos iniciais" e o plano de expansão.
- `item`, `categoria enum('regulatorio','equipamento','infraestrutura','utensilios','outros')`, `quantidade`, `valor_unitario`, `total` (gerado), `status enum('planejado','orcado','comprado')`, `fornecedor`, `data_compra null`, `lancamento_id null`, `observacao`

### 5.9 Views / consultas de relatório (criar como SQL views ou queries no service)

- `vw_produto_margem` — produto, preço, custo (ficha técnica), margem R$, margem %.
- `vw_vendas_dia` — por data de operação: nº pedidos, faturamento, ticket médio, custo, margem, por canal, por tipo.
- `vw_itens_vendidos` — ranking de produtos/combos por quantidade e receita.
- `vw_pedidos_por_hora` — distribuição por faixa horária (validar pico 11h–14h).
- `vw_fluxo_caixa` — saldo diário previsto × realizado por conta.
- `vw_dre_mensal` — por `grupo_dre` e competência.

---

## 6. Regras de negócio

1. **Preço do item** vem de `produtos.preco_venda` ou `combo_variantes.preco` e é copiado para o snapshot no momento em que o item entra no pedido.
2. **Custo do item** = custo da ficha técnica no momento da venda (snapshot). Para combos, soma dos custos dos itens do combo com a carne escolhida.
3. **Taxa de entrega** vem do bairro; pode ser editada manualmente no pedido (com registro no histórico).
4. **Numeração** reinicia a cada data de operação (fuso São Paulo).
5. **Pagamento → caixa:** ao registrar um pagamento, criar lançamento de **entrada realizada** na categoria Vendas, na conta escolhida. Se forma = crédito/débito, criar também **saída** "Taxa de cartão" com o valor da taxa configurada.
6. **Cancelamento:** pedido cancelado com pagamento estorna os lançamentos (status `cancelado` + lançamento de estorno se já tinha sido realizado). Motivo obrigatório.
7. **Encomendas:** pedido com `agendado_para` em data futura aparece na Agenda e na Produção daquele dia, não na fila de hoje.
8. **Motoboy:** ao fechar o dia (ou ao clicar "Calcular equipe do dia"), `qtd_entregas` = pedidos do dia com `tipo='entrega'` e status `entregue` atribuídos àquele motoboy; `valor_devido = valor_fixo_dia + valor_por_entrega × qtd_entregas`. Gera lançamento **saída prevista** categoria Motoboy.
9. **Ajudantes:** presença na escala gera saída prevista na categoria Ajudantes com a diária. Permitir marcar "não remunerado" (ajuda voluntária) com valor 0 — o sistema deve deixar isso visível no relatório de pessoal, porque é custo real escondido.
10. **Compras de fornecedor:** lançamento de compra da Nutri gera saída **prevista** com `data_vencimento = data_compra + prazo_pagamento_dias` (5 dias). Ao pagar, vira realizado.
11. **Atualizar custo de insumo** recalcula custo e margem dos produtos e combos em tempo real (sem alterar pedidos passados) e grava histórico.
12. **Reajuste em lote:** admin pode aplicar % sobre uma seleção de produtos ou variantes de combo, com prévia antes de salvar e arredondamento opcional para ,90 / ,99.
13. **Distribuição de lucro:** na tela de DRE, "Resultado do mês" × `socios.percentual` mostra quanto cabe a cada sócio; botão "Registrar distribuição" cria lançamentos de saída `retirada_socio`. Aportes dos sócios entram como `aporte_socio` (não são receita).
14. **Reservas** (administrativa e de investimento) são saídas para uma conta de reserva (transferência), não despesa no DRE.
15. **Parceiros:** doces vendidos a preço de custo têm margem zero esperada — não disparar alerta de margem baixa para eles.
16. **Alerta de margem:** produto com margem < 40% (configurável) aparece destacado na tabela de preços.

---

## 7. Telas

Layout: menu lateral no desktop; **barra inferior com 4 atalhos no celular** (Novo pedido, Pedidos, Produção, Caixa) + menu "Mais". Telas marcadas 🔒 são só admin.

### 7.1 Login
Logo + tagline (Playfair Italic) + e-mail e senha via Cognito. "Esqueci a senha" pelo fluxo do Cognito. Primeiro acesso força troca de senha.

### 7.2 Dashboard 🔒 (operador vê apenas o bloco "Hoje")
- **Hoje:** pedidos, faturamento, ticket médio, pedidos em aberto por status, entregas pendentes.
- **Mês:** faturamento × meta (barra de progresso até R$ 37.510), margem bruta %, resultado parcial, projeção do mês.
- Gráficos: faturamento por dia de operação (últimos 8 fins de semana); pedidos por hora; top 10 produtos/combos; faturamento por canal e por bairro.
- Alertas: contas a pagar nos próximos 7 dias, produtos com margem abaixo do limite, fechamento de caixa pendente.

### 7.3 Novo pedido (tela mais importante — mobile first)
Fluxo em uma única tela rolável, sem modais aninhados:
1. **Cliente:** campo de telefone com busca instantânea. Se existir, preenche nome, endereço principal e observações. Se não, cria cliente inline (nome + telefone). Opção "Sem cadastro (balcão)".
2. **Canal** (chips: WhatsApp padrão, Instagram, Balcão, Telefone) e **tipo** (Entrega / Retirada).
3. **Quando:** "Agora" (padrão) ou data/hora agendada.
4. **Itens:** abas Combos | Carnes | Acompanhamentos | Bebidas | Doces & Geleias. Cards grandes com nome e preço; toque adiciona. Combo abre seletor de carne (com preço de cada variante) e de refrigerante. Stepper de quantidade; aceita 0,5 quando `permite_fracionado`. Observação por item.
5. **Entrega:** endereço (seleciona do cliente ou digita), bairro (define taxa), referência.
6. **Pagamento:** forma, "troco para", ou "pagar depois". Permite dividir.
7. **Resumo fixo no rodapé:** subtotal, desconto, taxa, **total** grande em dourado, botão **Confirmar pedido**.
Após confirmar: botões **Imprimir comanda** e **Copiar resumo para WhatsApp** (texto formatado com itens, total, endereço e previsão).

### 7.4 Pedidos do dia
- Visão **Kanban** por status (Confirmado → Em preparo → Pronto → Saiu p/ entrega → Entregue/Retirado) com arrastar ou botão "avançar". No celular, lista agrupada por status com filtro.
- Card: número, cliente, bairro, hora (ou agendado), total, ícone de pago/pendente, tempo desde a confirmação (fica laranja > 30 min, brasa > 45 min).
- Filtros: data, status, tipo, canal, motoboy, pagamento pendente.
- Ação em lote: atribuir motoboy a vários pedidos prontos.

### 7.5 Detalhe do pedido
Dados completos, itens, histórico de status, pagamentos, editar (enquanto não saiu para entrega), cancelar (com motivo), registrar pagamento, reimprimir comanda, copiar resumo WhatsApp. Admin vê custo e margem do pedido.

### 7.6 Comanda (impressão)
Página com CSS `@media print`, **preto e branco**, largura A5 ou térmica 80 mm (configurável): logo em P&B, número grande, data/hora, cliente, telefone, endereço + bairro + referência, itens com quantidades e observações, total, forma de pagamento, troco, campo "Motoboy: ____". Sem cores, fontes legíveis, sem desperdício de tinta.

### 7.7 Agenda de encomendas
Calendário/lista dos próximos fins de semana e feriados com pedidos agendados por dia e horário; total previsto por dia.

### 7.8 Produção do dia
Consolida os pedidos (confirmados + agendados para a data): quantidade de cada produto a preparar (espetos por tipo de carne, pães de alho, corações, arroz, maionese, bebidas), e via `rendimento_insumo` a **necessidade de insumos** (kg de cada carne, pacotes de coração, sacos de carvão). Campo para informar o que já tem em estoque → "Lista de compras" exportável/copiável.

### 7.9 Cardápio e Tabela de preços
Tabela com: produto, categoria, unidade, preço, custo 🔒, margem R$/% 🔒, disponível hoje (toggle rápido), ativo. Edição inline de preço (grava histórico). Botão **Reajuste em lote** (regra 12). Aba **Histórico** de preços por produto. Exportar CSV/XLSX.

### 7.10 Combos 🔒 (operador só visualiza)
Lista de combos; dentro, composição (itens × quantidade), variantes por carne com preço, custo, margem e desconto sobre o avulso. Criar novos kits (a planilha prevê kits família 1, 2 e 3).

### 7.11 Insumos e Fornecedores 🔒
- Insumos: nome, categoria, unidade de compra, custo atual, fornecedor, data do último custo, variação desde o anterior. Atualização rápida de custo. Histórico em gráfico.
- Fornecedores: cadastro com prazo de pagamento.
- Rendimento (fatores de espetos por kg etc.).

### 7.12 Ficha técnica 🔒
Por produto: lista de insumos e quantidades; custo calculado ao vivo; botão "sugerir pela tabela de rendimento".

### 7.13 Clientes
Lista com busca por nome/telefone; detalhe com endereços, observações, histórico de pedidos, total gasto, data do último pedido. Filtro "não pedem há mais de 30 dias" (base para campanhas de WhatsApp).

### 7.14 Bairros e taxas 🔒
CRUD simples: bairro, cidade, taxa, atende sim/não.

### 7.15 Equipe e escala 🔒
Cadastro de colaboradores com forma de remuneração. Escala por dia de operação (quem trabalhou), cálculo automático do motoboy, botão gerar lançamentos, marcar como pago (Pix).

### 7.16 Financeiro 🔒
- **Fluxo de caixa:** seletor de período e conta; gráfico de saldo diário (realizado em linha contínua, previsto tracejado); tabela extrato com entradas (+) e saídas (−), saldo acumulado; filtros por categoria/status.
- **Lançamentos:** criar/editar entrada, saída, transferência; anexar foto do boleto/nota (upload S3); marcar como pago; criar recorrência.
- **Contas a pagar / a receber:** previstos ordenados por vencimento, atrasados em destaque, "pagar" em um toque.
- **Fechamento de caixa do dia:** mostra entradas por forma de pagamento, saídas do dia, saldo esperado do caixa físico; usuário informa o valor contado; registra diferença.
- **DRE mensal:** Receita de vendas → (−) CMV → **Margem bruta** → (−) Pessoal, Entrega, Utilidades, Ocupação, Marketing, Taxas, Impostos → **Resultado operacional** → Reservas → **Resultado a distribuir** → divisão por sócio. Comparar com a meta e com o mês anterior.
- **Planejamento / Metas:** editar meta de receita e orçamento por categoria do mês; mostrar **orçado × realizado** por categoria. Inclui um **simulador** que reproduz a aba "Custos x Receita": informar quantidades previstas de insumos por mês e ver despesa, receita potencial, resultado, custo médio por espeto e valor por fim de semana (÷ 4).
- **Investimentos:** lista da aba "Custos iniciais" + itens de expansão; totais por categoria e status (planejado/orçado/comprado); marcar como comprado gera lançamento.
- **Sócios:** percentuais, aportes e retiradas acumulados por sócio.

### 7.17 Configurações 🔒
Usuários (convidar via Cognito, definir grupo), taxas da maquininha, contas financeiras, categorias, limite de alerta de margem, formato da comanda, dias de operação.

---

## 8. API

REST JSON em `https://api.DOMINIO/v1`. Todas as rotas exigem JWT do Cognito. Paginação `?page=&pageSize=`; datas ISO. Erros no formato `{ "error": { "code": "...", "message": "..." } }`.

| Módulo | Rotas principais |
|---|---|
| Auth | `GET /me` |
| Produtos | `GET/POST /produtos`, `PATCH /produtos/:id`, `POST /produtos/reajuste` (prévia com `?dryRun=true`), `GET /produtos/:id/historico` |
| Combos | `GET/POST /combos`, `PATCH /combos/:id`, `PUT /combos/:id/itens`, `PUT /combos/:id/variantes` |
| Insumos | `GET/POST /insumos`, `PATCH /insumos/:id`, `POST /insumos/:id/custo`, `GET /insumos/:id/historico` |
| Ficha técnica | `GET/PUT /produtos/:id/ficha-tecnica`, `GET/PUT /rendimentos` |
| Fornecedores | `GET/POST /fornecedores`, `PATCH /fornecedores/:id` |
| Clientes | `GET /clientes?busca=`, `GET /clientes/por-telefone/:tel`, `POST /clientes`, `PATCH /clientes/:id`, `GET /clientes/:id/pedidos` |
| Bairros | `GET/POST /bairros`, `PATCH /bairros/:id` |
| Pedidos | `GET /pedidos?data=&status=`, `POST /pedidos`, `GET /pedidos/:id`, `PATCH /pedidos/:id`, `POST /pedidos/:id/status`, `POST /pedidos/:id/cancelar`, `POST /pedidos/:id/pagamentos`, `GET /pedidos/:id/comanda`, `GET /pedidos/:id/resumo-whatsapp` |
| Produção | `GET /producao?data=` |
| Agenda | `GET /agenda?de=&ate=` |
| Equipe | `GET/POST /colaboradores`, `GET /escalas?data=`, `PUT /escalas/:data`, `POST /escalas/:data/gerar-lancamentos` |
| Financeiro | `GET/POST /lancamentos`, `PATCH /lancamentos/:id`, `POST /lancamentos/:id/pagar`, `GET /fluxo-caixa?de=&ate=&conta=`, `GET /contas-a-pagar`, `POST /fechamentos`, `GET /dre?mes=`, `GET/PUT /metas/:mes`, `GET/POST /recorrencias`, `GET/POST /investimentos`, `GET /socios/resumo` |
| Anexos | `POST /anexos/upload-url` (URL pré-assinada S3) |
| Relatórios | `GET /relatorios/vendas?de=&ate=&formato=json|csv|xlsx` |
| Config | `GET/PUT /configuracoes/:chave`, `GET/POST /usuarios` |

A lógica de cálculo (preço, custo, margem, valor do motoboy, taxa de cartão, DRE, simulador) fica em `apps/api/src/services` como **funções puras com testes unitários**, usando os números da planilha como casos de teste.

---

## 9. Seed inicial (dados da planilha)

### Insumos (custo por unidade de compra)
| Insumo | Unidade | Custo | Categoria |
|---|---|---|---|
| Picanha | kg | 50,00 | carne |
| Maminha | kg | 40,00 | carne |
| Alcatra | kg | 40,00 | carne |
| Vazio | kg | 40,00 | carne |
| Costela | kg | 20,00 | carne |
| Linguiça/Salsichão | peça | 30,00 | carne |
| Pão de alho | bandeja | 10,00 | acompanhamento |
| Coração | pacote | 20,00 | carne |
| Carvão | saco 5 kg | 20,00 | combustivel |
| Arroz | kg | 3,70 | acompanhamento |
| Maionese | porção 500 g | 5,00 | acompanhamento |
| Coca | garrafa | 10,00 | bebida |
| Guaraná | garrafa | 8,00 | bebida |
| Pepsi | garrafa | 8,00 | bebida |
| Geleia defumada | unidade | 16,90 | outros |
| Detergente | frasco | 2,50 | limpeza |
| Desinfetante | frasco | 20,00 | limpeza |
| Álcool | frasco | 8,00 | limpeza |
| Saco de lixo | pacote | 20,00 | limpeza |
| Panos descartáveis | rolo | 50,00 | limpeza |
| Embalagem quente | pacote 100 un | 60,00 | embalagem |
| Sacolas | pacote 100 un | 30,00 | embalagem |
| Papel alumínio | rolo | 4,00 | embalagem |
| Papel toalha | pacote | 5,00 | limpeza |

### Tabela individual de venda
| Produto | Preço | Observação |
|---|---|---|
| Picanha | 109,90 | `TODO(confirmar)` unidade |
| Maminha | 89,90 | |
| Alcatra | 89,90 | |
| Vazio | 89,90 | |
| Costela | 64,90 | |
| Salsichão | 59,90 | unidade avulsa 3,99 → criar produto "Salsichão (unidade)" |
| Pão de alho (bandeja) | 29,90 | unidade avulsa 14,99 → criar "Pão de alho (unidade)" |
| Coração | 49,90 | permite 0,5 |
| Arroz 500 g | 9,99 | |
| Maionese 300 g | 13,99 | |
| Coca | 15,00 | |
| Guaraná | 12,00 | |
| Pepsi | 12,00 | |
| Geleia defumada (King of Geleia) | 29,90 | parceiro |
| Doces (Doces by Nick) | a preço de custo | parceiro, `vendido_a_preco_de_custo = true` |

### Demais seeds
- Combos e variantes conforme seção 5.4.
- Rendimentos conforme seção 5.3.
- Fornecedor Nutri (prazo 5 dias, boleto).
- Colaboradores-modelo: Motoboy (30 + 10/entrega), Ajudante (diária 75).
- Sócios: 2 × 50%.
- Meta mensal e orçamentos conforme seção 5.8.
- Investimentos da aba "Custos iniciais": Aluguel 1.200; Registro MEI 0; Imposto 75,90; Alvará de funcionamento 400; Alvará sanitário 200; Licença bombeiros 200; Extintor 150; Churrasqueiras 5.166; Facas e tábuas 4 × 150; Balcão quente 500; Acessórios 10 × 100; Balança 100; Bancada inox 300; Aventais e toucas 10 × 15; Caixa de isopor 60; Geladeira 500. Todos com status `planejado` — `TODO(confirmar)` quais já foram comprados.

O seed deve ser idempotente (`pnpm db:seed` pode rodar mais de uma vez).

---

## 10. Infraestrutura (CDK)

Stacks separadas, em `infra/`:

1. **DnsCertStack** — hosted zone (ou importar existente), certificado ACM `us-east-1` para `app.DOMINIO` e `sa-east-1` para `api.DOMINIO`.
2. **DataStack** — Aurora Serverless v2 PostgreSQL 16, `minCapacity: 0` (auto-pause 60 min), `maxCapacity: 2`, Data API habilitada, secret no Secrets Manager, backup automático 7 dias, `deletionProtection: true` em prod. Bucket S3 de anexos (privado, criptografado, CORS para `app.DOMINIO`).
3. **AuthStack** — Cognito User Pool (login por e-mail, sem auto-cadastro), grupos `admin` e `operador`, app client SPA (sem secret, PKCE).
4. **ApiStack** — Lambda Node 20 (arm64, 512 MB, timeout 29 s), HTTP API com domínio customizado `api.DOMINIO`, JWT authorizer do Cognito, CORS restrito a `https://app.DOMINIO`, permissões IAM mínimas (`rds-data:*` no cluster, `secretsmanager:GetSecretValue` no secret, `s3:PutObject/GetObject` no bucket de anexos). Alarme CloudWatch para erros.
5. **WebStack** — bucket S3 privado + CloudFront com OAC, domínio `app.DOMINIO`, fallback de 403/404 para `index.html` (SPA), cache longo para assets com hash e sem cache para `index.html`.
6. **Budget** — AWS Budgets com alerta por e-mail (valor definido pelo Eduardo).

Ambientes: `dev` e `prod` via contexto do CDK (`-c env=prod`), com prefixo nos nomes dos recursos.

Variáveis do front (`.env`): `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION` — geradas a partir dos outputs do CDK.

### CI/CD (GitHub Actions)
- Em PR: lint, typecheck, testes.
- Em push na `main`: migrations (`drizzle-kit migrate` via Data API) → `cdk deploy --all` → build do front → `aws s3 sync` → invalidação do CloudFront.
- Autenticação na AWS via **OIDC** (role IAM assumida pelo GitHub), sem access keys.

### Desenvolvimento local
- `docker compose` com PostgreSQL 16 local; a camada Drizzle usa driver `node-postgres` local e `aws-data-api` na AWS (selecionado por variável de ambiente).
- `pnpm dev` sobe API (Hono em Node) e front (Vite) juntos.
- Em dev local, auth pode usar um usuário mock com papel configurável (`AUTH_MOCK=admin`).

---

## 11. Requisitos não funcionais

- Novo pedido utilizável em tela de 360 px, botões com área mínima de 44 px.
- Tempo de resposta da API < 500 ms com o banco ativo.
- Funciona com internet instável: TanStack Query com retry; rascunho do novo pedido salvo no `localStorage` até confirmar.
- Acessibilidade básica: contraste AA no tema escuro, labels nos inputs, navegação por teclado no desktop.
- Exportações CSV/XLSX nas listas de pedidos, lançamentos, produtos e DRE.
- LGPD: dados de clientes apenas nome, telefone e endereço; acesso só autenticado; logs sem telefone/endereço.

---

## 12. Plano de implementação (ordem para o Claude Code)

**Fase 0 — Fundação**
Monorepo, TypeScript strict, lint, Tailwind com tokens da marca, shadcn/ui, layout com menu e barra inferior, docker compose com Postgres, Drizzle + migrations, seed, auth mock local, CLAUDE.md com as convenções da seção 3.
✅ Pronto quando: `pnpm dev` abre o app com tema da marca e o seed popula o banco.

**Fase 1 — Cadastros e preços**
Produtos, combos (com variantes), insumos, fornecedores, ficha técnica, rendimentos, bairros, clientes. Cálculo de custo e margem com testes usando os números da planilha.
✅ Pronto quando: a tabela de preços mostra margem correta de todos os produtos e combos.

**Fase 2 — Pedidos (MVP operacional)**
Novo pedido, pedidos do dia (kanban/lista), detalhe, status, pagamentos, comanda impressa, resumo para WhatsApp, agenda, produção do dia.
✅ Pronto quando: é possível operar um fim de semana inteiro só pelo sistema (teste E2E do fluxo de novo pedido passando).

**Fase 3 — Infra AWS e deploy**
Stacks CDK, Cognito real, deploy dev e prod, domínio, CI/CD, Budgets.
✅ Pronto quando: `https://app.DOMINIO` está no ar com login e dados de seed.

**Fase 4 — Financeiro**
Contas, categorias, lançamentos automáticos de pedidos e taxas, lançamentos manuais, anexos, contas a pagar, recorrências, equipe/escala com cálculo do motoboy, fechamento de caixa, fluxo de caixa previsto × realizado.
✅ Pronto quando: o fechamento de um dia de operação bate com o caixa físico.

**Fase 5 — Gestão**
Dashboard, DRE, metas e orçado × realizado, simulador da planilha, investimentos, sócios e distribuição, relatórios e exportações.
✅ Pronto quando: o DRE do mês substitui a aba "Custos x Receita" da planilha.

**Futuro (fora do escopo agora)**
Integração com WhatsApp para receber pedidos automaticamente, cardápio público com link para pedido, controle de estoque com baixa automática, emissão de nota fiscal.

---

## 13. Pendências para confirmar com o Eduardo

1. Domínio exato e se o DNS já está no Route 53 ou em outro provedor.
2. Carnes da tabela individual: preço por espeto ou por kg?
3. Taxas de entrega por bairro e lista de bairros atendidos.
4. Taxas da maquininha (crédito e débito) e quais formas de pagamento são aceitas.
5. Quais itens da aba "Custos iniciais" já foram comprados.
6. Quem serão os usuários iniciais e o papel de cada um.
7. Valor do alerta de custo da AWS.
8. Formato da impressora da comanda (A4/A5 comum ou térmica 80 mm).
