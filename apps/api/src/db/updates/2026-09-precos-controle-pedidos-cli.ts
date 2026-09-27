import { getDb } from '../client';
import { atualizarPrecosControlePedidos } from './2026-09-precos-controle-pedidos';

console.log(await atualizarPrecosControlePedidos(getDb()));
process.exit(0);
