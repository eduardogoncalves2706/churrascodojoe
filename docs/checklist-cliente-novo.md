# Checklist — cliente novo

Modelo de venda: **não é SaaS multi-tenant**. Cada cliente recebe uma cópia do
sistema (deploy próprio, de preferência na conta AWS do cliente), customizada
no catálogo/regras de negócio e com a marca do cliente. Sem tenant_id, sem
isolamento de linha — é um deploy isolado por cliente. Suporte/evolução
contínua é vendido por fora, cobrado diretamente (sem plataforma de billing
por enquanto).

Isso separa o trabalho em 3 camadas:

| Camada | O que é | Onde mexe | Precisa rebuild/deploy? |
|---|---|---|---|
| 1 — Runtime | Nome do negócio, WhatsApp, Instagram, horário, endereço, FAQ, parceiros, taxas de maquininha, margem mínima | Tela **Configurações** do sistema, já logado como admin | Não — é tabela `configuracoes`, lida ao vivo |
| 2 — Build-time (white label) | Cores, fontes, logos, título da aba, domínio, PWA | Arquivos abaixo | Sim |
| 3 — Catálogo/negócio (bespoke) | Categorias, produtos, combos, bairros/taxas de entrega, textos de marca (tagline, piadas) | `apps/api/src/db/seed.ts` + alguns componentes do site | Sim — isso é customização paga por cliente, não dá pra generalizar |

## 1. AWS do cliente

1. Conta AWS do cliente (ele paga a estrutura). Pedir acesso (role/perfil) ou
   rodar o deploy a partir de uma conta com permissão.
2. `export CDK_DEFAULT_ACCOUNT=<conta-do-cliente> AWS_REGION=sa-east-1`
3. `cd infra && npx cdk bootstrap` (primeira vez na conta).

## 2. White label — camada 2 (editar antes do primeiro deploy)

- **Cores/fontes**: `packages/shared/src/marca.ts` — único lugar, alimenta
  `apps/web/tailwind.config.ts` e `apps/site/tailwind.config.ts`.
- **Logos/ícones**: trocar os arquivos em `apps/web/public/` e
  `apps/site/public/` (`logo.png`, `logo-192.png`, `logo-512.png`,
  `favicon-64.png`, `icon.svg`) mantendo os mesmos nomes/tamanhos.
- **Título da aba e PWA**: `apps/web/index.html` (`<title>`) e
  `apps/web/public/manifest.webmanifest` (`name`, `short_name`,
  `background_color`, `theme_color`).
- **Domínio do site público**: `apps/site/astro.config.mjs` (`site:`),
  `apps/site/public/robots.txt` (Sitemap) e `apps/site/public/sitemap.xml`
  (URLs), `apps/site/src/pages/index.astro` (`APP_URL`, link pro sistema
  interno).
- **URL da API usada no build do site**: fallback hardcoded em
  `apps/site/src/lib/api.ts` (`const API = ... ?? 'https://...'`) — trocar
  pela URL da API do cliente depois do primeiro deploy da `Joe-<env>-Api`.
- **Domínio/certificado do sistema interno e do site**: defaults hardcoded em
  `infra/bin/joe.ts` (`WebStack`/`SiteStack` — `domainName`/`certificateArn`).
  Ficam vazios no primeiro deploy (sem domínio próprio ainda); depois de
  emitir os certificados ACM (us-east-1) e validar no DNS do cliente, voltar
  aqui e fixar os ARNs — não deixar como flag `-c` solta, senão um deploy
  futuro sem a flag derruba o alias (ver `docs/DEPLOY.md`).

Textos de marca mais "de voz" (tagline da Hero, piada da 404, "Fogo, carne e
gente boa" da tela de login) ficam marcados com comentário no código — são
copy bespoke, trocar à mão por cliente, não vale generalizar em config.

## 3. Catálogo e regras de negócio — camada 3 (bespoke, cobrado como customização)

Editar `apps/api/src/db/seed.ts`: categorias, produtos, combos (com o modelo
de "carne escolhida"/fracionado se o cliente tiver algo parecido, senão
simplificar), bairros e taxas de entrega, taxas de maquininha, margem mínima.
Isso é o trabalho específico de cada contrato — não existe versão genérica.

## 4. Deploy

    export AWS_REGION=sa-east-1 CDK_DEFAULT_ACCOUNT=<conta-do-cliente>
    pnpm --filter @joe/web build       # antes de ter .env.production do Cognito, pode ficar sem auth (AUTH_MOCK)
    cd infra && npx cdk deploy --all --require-approval never

Depois do primeiro deploy (sem domínio):
1. Copiar `UserPoolId`/`ClientId` do output do `Auth` stack para
   `apps/web/.env.production` (`VITE_COGNITO_USER_POOL_ID`,
   `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION`) e rebuildar/redeployar o
   `Web` stack.
2. Migrations + seed (banco só acessível de dentro da VPC):

       aws lambda invoke --region sa-east-1 --function-name <prefix>-api --cli-binary-format raw-in-base64-out --payload '{"joeAdmin":"migrate"}' /tmp/o.json
       aws lambda invoke --region sa-east-1 --function-name <prefix>-api --cli-binary-format raw-in-base64-out --payload '{"joeAdmin":"seed"}' /tmp/o.json

3. Domínio próprio: ver `docs/DEPLOY.md` (emitir cert ACM, apontar DNS pro
   `*.cloudfront.net`, só então redeployar com o alias — CloudFront recusa
   roubar um alias que ainda resolve pra outra distribution).

## 5. Onboarding (camada 1 — dentro do próprio sistema, já logado como admin)

Tudo isso é feito na tela **Configurações**, sem precisar de mim depois do
deploy inicial:
- **Identidade do negócio**: nome do negócio (usado no cabeçalho, aba do
  navegador e no site público).
- **Operação**: horário de pico, dias de operação, margem mínima.
- **Pagamento**: taxas de maquininha por forma de pagamento, mensagem padrão
  de confirmação no WhatsApp.
- **Site público**: WhatsApp, Instagram, CNPJ/razão social, endereço (ou
  "combinado pelo WhatsApp"), horário em texto livre, FAQ, parceiros,
  liga/desliga de pré-pedidos pelo site.

## 6. Usuários

    aws cognito-idp admin-create-user --user-pool-id <pool-id> --username <email> ...
    aws cognito-idp admin-add-user-to-group --user-pool-id <pool-id> --username <email> --group-name admin|operador

## 7. Verificação final

- [ ] Sistema interno abre no domínio certo, com logo/nome do cliente
- [ ] Site público abre, cardápio carrega, WhatsApp/endereço corretos
- [ ] Login funciona com usuário real (não `AUTH_MOCK`)
- [ ] Um pedido de teste fecha a comanda certa (preço, taxa, margem)
- [ ] `robots.txt`/`sitemap.xml` apontam pro domínio do cliente, não pro do Joe
