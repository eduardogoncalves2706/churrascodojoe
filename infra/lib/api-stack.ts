import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps {
  prefix: string; vpc: ec2.Vpc; lambdaSg: ec2.SecurityGroup; db: rds.DatabaseInstance; secret: sm.ISecret; dbName: string; dbUser: string; userPool: cognito.UserPool; client: cognito.UserPoolClient;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, 'Api', {
      functionName: `${props.prefix}-api`,
      entry: path.join(root, 'apps/api/src/index.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(root, 'pnpm-lock.yaml'),
      projectRoot: root,
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      vpc: props.vpc, securityGroups: [props.lambdaSg], vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        DB_HOST: props.db.dbInstanceEndpointAddress, DB_PORT: props.db.dbInstanceEndpointPort, DB_NAME: props.dbName, DB_USER: props.dbUser, DB_SECRET_ARN: props.secret.secretArn,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: { format: OutputFormat.ESM, minify: true, sourceMap: true, target: 'node24', mainFields: ['module', 'main'],
        commandHooks: { beforeBundling: () => [], beforeInstall: () => [], afterBundling: (inputDir: string, outputDir: string) => [`cp -r "${inputDir}/apps/api/src/db/migrations" "${outputDir}/migrations"`] },
        banner: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
    });
    // permissões mínimas: ler só o segredo do banco; rede: só a porta do Postgres
    props.secret.grantRead(fn);

    this.httpApi = new apigw.HttpApi(this, 'Http', { apiName: `${props.prefix}-api`, description: 'Churrasco do Joe — API' });
    const integration = new HttpLambdaIntegration('LambdaInt', fn);
    const authorizer = new HttpJwtAuthorizer('Cognito', `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`, {
      jwtAudience: [props.client.userPoolClientId],
    });
    this.httpApi.addRoutes({ path: '/health', methods: [apigw.HttpMethod.GET], integration });
    this.httpApi.addRoutes({ path: '/v1/{proxy+}', methods: [apigw.HttpMethod.ANY], integration, authorizer });

    new cw.Alarm(this, 'Erros', {
      alarmName: `${props.prefix}-api-erros`,
      metric: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1, evaluationPeriods: 1, treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
