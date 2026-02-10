const { Router } = require('express');

// --- Importar routers individuales ---
const perfilesRouter = require('./perfiles.routes');
const postulacionesRouter = require('./postulaciones.routes');
const notificacionesRouter = require('./notificaciones.routes');
const dbRouter = require('./db.routes');
const uploadRouter = require('./upload.routes');
const authRouter = require('./auth.routes');

const mainRouter = Router();

// --- Montar routers en el router principal ---
mainRouter.use('/auth', authRouter); // Rutas de autenticación
mainRouter.use('/', dbRouter); // Monta /health, /db/ping, /db/tables, etc.
mainRouter.use('/perfiles', perfilesRouter);
mainRouter.use('/postulaciones', postulacionesRouter);
mainRouter.use('/notificaciones', notificacionesRouter);
mainRouter.use('/upload', uploadRouter);

module.exports = mainRouter;
