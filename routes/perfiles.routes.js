const { Router } = require('express');
const { getPerfiles, createPerfil, updatePerfil } = require('../controllers/perfiles.controller');

const router = Router();

// --- Rutas para Perfiles ---

// GET /api/perfiles
router.get('/', getPerfiles);

// POST /api/perfiles
router.post('/', createPerfil);

// PATCH /api/perfiles/:id
router.patch('/:id', updatePerfil);

module.exports = router;
