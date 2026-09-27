import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrate';

await runMigrations(fileURLToPath(new URL('./migrations', import.meta.url)));
console.log('migrations ok');
process.exit(0);
