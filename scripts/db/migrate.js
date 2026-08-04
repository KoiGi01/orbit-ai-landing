import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabase, databaseConfig } from '../../lib/server/database.js';
import { loadLocalEnvironment } from './load-local-env.js';

const ROOT = resolve(import.meta.dirname, '../..');
const MIGRATIONS_DIRECTORY = resolve(ROOT, 'db/migrations');

loadLocalEnvironment(ROOT);

const migrationEnvironment = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL,
  DATABASE_POOL_MAX: '1',
};
const migrationConfig = databaseConfig(migrationEnvironment);
const migrationUrl = new URL(migrationConfig.url);
if (migrationUrl.hostname.endsWith('.pooler.supabase.com') && migrationUrl.port === '6543') {
  throw new Error('supabase_migrations_require_session_pooler');
}
const database = createDatabase({ env: migrationEnvironment });

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function migrationFiles() {
  const names = await readdir(MIGRATIONS_DIRECTORY);
  return names.filter((name) => name.endsWith('.sql')).sort();
}

try {
  await database.execute(`
    create schema if not exists app;
    create table if not exists app.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      constraint schema_migrations_checksum check (checksum ~ '^[a-f0-9]{64}$')
    );
    revoke all on app.schema_migrations from public;
  `);
  await database.query("select pg_advisory_lock(hashtext('autivex_schema_migrations'))");

  for (const name of await migrationFiles()) {
    const contents = await readFile(resolve(MIGRATIONS_DIRECTORY, name), 'utf8');
    const digest = checksum(contents);
    const applied = await database.query(
      'select checksum from app.schema_migrations where name = $1 limit 1',
      [name],
    );

    if (applied.rows[0]) {
      if (applied.rows[0].checksum !== digest) throw new Error(`migration_checksum_mismatch:${name}`);
      console.info(`skip ${name}`);
      continue;
    }

    await database.execute(contents);
    await database.query(
      'insert into app.schema_migrations (name, checksum) values ($1, $2)',
      [name, digest],
    );
    console.info(`applied ${name}`);
  }
} finally {
  try {
    await database.query("select pg_advisory_unlock(hashtext('autivex_schema_migrations'))");
  } catch {
    // The connection may have failed before the lock was acquired.
  }
  await database.close();
}
