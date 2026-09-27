import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps { prefix: string; prod: boolean; backupDays?: number }

export class DataStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly db: rds.DatabaseInstance;
  readonly secret: sm.ISecret;
  readonly lambdaSg: ec2.SecurityGroup;
  readonly dbName = 'joe';
  readonly dbUser = 'joe_admin';
  readonly attachments: s3.Bucket;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const keep = props.prod ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // Sem NAT Gateway (~US$35/mês): a Lambda fala com o RDS dentro da VPC isolada e
    // com o Secrets Manager por um endpoint privado (uma AZ).
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2, natGateways: 0,
      subnetConfiguration: [{ name: 'db', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });
    this.vpc.addInterfaceEndpoint('SecretsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnets: [this.vpc.isolatedSubnets[0]] },
    });

    this.db = new rds.DatabaseInstance(this, 'Db', {
      instanceIdentifier: `${props.prefix}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromGeneratedSecret(this.dbUser),
      databaseName: this.dbName,
      vpc: this.vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }, publiclyAccessible: false,
      allocatedStorage: 20, storageType: rds.StorageType.GP3, storageEncrypted: true, multiAz: false,
      // Plano gratuito da conta limita a 1 dia; após o upgrade use -c backupDays=7.
      backupRetention: cdk.Duration.days(props.backupDays ?? 1),
      deletionProtection: props.prod,
      removalPolicy: props.prod ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
    });
    this.secret = this.db.secret!;
    // SG da Lambda vive aqui para a regra de entrada do banco não criar dependência circular entre stacks
    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', { vpc: this.vpc, description: 'Lambda da API', allowAllOutbound: true });
    this.db.connections.allowDefaultPortFrom(this.lambdaSg);

    this.attachments = new s3.Bucket(this, 'Anexos', {
      bucketName: `${props.prefix}-anexos-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      cors: [{ allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT], allowedOrigins: ['https://*.cloudfront.net'], allowedHeaders: ['*'] }],
      removalPolicy: keep, autoDeleteObjects: !props.prod,
    });

    new cdk.CfnOutput(this, 'DbEndpoint', { value: this.db.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'SecretArn', { value: this.secret.secretArn });
  }
}
