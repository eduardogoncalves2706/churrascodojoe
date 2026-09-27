import type { Context, MiddlewareHandler } from 'hono';

export interface AuthUser { sub: string; nome: string; papel: 'admin' | 'operador' }
export type Env = { Variables: { user: AuthUser } };

/** Dev: AUTH_MOCK=admin|operador (header x-mock-role troca o papel). AWS: claims do JWT authorizer do Cognito. */
export const auth: MiddlewareHandler<Env> = async (c, next) => {
  const mock = process.env.AUTH_MOCK;
  if (mock) {
    const h = c.req.header('x-mock-role');
    const papel = h === 'admin' || h === 'operador' ? h : (mock as AuthUser['papel']);
    c.set('user', { sub: 'mock', nome: `Mock ${papel}`, papel });
    return next();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claims = (c.env as any)?.event?.requestContext?.authorizer?.jwt?.claims as Record<string, string> | undefined;
  if (!claims?.sub) return c.json({ error: { code: 'unauthorized', message: 'Não autenticado' } }, 401);
  const groups = String(claims['cognito:groups'] ?? '');
  const papel = /(^|[\s,[])admin([\s,\]]|$)/.test(groups) ? 'admin' : 'operador';
  c.set('user', { sub: claims.sub, nome: claims.email ?? claims.sub, papel });
  return next();
};

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get('user').papel !== 'admin') return c.json({ error: { code: 'forbidden', message: 'Apenas administradores' } }, 403);
  return next();
};

export const isAdmin = (c: Context<Env>) => c.get('user').papel === 'admin';

const CUSTO_KEYS = /^(custo|margem)/i;
/** Remove recursivamente campos de custo/margem (respostas para operador). */
export function stripCustos<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripCustos) as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !CUSTO_KEYS.test(k)).map(([k, x]) => [k, stripCustos(x)])) as T;
  }
  return v;
}
