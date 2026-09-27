import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps { prefix: string; prod: boolean; httpApi: apigw.HttpApi; domainName?: string; certificateArn?: string }
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/dist');

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'Site', {
      bucketName: `${props.prefix}-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      removalPolicy: props.prod ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY, autoDeleteObjects: !props.prod,
    });

    // Fallback de SPA só na rota do site (não no /v1, para erros da API chegarem intactos).
    const spaFallback = new cf.Function(this, 'SpaFallback', {
      code: cf.FunctionCode.fromInline(`function handler(event){var r=event.request;var u=r.uri;if(u.indexOf('.')===-1){r.uri='/index.html';}return r;}`),
      runtime: cf.FunctionRuntime.JS_2_0,
    });

    const apiHost = cdk.Fn.select(2, cdk.Fn.split('/', props.httpApi.apiEndpoint));
    const certificate = props.certificateArn ? acm.Certificate.fromCertificateArn(this, 'Cert', props.certificateArn) : undefined;

    const distribution = new cf.Distribution(this, 'Cdn', {
      comment: `${props.prefix} web + api`,
      defaultRootObject: 'index.html',
      priceClass: cf.PriceClass.PRICE_CLASS_ALL,
      domainNames: props.domainName && certificate ? [props.domainName] : undefined,
      certificate: props.domainName && certificate ? certificate : undefined,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaFallback, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/v1/*': {
          origin: new origins.HttpOrigin(apiHost, { protocolPolicy: cf.OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // assets com hash: cache longo; index.html e demais: sem cache
    new deploy.BucketDeployment(this, 'Assets', {
      sources: [deploy.Source.asset(dist, { exclude: ['index.html', 'manifest.webmanifest', 'icon.svg'] })],
      destinationBucket: bucket, prune: false,
      cacheControl: [deploy.CacheControl.fromString('public,max-age=31536000,immutable')],
    });
    new deploy.BucketDeployment(this, 'Shell', {
      sources: [deploy.Source.asset(dist, { exclude: ['assets/*'] })],
      destinationBucket: bucket, prune: false, distribution, distributionPaths: ['/*'],
      cacheControl: [deploy.CacheControl.fromString('no-cache')],
    });

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
  }
}
