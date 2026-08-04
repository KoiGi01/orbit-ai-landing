import postgres from 'postgres';

const PUBLIC_DATABASE_KEY = /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_).*(?:DATABASE|POSTGRES)/i;

function positiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function databaseConfig(env = process.env) {
  const exposedKey = Object.keys(env).find((key) => PUBLIC_DATABASE_KEY.test(key) && env[key]);
  if (exposedKey) throw new Error(`public_database_configuration_forbidden:${exposedKey}`);

  const url = String(env.DATABASE_URL || '').trim();
  if (!url) throw new Error('missing_database_url');
  if (!/^postgres(?:ql)?:\/\//i.test(url)) throw new Error('invalid_database_url');

  const sslMode = String(env.DATABASE_SSL || 'auto').trim().toLowerCase();
  if (!['auto', 'require', 'disable'].includes(sslMode)) throw new Error('invalid_database_ssl_mode');

  return {
    url,
    sslMode,
    max: positiveInteger(env.DATABASE_POOL_MAX, 5, 20),
  };
}

function wrapSql(sql, { canClose = false } = {}) {
  return {
    async query(text, parameters = []) {
      const rows = await sql.unsafe(text, parameters);
      return { rows: Array.from(rows), count: rows.count ?? rows.length };
    },

    async execute(text) {
      const rows = await sql.unsafe(text);
      return { rows: Array.from(rows), count: rows.count ?? rows.length };
    },

    async transaction(callback) {
      return sql.begin((transactionSql) => callback(wrapSql(transactionSql)));
    },

    async close() {
      if (canClose) await sql.end({ timeout: 5 });
    },
  };
}

export function createDatabase({ env = process.env } = {}) {
  const config = databaseConfig(env);
  const ssl = config.sslMode === 'require'
    ? 'require'
    : config.sslMode === 'disable'
      ? false
      : undefined;

  const sql = postgres(config.url, {
    max: config.max,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    ...(ssl === undefined ? {} : { ssl }),
  });

  return wrapSql(sql, { canClose: true });
}
