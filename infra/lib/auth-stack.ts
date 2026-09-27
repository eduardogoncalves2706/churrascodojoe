import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps { prefix: string; prod: boolean }

export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly client: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    this.userPool = new cognito.UserPool(this, 'Pool', {
      userPoolName: `${props.prefix}-users`,
      signInAliases: { email: true },
      selfSignUpEnabled: false, // sem auto-cadastro
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 10, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: props.prod ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    new cognito.CfnUserPoolGroup(this, 'GrupoAdmin', { userPoolId: this.userPool.userPoolId, groupName: 'admin', description: 'Sócios: acesso total' });
    new cognito.CfnUserPoolGroup(this, 'GrupoOperador', { userPoolId: this.userPool.userPoolId, groupName: 'operador', description: 'Atendentes: sem custo/financeiro' });

    this.client = this.userPool.addClient('Spa', { userPoolClientName: `${props.prefix}-spa`, generateSecret: false, authFlows: { userSrp: true }, preventUserExistenceErrors: true });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'ClientId', { value: this.client.userPoolClientId });
  }
}
