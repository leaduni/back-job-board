const { pool } = require('../db');

const getAll = async () => {
  const { rows } = await pool.query('SELECT * FROM public.postulaciones ORDER BY id DESC LIMIT 100');
  return rows;
};

const create = async (postulacion) => {
  const { oferta_id, empresa_id, perfil_id, estado } = postulacion;
  const { rows } = await pool.query(
    `INSERT INTO public.postulaciones (oferta_id, empresa_id, perfil_id, estado)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [oferta_id, empresa_id, perfil_id, estado]
  );
  return rows[0];
};

const update = async (id, fields) => {
  const keys = Object.keys(fields);
  if (keys.length === 0) throw new Error('No fields provided to update');

  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);

  const { rows } = await pool.query(
    `UPDATE public.postulaciones SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return rows[0] || null;
};

module.exports = {
  getAll,
  create,
  update,
};