# Deploy (conta 255530396736, sa-east-1)

URL atual: https://d1n2sxty84d3c8.cloudfront.net (front e `/v1/*` da API pelo mesmo CloudFront, sem CORS).

## Comandos
    export AWS_REGION=sa-east-1 CDK_DEFAULT_ACCOUNT=255530396736
    pnpm --filter @joe/web build          # com apps/web/.env.production (IDs do Cognito)
    cd infra && npx cdk deploy --all --require-approval never

Migrations e seed rodam dentro da VPC, por invocação direta da Lambda (o banco não é acessível de fora):

    aws lambda invoke --region sa-east-1 --function-name joe-prod-api --cli-binary-format raw-in-base64-out --payload '{"joeAdmin":"migrate"}' /tmp/o.json
    aws lambda invoke --region sa-east-1 --function-name joe-prod-api --cli-binary-format raw-in-base64-out --payload '{"joeAdmin":"seed"}' /tmp/o.json

Novo usuário: `aws cognito-idp admin-create-user` + `admin-add-user-to-group --group-name admin|operador`.

## Domínio próprio (Registro.br)
1. Informar o domínio (ex.: `app.seudominio.com.br`). Emito o certificado ACM em us-east-1.
2. No Registro.br, criar o CNAME de validação que o ACM mostrar.
3. Redeploy com `-c domain=app.seudominio.com.br -c certificateArn=<arn>`.
4. No Registro.br, criar `app` CNAME `d1n2sxty84d3c8.cloudfront.net`.

## Limites do plano gratuito da conta
- Aurora bloqueado (exige Express configuration) → RDS Postgres t4g.micro.
- Backup do RDS com 1 dia (`-c backupDays=7` após o upgrade da conta).
- Custos fixos aproximados: RDS t4g.micro + 20 GB, endpoint privado do Secrets Manager (~US$7/mês), Secrets Manager. Sem NAT.

## Gateway de pagamento (Mercado Pago)
Código pronto (`services/mercadoPago.ts`, `POST /pedidos/:id/pagamento-pix`, webhook em
`POST /v1/public/webhooks/mercadopago`) mas **não ativo em produção**. Credencial **não é variável
de ambiente** — o próprio cliente cola o Access Token e o segredo do webhook em Configurações →
Pagamento online (guardado em `configuracoes`, igual qualquer outra config; chave sensível, só
admin lê o status, nunca o valor — ver `CHAVES_SENSIVEIS` em `routes/config.ts`). Isso significa
trocar/cadastrar a credencial não precisa de redeploy nenhum.

O que falta pra funcionar de verdade é só rede: a Lambda roda numa subnet isolada sem saída pra
internet (`natGateways: 0` em `data-stack.ts`), então não alcança a API do Mercado Pago de lá.
1. Resolver a saída de internet da Lambda (NAT Gateway ou NAT instance — muda a topologia de
   subnet; cuidado se já tiver RDS de produção na mesma VPC, risco de substituição do banco se
   feito sem planejar).
2. O cliente cria a aplicação dele no painel do Mercado Pago, pega o Access Token e o segredo do
   webhook, e cola em Configurações → Pagamento online no próprio sistema.
3. Configurar a URL do webhook no painel do Mercado Pago: `https://<api>/v1/public/webhooks/mercadopago`.

Em deploy novo (cliente sem RDS existente), o passo 1 é bem mais simples — dá pra desenhar a VPC
com NAT desde o início, sem risco de substituir banco nenhum.

## GitHub Actions
Workflows em `.github/workflows`. Para habilitar: `cdk deploy Joe-prod-GithubOidc -c githubRepo=usuario/repo`, e definir as variáveis `AWS_ACCOUNT_ID` e `AWS_DEPLOY_ROLE_ARN` no repositório.
