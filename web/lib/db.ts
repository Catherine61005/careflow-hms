import { Pool, PoolClient, QueryResultRow } from "pg";

// One pool per server process (survives Next.js hot reloads in dev)
const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  // Every connection resolves unqualified names in the hms schema
  pool.on("connect", (c) => { c.query("SET search_path TO hms, public"); });
  return pool;
}

export const pool: Pool = globalForPg.pgPool ?? (globalForPg.pgPool = createPool());

/** Parameterised query - values are NEVER string-concatenated into SQL. */
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run fn inside BEGIN ... COMMIT on one connection; ROLLBACK on any error.
 * The acting username is stored in a transaction-local setting so the audit
 * trigger can record who made each change.
 */
export async function withTransaction<T>(
  actor: string,
  fn: (client: PoolClient) => Promise<T>,
  isolation: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" = "READ COMMITTED",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    await client.query("SELECT set_config('hms.app_user', $1, true)", [actor]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
