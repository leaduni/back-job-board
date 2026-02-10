const { pool } = require('../db');

const getAll = async () => {
  const { rows } = await pool.query('SELECT * FROM public.perfiles ORDER BY id DESC LIMIT 100');
  return rows;
};

const create = async (perfil) => {
  const { user_id, user_email, nombres, apellidos, carrera, ciclo_actual } = perfil;
  const { rows } = await pool.query(
    'INSERT INTO public.perfiles (user_id, user_email, nombres, apellidos, carrera, ciclo_actual) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [user_id, user_email, nombres, apellidos, carrera, ciclo_actual]
  );
  return rows[0];
};

const update = async (id, fields) => {
  const keys = Object.keys(fields);
  if (keys.length === 0) throw new Error('No fields provided to update');

  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);

  const { rows } = await pool.query(
    `UPDATE public.perfiles SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return rows[0] || null;
};

module.exports = {
  getAll,
  create,
  update,
};