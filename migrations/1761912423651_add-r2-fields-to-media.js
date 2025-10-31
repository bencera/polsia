/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Add R2-specific fields to media table
  pgm.addColumns('media', {
    r2_key: {
      type: 'varchar(500)',
      notNull: false,
      comment: 'R2 storage key/path'
    },
    r2_bucket: {
      type: 'varchar(255)',
      notNull: false,
      comment: 'R2 bucket name'
    },
    size: {
      type: 'bigint',
      notNull: false,
      comment: 'File size in bytes'
    },
    mime_type: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'MIME type of the file'
    },
    filename: {
      type: 'varchar(255)',
      notNull: false,
      comment: 'Original filename'
    },
    thumbnail_url: {
      type: 'varchar(500)',
      notNull: false,
      comment: 'Thumbnail URL for videos'
    }
  });

  // Create index on r2_key for faster lookups
  pgm.createIndex('media', 'r2_key', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Drop index first
  pgm.dropIndex('media', 'r2_key', { ifExists: true });

  // Remove R2-specific columns
  pgm.dropColumns('media', [
    'r2_key',
    'r2_bucket',
    'size',
    'mime_type',
    'filename',
    'thumbnail_url'
  ]);
};
