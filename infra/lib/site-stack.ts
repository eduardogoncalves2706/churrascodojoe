import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

// Site público (docs/SPEC_landing_page.md, Fase D): bucket S3 privado + CloudFront com OAC.
// Domínio real é o www (Registro.br não aceita CNAME no ápice — o domínio raiz usa o recurso
// "Redirecionamento" do próprio Registro.br, fora da AWS, apontando pra www).
interface Props extends cdk.StackProps { prefix: string; prod: boolean; domainName?: string; certificateArn?: string }
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/site/dist');

export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'Site', {
      bucketName: `${props.prefix}-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      removalPolicy: props.prod ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY, autoDeleteObjects: !props.prod,
    });

    // "/pagina" → "/pagina/index.html" (Astro gera 1 index.html por rota, sem SPA fallback).
    const roteamento = new cf.Function(this, 'Roteamento', {
      code: cf.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) { request.uri += 'index.html'; }
  else if (uri.indexOf('.') === -1) { request.uri += '/index.html'; }
  return request;
}`),
      runtime: cf.FunctionRuntime.JS_2_0,
    });

    const certificate = props.certificateArn ? acm.Certificate.fromCertificateArn(this, 'Cert', props.certificateArn) : undefined;
    const domains = props.domainName && certificate ? [props.domainName] : undefined;

    const distribution = new cf.Distribution(this, 'Cdn', {
      comment: `${props.prefix} site`,
      defaultRootObject: 'index.html',
      priceClass: cf.PriceClass.PRICE_CLASS_ALL,
      domainNames: domains,
      certificate: domains ? certificate : undefined,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: roteamento, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
      },
      // S3 com OAC responde 403 (não 404) pra chave inexistente — mapeia os dois pra página 404 de verdade.
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
      ],
    });

    new deploy.BucketDeployment(this, 'Assets', {
      sources: [deploy.Source.asset(dist, { exclude: ['*.html'] })],
      destinationBucket: bucket, prune: false,
      cacheControl: [deploy.CacheControl.fromString('public,max-age=31536000,immutable')],
    });
    new deploy.BucketDeployment(this, 'Paginas', {
      sources: [deploy.Source.asset(dist, { exclude: ['_astro/*'] })],
      // prune:false — com dois BucketDeployment na mesma origem, prune:true nesse apagaria o _astro/*
      // que o outro (Assets) acabou de subir (cada deployment só "conhece" a própria fonte).
      destinationBucket: bucket, prune: false, distribution, distributionPaths: ['/*'],
      cacheControl: [deploy.CacheControl.fromString('public,max-age=60')],
    });

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
  }
}
