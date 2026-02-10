const { cloudinary } = require('../config/cloudinary');

const uploadCv = async (file, fileUrl, publicId) => {
  const folder = 'CVs LEAD';

  if (file) {
    // Handle multipart form upload
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'auto' },
        (error, uploadResult) => {
          if (error) return reject(error);
          resolve(uploadResult);
        }
      );
      stream.end(file.buffer);
    });
  }

  // Handle URL or data URI upload
  if (!fileUrl) {
    throw new Error('Provide multipart field "file" or body.fileUrl');
  }

  return cloudinary.uploader.upload(fileUrl, {
    folder,
    public_id: publicId || undefined,
    resource_type: 'auto',
  });
};

module.exports = {
  uploadCv,
};