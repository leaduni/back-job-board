const notificacionesService = require('../services/notificaciones.service');

// GET /api/notificaciones
const getNotificaciones = async (req, res) => {
  try {
    const notificaciones = await notificacionesService.getAll();
    res.json(notificaciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/notificaciones
const createNotificacion = async (req, res) => {
  try {
    const nuevaNotificacion = await notificacionesService.create(req.body);
    res.status(201).json(nuevaNotificacion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/notificaciones/:id
const updateNotificacion = async (req, res) => {
  try {
    const notificacionActualizada = await notificacionesService.update(req.params.id, req.body);
    res.json(notificacionActualizada);
  } catch (err) {
    if (err.message === 'No fields provided to update') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getNotificaciones,
  createNotificacion,
  updateNotificacion,
};