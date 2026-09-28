import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { SiteStack } from '../lib/site-stack';
import { WebStack } from '../lib/web-stack';

const app = new cdk.App();
const envName = (app.node.tryGetContext('env') as string | undefined) ?? 'prod';
const prod = envName === 'prod';
const prefix = `joe-${envName}`;
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'sa-east-1' };
const Name = (s: string) => `Joe-${envName}-${s}`;

const data = new DataStack(app, Name('Data'), { env, prefix, prod, backupDays: Number(app.node.tryGetContext('backupDays') ?? 1) });
const auth = new AuthStack(app, Name('Auth'), { env, prefix, prod });
const api = new ApiStack(app, Name('Api'), { env, prefix, vpc: data.vpc, lambdaSg: data.lambdaSg, db: data.db, secret: data.secret, dbName: data.dbName, dbUser: data.dbUser, userPool: auth.userPool, client: auth.client });
// Domínio do sistema interno em prod: app.churrascodojoe.com.br (fixo aqui pra não depender de
// repetir -c domain=... -c certificateArn=... em todo deploy e o CloudFront perder o alias/cert).
new WebStack(app, Name('Web'), {
  env, prefix, prod, httpApi: api.httpApi,
  domainName: app.node.tryGetContext('domain') ?? (prod ? 'app.churrascodojoe.com.br' : undefined),
  certificateArn: app.node.tryGetContext('certificateArn') ?? (prod ? 'arn:aws:acm:us-east-1:255530396736:certificate/007770b6-473f-42e0-9fc7-8cd17f19a148' : undefined),
});

// Site público: domínio real é www (Registro.br não aceita CNAME no ápice; a raiz redireciona pro www
// via "Redirecionamento" do próprio Registro.br, fora da AWS). Certificado já emitido cobre os dois como SAN.
// 1º deploy sem alias (o DNS de www ainda aponta pro CloudFront antigo — a AWS recusa um 2º
// CloudFront reivindicando um domínio que hoje resolve pra outra distribuição). Depois que o
// Eduardo trocar o CNAME pro domínio novo, redeploy com siteDomain=www.churrascodojoe.com.br.
new SiteStack(app, Name('Site'), {
  env, prefix, prod,
  domainName: app.node.tryGetContext('siteDomain'),
  certificateArn: app.node.tryGetContext('siteCertificateArn') ?? (prod ? 'arn:aws:acm:us-east-1:255530396736:certificate/2085182a-8244-4cb9-ad0d-e69a6186b539' : undefined),
});

// Opcional: role OIDC para o GitHub Actions (-c githubRepo=usuario/repositorio)
const githubRepo = app.node.tryGetContext('githubRepo') as string | undefined;
if (githubRepo) new GithubOidcStack(app, Name('GithubOidc'), { env, prefix, githubRepo });
