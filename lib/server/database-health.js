export async function inspectDatabaseHealth(database) {
  const result = await database.query(`
    select
      current_database() as database_name,
      to_regclass('app.schema_migrations') is not null as schema_ready
  `);
  const row = result.rows[0] || {};

  return {
    ok: true,
    database: row.database_name ? 'connected' : 'unknown',
    schema: row.schema_ready ? 'ready' : 'missing',
  };
}
