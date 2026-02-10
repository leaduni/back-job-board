const { Router } = require('express');
const {
  getHealth,
  pingDb,
  getTables,
  describeTable,
  seedDb,
} = require('../controllers/db.controller');

const router = Router();

// --- Rutas de Diagnóstico y Base de Datos ---

// GET /api/health
router.get('/health', getHealth);

// GET /api/db/ping
router.get('/db/ping', pingDb);

// GET /api/db/tables
router.get('/db/tables', getTables);

// GET /api/db/describe?table=...
router.get('/db/describe', describeTable);

// POST /api/seed
router.post('/seed', seedDb);

module.exports = router;
