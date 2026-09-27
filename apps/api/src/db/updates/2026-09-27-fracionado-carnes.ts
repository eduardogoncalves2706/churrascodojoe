import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { schema as s } from '../client';

/** Carnes vendidas por espeto que também podem ser vendidas em meio espeto (preço = metade). */
const CARNES_FRACIONAVEIS = ['Picanha', 'Maminha', 'Alcatra', 'Vazio', 'Costela'];

/** Idempotente: liga permiteFracionado nessas carnes (0,5 espeto já funciona no pedido — preço = unitário × quantidade). */
export async function habilitarFracionadoCarnes(db: Db) {
  let alterados = 0;
  for (const nome of CARNES_FRACIONAVEIS) {
    const [p] = await db.select().from(s.produtos).where(eq(s.produtos.nome, nome));
    if (!p) { console.warn(`produto não encontrado, ignorado: ${nome}`); continue; }
    if (p.permiteFracionado) continue;
    await db.update(s.produtos).set({ permiteFracionado: true, updatedAt: new Date() }).where(eq(s.produtos.id, p.id));
    alterados++;
  }
  return { alterados };
}
