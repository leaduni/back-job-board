const { v2: cloudinary } = require('cloudinary');
const config = require('./index');

function configureCloudinary() {
  if (config.cloudinary.url) {
    // If a CLOUDINARY_URL is provided, it's used automatically.
    // The SDK handles parsing it. No extra config needed.
    console.log('Cloudinary configured via URL.');
  } else {
    // Otherwise, configure manually with discrete variables.
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
    });
    console.log('Cloudinary configured via discrete environment variables.');
  }
}

module.exports = { cloudinary, configureCloudinary };
