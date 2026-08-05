import postgres from 'postgres';

const PUBLIC_DATABASE_KEY = /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_).*(?:DATABASE|POSTGRES)/i;
const PUBLIC_SUPABASE_SECRET_KEY = /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_).*SUPABASE.*(?:PASSWORD|SECRET|SERVICE_ROLE)/i;

function positiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function supabaseDatabaseUrl(env) {
  const projectRef = String(env.SUPABASE_PROJECT_REF || '').trim();
  const password = String(env.SUPABASE_DB_PASSWORD || '').trim();
  const host = String(env.SUPABASE_DB_POOLER_HOST || '').trim().toLowerCase();
  const port = String(env.SUPABASE_DB_POOLER_PORT || '5432').trim();
  const configured = projectRef || password || host;

  if (!configured) return '';
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('invalid_supabase_project_ref');
  if (!password) throw new Error('missing_supabase_db_password');
  if (!/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) {
    throw new Error('invalid_supabase_pooler_host');
  }
  if (!['5432', '6543'].includes(port)) throw new Error('invalid_supabase_pooler_port');

  return `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
}

export function databaseConfig(env = process.env) {
  const exposedKey = Object.keys(env).find(
    (key) => (PUBLIC_DATABASE_KEY.test(key) || PUBLIC_SUPABASE_SECRET_KEY.test(key)) && env[key],
  );
  if (exposedKey) throw new Error(`public_database_configuration_forbidden:${exposedKey}`);

  // Vercel's native Supabase integration exposes the pooled connection as
  // POSTGRES_URL. Keep DATABASE_URL as the explicit override used outside
  // Vercel, then fall back to the locally assembled Supabase pooler URL.
  const url = String(env.DATABASE_URL || env.POSTGRES_URL || '').trim()
    || supabaseDatabaseUrl(env);
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
