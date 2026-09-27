import { readFileSync } from 'node:fs';
import { getDb } from './client';
import { importarPedidos } from './import-pedidos';

const caminho = process.argv[2];
if (!caminho) { console.error('Uso: pnpm import:pedidos <arquivo.csv>'); process.exit(1); }

const r = await importarPedidos(getDb(), readFileSync(caminho, 'utf-8'));
console.log(`Criados: ${r.criados} · Já existiam: ${r.jaExistiam} · Sem cliente (venda interna): ${r.semClientePorFlag}`);
if (r.itensNaoResolvidos.length) console.log(`⚠ Itens não resolvidos (${r.itensNaoResolvidos.length}):`, r.itensNaoResolvidos);
if (r.erros.length) console.log(`❌ Erros (${r.erros.length}):`, r.erros);
process.exit(0);
