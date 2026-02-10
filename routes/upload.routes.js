const { Router } = require('express');
const multer = require('multer');
const { uploadCv } = require('../controllers/upload.controller');

const router = Router();

// Configure Multer memory storage for multipart uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

// --- Ruta para Uploads ---

// POST /api/upload/cv
router.post('/cv', upload.single('file'), uploadCv);

module.exports = router;
