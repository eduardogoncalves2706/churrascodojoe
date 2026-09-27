import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps { prefix: string; githubRepo: string }

/** Role assumida pelo GitHub Actions via OIDC (sem access keys). */
export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const provider = new iam.OpenIdConnectProvider(this, 'Github', { url: 'https://token.actions.githubusercontent.com', clientIds: ['sts.amazonaws.com'] });
    const role = new iam.Role(this, 'Deploy', {
      roleName: `${props.prefix}-github-deploy`,
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: { 'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:ref:refs/heads/main` },
      }),
    });
    // Deploy via CDK: assume os roles criados pelo bootstrap (cdk-*), que concentram as permissões de deploy.
    role.addToPolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [`arn:aws:iam::${this.account}:role/cdk-*`] }));
    new cdk.CfnOutput(this, 'RoleArn', { value: role.roleArn });
  }
}
