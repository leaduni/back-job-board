require('dotenv').config();

const config = {
  port: process.env.PORT || 3001,
  databaseUrl: process.env.DATABASE_URL,
  useSSL: process.env.PGSSLMODE === 'require' || (process.env.DATABASE_URL || '').includes('sslmode=require'),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    url: process.env.CLOUDINARY_URL,
  },
  cors: {
    whitelist: process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : [],
  }
};

// --- Validation ---
if (!config.databaseUrl) {
  throw new Error('FATAL ERROR: DATABASE_URL is not defined.');
}

if (!config.cloudinary.url && (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret)) {
  throw new Error('FATAL ERROR: Cloudinary configuration is incomplete. Define CLOUDINARY_URL or the discrete CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET variables.');
}

module.exports = config;
