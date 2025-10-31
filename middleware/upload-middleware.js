const multer = require('multer');
const { isAllowedFileType, getMaxFileSize } = require('../services/r2-media-service');

// Use memory storage for R2 upload (files are stored in memory as buffers)
const storage = multer.memoryStorage();

// File filter to validate MIME types
const fileFilter = (req, file, cb) => {
  if (isAllowedFileType(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: images (jpeg, png, gif, webp) and videos (mp4, mpeg, quicktime, avi, webm).`), false);
  }
};

// Custom file size limit based on MIME type
const limits = {
  fileSize: 1024 * 1024 * 1024, // 1GB max (will be checked per-file in the filter)
  files: 10 // Max 10 files per request
};

// Create multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits
});

/**
 * Middleware to validate individual file sizes based on their MIME type
 */
function validateFileSizes(req, res, next) {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    for (const file of req.files) {
      const maxSize = getMaxFileSize(file.mimetype);
      if (file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
        return res.status(413).json({
          success: false,
          message: `File ${file.originalname} exceeds maximum size of ${maxSizeMB}MB for ${file.mimetype.split('/')[0]}s`,
          filename: file.originalname,
          size: file.size,
          maxSize
        });
      }
    }
    next();
  } catch (error) {
    console.error('Error validating file sizes:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating file sizes',
      error: error.message
    });
  }
}

/**
 * Middleware for uploading multiple files with the field name "media"
 */
const uploadMedia = upload.array('media', 10);

/**
 * Combined middleware that handles upload and validates file sizes
 */
function handleMediaUpload(req, res, next) {
  uploadMedia(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Handle Multer-specific errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: 'File too large',
          error: err.message
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 10 files allowed per request.',
          error: err.message
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message
      });
    } else if (err) {
      // Handle other errors (e.g., file type validation)
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
        error: err.message
      });
    }

    // Validate file sizes
    validateFileSizes(req, res, next);
  });
}

module.exports = {
  upload,
  uploadMedia,
  handleMediaUpload,
  validateFileSizes
};
