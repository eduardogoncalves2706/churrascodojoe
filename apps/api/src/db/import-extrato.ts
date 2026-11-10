import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { schema as s } from './client';

export interface LinhaExtrato { fitid: string; data: string; valor: number; descricao: string; tipo: 'entrada' | 'saida' }

function campo(bloco: string, tag: string): string | undefined {
  // Tolerante a OFX "SGML" (tag sem fechamento, ex.: <FITID>123) e a OFX 2.x (XML de verdade).
  return new RegExp(`<${tag}>([^<\r\n]*)`, 'i').exec(bloco)?.[1]?.trim();
}

function dataOfx(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 8); // YYYYMMDD[hhmmss...] → só a data
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Extrai as transações de um extrato OFX (formato padrão de bancos/fintechs brasileiros, incl. Stone). */
export function parseOfx(texto: string): LinhaExtrato[] {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  return blocos
    .map((bloco): LinhaExtrato | null => {
      const dtposted = campo(bloco, 'DTPOSTED');
      const trnamt = campo(bloco, 'TRNAMT');
      if (!dtposted || !trnamt) return null;
      const valor = Number(trnamt.replace(',', '.'));
      if (Number.isNaN(valor)) return null;
      const descricao = campo(bloco, 'MEMO') || campo(bloco, 'NAME') || '(sem descrição)';
      // Nem todo exportador manda FITID; sem ele, monta uma chave só com o que a transação tem.
      const fitid = campo(bloco, 'FITID') || `${dtposted}-${trnamt}-${descricao}`.slice(0, 180);
      return { fitid, data: dataOfx(dtposted), valor, descricao, tipo: valor >= 0 ? 'entrada' : 'saida' };
    })
    .filter((l): l is LinhaExtrato => l !== null);
}

export interface ResultadoImportExtrato { total: number; importados: number; duplicados: number }

/**
 * Importa um extrato OFX (ex.: exportado do app da Stone) pra lançamentos financeiros — pra conciliar
 * gasto/recebimento em vez de lançar tudo na mão. Cada linha entra com a categoria placeholder
 * "A classificar" (não conta no DRE) até o usuário escolher a categoria certa na tela do Financeiro.
 * Idempotente: reimportar o mesmo arquivo não duplica (extrato_ref é único).
 */
export async function importarExtrato(db: Db, ofxTexto: string, contaId: string, usuario: string): Promise<ResultadoImportExtrato> {
  const linhas = parseOfx(ofxTexto);
  const [catEntrada] = await db.select().from(s.categoriasFinanceiras).where(eq(s.categoriasFinanceiras.nome, 'A classificar (entrada)'));
  const [catSaida] = await db.select().from(s.categoriasFinanceiras).where(eq(s.categoriasFinanceiras.nome, 'A classificar (saída)'));
  if (!catEntrada || !catSaida) throw new Error('Categorias "A classificar" não encontradas — rode o seed antes de importar.');

  let importados = 0;
  for (const l of linhas) {
    const inserted = await db.insert(s.lancamentos).values({
      tipo: l.tipo, categoriaId: l.tipo === 'entrada' ? catEntrada.id : catSaida.id, contaId,
      descricao: l.descricao, valor: Math.abs(l.valor).toFixed(2),
      dataCompetencia: l.data, dataVencimento: l.data, dataPagamento: l.data, status: 'realizado',
      extratoRef: l.fitid, createdBy: usuario,
    }).onConflictDoNothing({ target: s.lancamentos.extratoRef }).returning({ id: s.lancamentos.id });
    if (inserted.length) importados++;
  }
  return { total: linhas.length, importados, duplicados: linhas.length - importados };
}
