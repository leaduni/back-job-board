const uploadService = require('../services/upload.service');

const uploadCv = async (req, res) => {
  try {
    const { fileUrl, publicId } = req.body || {};
    const result = await uploadService.uploadCv(req.file, fileUrl, publicId);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    if (err.message === 'Provide multipart field "file" or body.fileUrl') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
};

module.exports = {
  uploadCv,
};