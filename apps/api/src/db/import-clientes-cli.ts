import { readFileSync } from 'node:fs';
import { getDb } from './client';
import { importarClientes } from './import-clientes';

const caminho = process.argv[2];
if (!caminho) { console.error('Uso: pnpm import:clientes <arquivo.csv>'); process.exit(1); }

console.log(await importarClientes(getDb(), readFileSync(caminho, 'utf-8')));
process.exit(0);
