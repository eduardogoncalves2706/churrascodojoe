# Churrasco do Joe — convenções

Especificação completa em `docs/SPEC.md` (seguir as fases da seção 12 na ordem).

## Comandos
- `pnpm db:up` sobe o Postgres 16 local (porta 5433) · `pnpm db:migrate` · `pnpm db:seed` (idempotente)
- `pnpm dev` sobe API (Hono, :3001) e web (Vite, :5173; proxy `/v1`)
- `pnpm test` (Vitest: regras de cálculo + integração da API contra o Postgres local) · `npx playwright test` (E2E do novo pedido)
- `pnpm typecheck`

## Regras obrigatórias
- **Dinheiro:** `NUMERIC(12,2)` no banco; cálculos em **centavos inteiros** (`@joe/shared`); nunca float. Formatar `R$ 1.234,56` só na exibição.
- **Quantidades:** `NUMERIC(12,3)`. **Datas:** UTC no banco; "dia de operação" = data local `America/Sao_Paulo`.
- **Snapshots:** pedido guarda nome/preço/custo dos itens; mudar preço nunca altera pedido antigo.
- **Soft delete** (`ativo`); nada é apagado fisicamente.
- **Autorização na API:** custo/margem/financeiro só `admin`; respostas ao `operador` passam por `stripCustos`.
- **Zod:** nunca usar `.partial()` em schema com `.default()` (o default sobrescreve campos não enviados no PATCH).
- Regras de cálculo ficam como funções puras (`packages/shared`, `apps/api/src/services`) com testes usando os números da planilha.
- Logs sem telefone/endereço (LGPD). UI em português; comanda impressa em preto e branco.

## Dev local
`AUTH_MOCK=admin|operador` (`.env`); header `x-mock-role` troca o papel (há um botão no menu em dev).
