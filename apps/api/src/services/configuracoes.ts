import { eq } from 'drizzle-orm';
import { getDb, schema as s } from '../db/client';

/** Lê uma config pela chave (tabela `configuracoes`) — mesma fonte da tela Configurações, pra
 * qualquer serviço que precise de um valor configurado em runtime sem precisar de env var/redeploy. */
export async function lerConfig<T>(chave: string, padrao: T): Promise<T> {
  const [r] = await getDb().select().from(s.configuracoes).where(eq(s.configuracoes.chave, chave));
  return r ? (r.valor as T) : padrao;
}
