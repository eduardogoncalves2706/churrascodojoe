import {
  AdminAddUserToGroupCommand, AdminCreateUserCommand, AdminDisableUserCommand, AdminEnableUserCommand,
  AdminRemoveUserFromGroupCommand, CognitoIdentityProviderClient, ListUsersCommand, ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { PAPEIS, type Papel } from '@joe/shared';

const UserPoolId = process.env.COGNITO_USER_POOL_ID;
const client = new CognitoIdentityProviderClient({});

export class ErroUsuarios extends Error { constructor(message: string, public status = 400) { super(message); } }

function exigirConfig() {
  if (!UserPoolId) throw new ErroUsuarios('Cognito não configurado neste ambiente (rode AUTH_MOCK em dev local)', 501);
}

const attr = (u: { Attributes?: { Name?: string; Value?: string }[] }, nome: string) => u.Attributes?.find((a) => a.Name === nome)?.Value;

export interface UsuarioListado { sub: string; nome: string; email: string; papel: Papel; ativo: boolean; status: string }

/** Lista todos os usuários com o papel deduzido dos grupos do Cognito (um usuário deveria estar em só um). */
export async function listarUsuarios(): Promise<UsuarioListado[]> {
  exigirConfig();
  const [admins, operadores] = await Promise.all(
    PAPEIS.map((papel) => client.send(new ListUsersInGroupCommand({ UserPoolId, GroupName: papel }))),
  );
  const papelPorSub = new Map<string, Papel>();
  admins.Users?.forEach((u) => u.Username && papelPorSub.set(u.Username, 'admin'));
  operadores.Users?.forEach((u) => u.Username && papelPorSub.set(u.Username, 'operador'));

  const todos = await client.send(new ListUsersCommand({ UserPoolId, Limit: 60 }));
  return (todos.Users ?? []).map((u) => ({
    sub: u.Username!, nome: attr(u, 'name') ?? attr(u, 'email') ?? u.Username!, email: attr(u, 'email') ?? '',
    papel: papelPorSub.get(u.Username!) ?? 'operador', ativo: u.Enabled ?? true, status: u.UserStatus ?? 'DESCONHECIDO',
  })).sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Convida um usuário novo: cria no Cognito (senha temporária por e-mail) e coloca no grupo do papel. */
export async function convidarUsuario(nome: string, email: string, papel: Papel): Promise<void> {
  exigirConfig();
  try {
    await client.send(new AdminCreateUserCommand({
      UserPoolId, Username: email, DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }, { Name: 'name', Value: nome }],
    }));
  } catch (e) {
    if (e instanceof Error && e.name === 'UsernameExistsException') throw new ErroUsuarios('Já existe um usuário com esse e-mail', 409);
    throw e;
  }
  await client.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: email, GroupName: papel }));
}

/** Reenvia o e-mail de convite (nova senha temporária) para quem ainda não fez o primeiro login. */
export async function reenviarConvite(email: string): Promise<void> {
  exigirConfig();
  await client.send(new AdminCreateUserCommand({ UserPoolId, Username: email, MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'] }));
}

export async function definirPapel(email: string, papel: Papel): Promise<void> {
  exigirConfig();
  const outro = PAPEIS.find((p) => p !== papel)!;
  await client.send(new AdminRemoveUserFromGroupCommand({ UserPoolId, Username: email, GroupName: outro })).catch(() => undefined);
  await client.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: email, GroupName: papel }));
}

export async function definirAtivo(email: string, ativo: boolean): Promise<void> {
  exigirConfig();
  await client.send(ativo ? new AdminEnableUserCommand({ UserPoolId, Username: email }) : new AdminDisableUserCommand({ UserPoolId, Username: email }));
}
