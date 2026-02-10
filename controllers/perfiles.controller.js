const perfilesService = require('../services/perfiles.service');

// GET /api/perfiles
const getPerfiles = async (req, res) => {
  try {
    const perfiles = await perfilesService.getAll();
    res.json(perfiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/perfiles
const createPerfil = async (req, res) => {
  try {
    const nuevoPerfil = await perfilesService.create(req.body);
    res.status(201).json(nuevoPerfil);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/perfiles/:id
const updatePerfil = async (req, res) => {
  try {
    const perfilActualizado = await perfilesService.update(req.params.id, req.body);
    res.json(perfilActualizado);
  } catch (err) {
    if (err.message === 'No fields provided to update') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getPerfiles,
  createPerfil,
  updatePerfil,
};