import { getDb } from '../client';
import { habilitarFracionadoCarnes } from './2026-09-27-fracionado-carnes';

console.log(await habilitarFracionadoCarnes(getDb()));
process.exit(0);
