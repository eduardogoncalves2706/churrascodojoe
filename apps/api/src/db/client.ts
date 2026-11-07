import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

// O driver `pg` já decodifica colunas json/jsonb sozinho (JSON.parse), e o Drizzle decodifica de novo
// por cima — pra um valor que já virou string (ex.: um número guardado como texto), o segundo parse
// pode transformar em number por acidente (ex.: "5551998867190" → 5551998867190). Desliga a decodificação
// do `pg` (deixa como texto cru) pra só o Drizzle decodificar, uma vez.
pg.types.setTypeParser(pg.types.builtins.JSON, (v) => v);
pg.types.setTypeParser(pg.types.builtins.JSONB, (v) => v);

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let db: Db | undefined;

/**
 * Local: DATABASE_URL. AWS: RDS Postgres em VPC isolada; senha vem pronta em DB_PASSWORD, resolvida
 * do Secrets Manager em tempo de *deploy* (referência dinâmica do CloudFormation) — a Lambda nunca
 * chama a API do Secrets Manager em runtime, o que elimina o VPC Endpoint dele (custo fixo por hora).
 * Trocar de banco = mudar só este arquivo.
 */
function createPool(): pg.Pool {
  if (process.env.DB_PASSWORD) {
    return new pg.Pool({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432), database: process.env.DB_NAME ?? 'joe', max: 3,
      user: process.env.DB_USER ?? 'joe_admin', password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false }, // tráfego dentro de VPC isolada; TLS obrigatório no servidor
      idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000,
    });
  }
  return new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://joe:joe@localhost:5433/joe' });
}

export function getDb(): Db {
  db ??= drizzle(createPool(), { schema });
  return db;
}
export { schema };
