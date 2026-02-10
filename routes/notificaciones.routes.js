const { Router } = require('express');
const {
  getNotificaciones,
  createNotificacion,
  updateNotificacion,
} = require('../controllers/notificaciones.controller');

const router = Router();

// --- Rutas para Notificaciones ---

// GET /api/notificaciones
router.get('/', getNotificaciones);

// POST /api/notificaciones
router.post('/', createNotificacion);

// PATCH /api/notificaciones/:id
router.patch('/:id', updateNotificacion);

module.exports = router;
