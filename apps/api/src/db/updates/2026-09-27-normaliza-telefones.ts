import { eq, isNotNull } from 'drizzle-orm';
import { normTel } from '../../services/clientes';
import type { Db } from '../client';
import { schema as s } from '../client';

/**
 * Clientes criados antes da normalização de telefone (E.164) ficaram com o valor cru
 * (ex.: "51997551047" em vez de "+5551997551047"), e por isso a busca por telefone exato
 * não os encontra. Idempotente: só reescreve o que ainda não está no formato certo.
 */
export async function normalizarTelefones(db: Db) {
  const clientes = await db.select().from(s.clientes).where(isNotNull(s.clientes.telefone));
  let normalizados = 0; const colisoes: string[] = [];
  for (const c of clientes) {
    if (!c.telefone) continue;
    const certo = normTel(c.telefone);
    if (certo === c.telefone) continue;
    const jaExiste = clientes.find((x) => x.id !== c.id && x.telefone === certo);
    if (jaExiste) { colisoes.push(c.nome); continue; }
    await db.update(s.clientes).set({ telefone: certo, updatedAt: new Date() }).where(eq(s.clientes.id, c.id));
    normalizados++;
  }
  return { normalizados, colisoes };
}
