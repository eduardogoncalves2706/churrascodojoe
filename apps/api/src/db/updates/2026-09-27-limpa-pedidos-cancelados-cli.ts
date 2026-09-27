import { getDb } from '../client';
import { limparPedidosCancelados } from './2026-09-27-limpa-pedidos-cancelados';

console.log(await limparPedidosCancelados(getDb()));
process.exit(0);
