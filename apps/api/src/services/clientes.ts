import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schema as s } from '../db/client';

export const normTel = (t: string) => { const d = t.replace(/\D/g, ''); return d.startsWith('55') ? `+${d}` : `+55${d}`; };

interface DadosCliente { nome: string; telefone?: string | null; instagram?: string | null; observacoes?: string | null }
/** Aceita tanto o Db quanto uma transação (o serviço de pedidos chama isso dentro de uma tx). */
type Queryable = Pick<Db, 'select' | 'insert' | 'update'>;

/**
 * Reaproveita cliente já cadastrado em vez de duplicar:
 * - com telefone: telefone é a chave (é a única forma confiável de identificar o mesmo cliente).
 * - sem telefone (import de cadastros antigos): o nome (sem diferenciar maiúsculas) é o critério,
 *   comparado só entre clientes que também não têm telefone — para não colidir com alguém já
 *   identificado por telefone e que por coincidência tem o mesmo nome.
 */
export async function encontrarOuCriarCliente(db: Queryable, dados: DadosCliente): Promise<{ cliente: typeof s.clientes.$inferSelect; novo: boolean }> {
  const nome = dados.nome.trim();
  const telefone = dados.telefone?.trim() ? normTel(dados.telefone) : null;

  const [existente] = telefone
    ? await db.select().from(s.clientes).where(eq(s.clientes.telefone, telefone))
    : await db.select().from(s.clientes).where(and(isNull(s.clientes.telefone), sql`lower(${s.clientes.nome}) = lower(${nome})`));

  if (existente) {
    if (nome && nome !== existente.nome) {
      const [atualizado] = await db.update(s.clientes).set({ nome, updatedAt: new Date() }).where(eq(s.clientes.id, existente.id)).returning();
      return { cliente: atualizado, novo: false };
    }
    return { cliente: existente, novo: false };
  }

  const [criado] = await db.insert(s.clientes).values({ nome, telefone, instagram: dados.instagram, observacoes: dados.observacoes }).returning();
  return { cliente: criado, novo: true };
}
