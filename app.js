// --- Imports ---
const express = require('express');
const cors = require('cors');

// --- Config Imports ---
const config = require('./config');
const corsOptions = require('./config/cors');
const { configureCloudinary } = require('./config/cloudinary');

// --- Router Import ---
const mainRouter = require('./routes');

// --- Initialization ---
const app = express();
const PORT = config.port;

// Initialize external services
configureCloudinary();

// --- Core Middleware ---
app.use(cors(corsOptions));
app.use(express.json());

// --- API Routes ---
// Mount the main router for all API endpoints
app.use('/api', mainRouter);

// --- Home Route ---
app.get('/', (req, res) => {
  res.send('API backend corriendo ✅');
});

// --- Error Handling ---
// 404 handler for routes not found
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  // Avoid sending stack trace in production
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  res.status(500).json({ error: message });
});

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});