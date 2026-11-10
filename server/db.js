import fs from 'node:fs/promises';
import pg from 'pg';

// Return DATE columns as 'YYYY-MM-DD' strings instead of timezone-shifted Date objects.
pg.types.setTypeParser(1082, (v) => v);

export function createPool(config) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set.');
  const ssl =
    config.databaseSsl === 'true' ? true : config.databaseSsl === 'no-verify' ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({ connectionString: config.databaseUrl, ssl, max: 10 });
}

const MIGRATIONS = new URL('./migrations/', import.meta.url);
const MIGRATION_LOCK = 72_747_274;

/** Applies server/migrations/NNN_*.sql in order, each once, in its own transaction. */
export async function migrate(pool) {
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]); // one migrator at a time
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(new URL(file, MIGRATIONS), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Database migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}
