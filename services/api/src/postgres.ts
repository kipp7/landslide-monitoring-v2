import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { AppConfig } from "./config";

export type PgPool = Pool;

export function createPgPool(config: AppConfig): PgPool | null {
  if (!config.postgresUrl && !config.postgresHost) return null;
  return new Pool({
    ...(config.postgresUrl
      ? { connectionString: config.postgresUrl }
      : {
          host: config.postgresHost,
          port: config.postgresPort,
          user: config.postgresUser,
          password: config.postgresPassword,
          database: config.postgresDatabase
        }),
    max: config.postgresPoolMax,
    idleTimeoutMillis: 30_000
  });
}

export async function withPgClient<T>(pool: PgPool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const res = await client.query<T>(sql, params);
  return res.rows[0] ?? null;
}
