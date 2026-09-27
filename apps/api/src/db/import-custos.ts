import { eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { schema as s } from './client';

interface Linha { produto: string; custo: string; origem: string }

function parseCsv(texto: string): Linha[] {
  return texto.trim().split('\n').slice(1) // pula cabeçalho "produto,custo_unitario,origem"
    .map((l) => {
      const [produto, custo, ...resto] = l.split(',');
      return { produto: produto?.trim() ?? '', custo: custo?.trim() ?? '', origem: resto.join(',').trim() };
    })
    .filter((l) => l.produto && l.custo && !Number.isNaN(Number(l.custo)));
}

/** Detecta "parceria <nome>: vendido a preço de custo" na origem (padrão usado pelos doces de parceiro). */
function parceriaPrecoDeCusto(origem: string): string | null {
  const m = /parceria (.+?):\s*vendido a preço de custo/i.exec(origem);
  return m ? m[1].trim() : null;
}

export interface ResultadoImportCustos {
  atualizados: string[]; semFicha: string[]; comFichaIgnorados: string[]; naoEncontrados: string[]; parceriaAtualizada: string[];
}

/**
 * Import de custos diretos (SPEC_adendo_rateio_custos.md): colunas produto,custo_unitario,origem.
 * Casa por nome exato. Produto com ficha técnica é ignorado (ela manda, recalcula ao vivo);
 * sem ficha técnica, grava em `produtos.custo_direto` com histórico (motivo = origem). Idempotente.
 */
export async function importarCustos(db: Db, csvTexto: string): Promise<ResultadoImportCustos> {
  const linhas = parseCsv(csvTexto);
  const r: ResultadoImportCustos = { atualizados: [], semFicha: [], comFichaIgnorados: [], naoEncontrados: [], parceriaAtualizada: [] };

  for (const l of linhas) {
    const [p] = await db.select().from(s.produtos).where(eq(s.produtos.nome, l.produto));
    if (!p) { r.naoEncontrados.push(l.produto); continue; }

    const [{ n: temFicha }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.fichaTecnica).where(eq(s.fichaTecnica.produtoId, p.id));
    if (temFicha > 0) { r.comFichaIgnorados.push(l.produto); continue; }

    const custo = Number(l.custo).toFixed(2);
    const parceiro = parceriaPrecoDeCusto(l.origem);
    if (p.custoDireto !== custo) {
      await db.update(s.produtos).set({ custoDireto: custo, updatedAt: new Date() }).where(eq(s.produtos.id, p.id));
      await db.insert(s.produtoCustoHistorico).values({ produtoId: p.id, custo, motivo: l.origem });
      r.atualizados.push(l.produto);
    }
    r.semFicha.push(l.produto);
    if (parceiro && (p.parceiro !== parceiro || !p.vendidoAPrecoDeCusto)) {
      await db.update(s.produtos).set({ parceiro, vendidoAPrecoDeCusto: true, updatedAt: new Date() }).where(eq(s.produtos.id, p.id));
      r.parceriaAtualizada.push(`${l.produto} → ${parceiro}`);
    }
  }
  return r;
}
