const postulacionesService = require('../services/postulaciones.service');

// GET /api/postulaciones
const getPostulaciones = async (req, res) => {
  try {
    const postulaciones = await postulacionesService.getAll();
    res.json(postulaciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/postulaciones
const createPostulacion = async (req, res) => {
  try {
    const nuevaPostulacion = await postulacionesService.create(req.body);
    res.status(201).json(nuevaPostulacion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/postulaciones/:id
const updatePostulacion = async (req, res) => {
  try {
    const postulacionActualizada = await postulacionesService.update(req.params.id, req.body);
    res.json(postulacionActualizada);
  } catch (err) {
    if (err.message === 'No fields provided to update') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getPostulaciones,
  createPostulacion,
  updatePostulacion,
};