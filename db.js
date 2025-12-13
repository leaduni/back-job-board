const { Pool } = require('pg')


function buildPgConfig() {
  const url = process.env.DATABASE_URL
  const useSSL = process.env.PGSSLMODE === 'require' || (url || '').includes('sslmode=require')
  const ssl = useSSL ? { rejectUnauthorized: false } : undefined

  // If a full DATABASE_URL is provided, prefer it
  if (url && typeof url === 'string' && url.trim().length > 0) {
    return { connectionString: url.trim(), ssl }
  }

  // Otherwise, fall back to discrete env vars
  const user = process.env.PGUSER || 'postgres'
  const password = process.env.PGPASSWORD
  const host = process.env.PGHOST || 'localhost'
  const port = Number(process.env.PGPORT || 5432)
  const database = process.env.PGDATABASE || 'postgres'

  return {
    user,
    password: password == null ? undefined : String(password),
    host,
    port,
    database,
    ssl,
  }
}

const pool = new Pool(buildPgConfig())

async function listTables() {
  const sql = `
    select table_schema, table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name
  `
  const { rows } = await pool.query(sql)
  return rows
}

async function ping() {
  const { rows } = await pool.query('select 1 as ok')
  return rows[0]
}

module.exports = { pool, listTables, ping }

