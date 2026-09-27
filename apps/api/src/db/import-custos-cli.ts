import { readFileSync } from 'node:fs';
import { getDb } from './client';
import { importarCustos } from './import-custos';

const caminho = process.argv[2];
if (!caminho) { console.error('Uso: pnpm import:custos <arquivo.csv>'); process.exit(1); }

const r = await importarCustos(getDb(), readFileSync(caminho, 'utf-8'));
console.log(`Atualizados (${r.atualizados.length}):`, r.atualizados);
console.log(`Vínculo com parceiro/preço de custo (${r.parceriaAtualizada.length}):`, r.parceriaAtualizada);
console.log(`Ignorados, já têm ficha técnica (${r.comFichaIgnorados.length}):`, r.comFichaIgnorados);
if (r.naoEncontrados.length) console.log(`⚠ Não encontrados no cardápio (${r.naoEncontrados.length}):`, r.naoEncontrados);
process.exit(0);
