const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.useSSL ? { rejectUnauthorized: false } : undefined,
});

async function listTables() {
  const sql = `
    select table_schema, table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

async function ping() {
  const { rows } = await pool.query('select 1 as ok');
  return rows[0];
}

module.exports = { pool, listTables, ping };

