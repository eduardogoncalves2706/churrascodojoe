import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let db: Db | undefined;

/**
 * Local: DATABASE_URL. AWS: RDS Postgres em VPC isolada; credenciais lidas do Secrets Manager
 * (DB_SECRET_ARN) sob demanda e mantidas em cache. Trocar de banco = mudar só este arquivo.
 */
function createPool(): pg.Pool {
  if (process.env.DB_SECRET_ARN) {
    const sm = new SecretsManagerClient({});
    let cred: Promise<{ password: string }> | undefined;
    const secret = () => (cred ??= sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })).then((r) => JSON.parse(r.SecretString!)));
    const pool = new pg.Pool({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432), database: process.env.DB_NAME ?? 'joe', max: 3,
      user: process.env.DB_USER ?? 'joe_admin', password: async () => (await secret()).password,
      ssl: { rejectUnauthorized: false }, // tráfego dentro de VPC isolada; TLS obrigatório no servidor
      idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000,
    });
    return pool;
  }
  return new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://joe:joe@localhost:5433/joe' });
}

export function getDb(): Db {
  db ??= drizzle(createPool(), { schema });
  return db;
}
export { schema };
