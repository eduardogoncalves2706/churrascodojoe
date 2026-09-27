import { getDb } from '../client';
import { corrigirPrecos27_09 } from './2026-09-27-correcoes';

console.log(await corrigirPrecos27_09(getDb()));
process.exit(0);
