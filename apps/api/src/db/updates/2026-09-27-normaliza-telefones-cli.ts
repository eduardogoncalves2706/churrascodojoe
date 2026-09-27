import { getDb } from '../client';
import { normalizarTelefones } from './2026-09-27-normaliza-telefones';

console.log(await normalizarTelefones(getDb()));
process.exit(0);
