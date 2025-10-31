const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Check if R2 is enabled
const isR2Enabled = process.env.USE_R2 === 'true';

if (isR2Enabled) {
  // Validate essential environment variables
  if (!process.env.R2_ENDPOINT) {
    throw new Error("Missing R2_ENDPOINT environment variable");
  }
  if (!process.env.R2_ACCESS_KEY_ID) {
    throw new Error("Missing R2_ACCESS_KEY_ID environment variable");
  }
  if (!process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2_SECRET_ACCESS_KEY environment variable");
  }
  if (!process.env.R2_BUCKET_NAME) {
    throw new Error("Missing R2_BUCKET_NAME environment variable");
  }
  if (!process.env.R2_PUBLIC_URL_BASE && !process.env.R2_PUBLIC_URL_BASE_DEV) {
    console.warn("Missing R2_PUBLIC_URL_BASE or R2_PUBLIC_URL_BASE_DEV environment variable. Public URLs might be incorrect.");
  }
}

const bucketName = process.env.R2_BUCKET_NAME;
const publicUrlBase = process.env.R2_PUBLIC_URL_BASE_DEV || process.env.R2_PUBLIC_URL_BASE || `https://${bucketName}.r2.dev`;

// Initialize S3 client only if R2 is enabled
const s3 = isR2Enabled ? new S3Client({
  region: "auto", // required by SDK but ignored by R2
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null;

/**
 * Uploads a media file (image or video) to Cloudflare R2.
 * @param {Buffer} buffer - The file buffer to upload.
 * @param {string} filename - The original filename.
 * @param {string} mimeType - The MIME type of the file.
 * @param {Object} metadata - Additional metadata.
 * @returns {Promise<Object>} - Object containing mediaId, url, and key.
 */
async function uploadMediaToR2(buffer, filename, mimeType, metadata = {}) {
  if (!isR2Enabled) {
    console.warn('R2 is not enabled. Returning mock URL.');
    return {
      mediaId: uuidv4(),
      url: `https://placeholder.com/${filename}`,
      key: `mock/${filename}`,
      bucket: 'mock-bucket',
      type: mimeType.startsWith('video/') ? 'video' : 'image',
      size: buffer.length,
      mimeType,
      filename
    };
  }

  const mediaId = uuidv4();
  const fileExtension = filename.split('.').pop().toLowerCase();

  // Determine folder based on MIME type
  const folder = mimeType.startsWith('video/') ? 'videos' :
                 mimeType.startsWith('image/') ? 'images' : 'media';

  // Determine type for database (singular)
  const mediaType = mimeType.startsWith('video/') ? 'video' :
                    mimeType.startsWith('image/') ? 'image' : 'media';

  const objectKey = `${folder}/${mediaId}.${fileExtension}`;

  console.info(`Attempting to upload ${folder} to R2 bucket ${bucketName} with key ${objectKey}`);

  try {
    // Build metadata object with all values as strings
    const s3Metadata = {
      original_filename: filename || '',
      uploaded_at: new Date().toISOString(),
      user_id: metadata.userId ? String(metadata.userId) : '',
      account_id: metadata.accountId ? String(metadata.accountId) : '',
      content_id: metadata.contentId ? String(metadata.contentId) : ''
    };

    // Add any additional metadata, ensuring all values are strings
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null && !['userId', 'accountId', 'contentId'].includes(key)) {
        const sanitizedKey = key.replace(/-/g, '_');
        s3Metadata[sanitizedKey] = String(value);
      }
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
        Metadata: s3Metadata
      })
    );

    const publicUrl = `${publicUrlBase}/${objectKey}`;
    console.info(`Successfully uploaded media to R2. Public URL: ${publicUrl}`);

    return {
      mediaId,
      url: publicUrl,
      key: objectKey,
      bucket: bucketName,
      type: mediaType,
      size: buffer.length,
      mimeType,
      filename
    };

  } catch (error) {
    console.error(`Failed to upload media to R2:`, error);
    throw error;
  }
}

/**
 * Uploads a thumbnail for a media file to R2.
 * @param {Buffer} buffer - The thumbnail image buffer.
 * @param {string} mediaId - The associated media ID.
 * @param {string} mimeType - The MIME type of the thumbnail.
 * @returns {Promise<Object>} - Object containing thumbnail URL and key.
 */
async function uploadThumbnailToR2(buffer, mediaId, mimeType = 'image/jpeg') {
  if (!isR2Enabled) {
    console.warn('R2 is not enabled. Returning mock thumbnail URL.');
    return {
      url: `https://placeholder.com/thumbnails/${mediaId}.jpg`,
      key: `mock/thumbnails/${mediaId}.jpg`
    };
  }

  const fileExtension = mimeType.split('/')[1] || 'jpg';
  const objectKey = `thumbnails/${mediaId}.${fileExtension}`;

  console.info(`Attempting to upload thumbnail to R2 bucket ${bucketName} with key ${objectKey}`);

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          media_id: mediaId,
          uploaded_at: new Date().toISOString()
        }
      })
    );

    const publicUrl = `${publicUrlBase}/${objectKey}`;
    console.info(`Successfully uploaded thumbnail to R2. Public URL: ${publicUrl}`);

    return {
      url: publicUrl,
      key: objectKey
    };

  } catch (error) {
    console.error(`Failed to upload thumbnail to R2:`, error);
    throw error;
  }
}

/**
 * Validates if a file type is allowed for upload.
 * @param {string} mimeType - The MIME type to validate.
 * @returns {boolean} - True if allowed, false otherwise.
 */
function isAllowedFileType(mimeType) {
  const allowedTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    // Videos
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
  ];

  return allowedTypes.includes(mimeType);
}

/**
 * Gets the maximum file size based on MIME type.
 * @param {string} mimeType - The MIME type.
 * @returns {number} - Max size in bytes.
 */
function getMaxFileSize(mimeType) {
  if (mimeType.startsWith('video/')) {
    return 1024 * 1024 * 1024; // 1GB for videos
  }
  return 20 * 1024 * 1024; // 20MB for images
}

module.exports = {
  uploadMediaToR2,
  uploadThumbnailToR2,
  isAllowedFileType,
  getMaxFileSize,
  isR2Enabled
};
