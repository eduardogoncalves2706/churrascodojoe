import { encontrarOuCriarCliente } from '../services/clientes';
import type { Db } from './client';

interface Linha { nome: string; telefone?: string }

function parseCsv(texto: string): Linha[] {
  return texto.trim().split('\n').slice(1) // pula cabeçalho "nome,telefone"
    .map((l) => {
      const [nome, telefone] = l.split(',');
      return { nome: nome?.trim() ?? '', telefone: telefone?.trim() || undefined };
    })
    .filter((l) => l.nome);
}

/** Import de clientes (colunas nome,telefone) — idempotente via encontrarOuCriarCliente. */
export async function importarClientes(db: Db, csvTexto: string) {
  const linhas = parseCsv(csvTexto);
  let criados = 0; let existentes = 0;
  for (const l of linhas) {
    const { novo } = await encontrarOuCriarCliente(db, l);
    if (novo) criados++; else existentes++;
  }
  return { total: linhas.length, criados, existentes };
}
