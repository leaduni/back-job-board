const { Router } = require('express');
const {
  getPostulaciones,
  createPostulacion,
  updatePostulacion,
} = require('../controllers/postulaciones.controller');

const router = Router();

// --- Rutas para Postulaciones ---

// GET /api/postulaciones
router.get('/', getPostulaciones);

// POST /api/postulaciones
router.post('/', createPostulacion);

// PATCH /api/postulaciones/:id
router.patch('/:id', updatePostulacion);

module.exports = router;
