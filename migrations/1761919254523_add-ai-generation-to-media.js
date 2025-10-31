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
  // Add ai_generation_id to media table to link media with AI generations
  pgm.addColumns('media', {
    ai_generation_id: {
      type: 'integer',
      notNull: false,
      references: 'ai_generations',
      onDelete: 'SET NULL',
      comment: 'Link to AI generation if this media was AI-generated'
    }
  });

  // Create index for faster lookups
  pgm.createIndex('media', 'ai_generation_id', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Drop index first
  pgm.dropIndex('media', 'ai_generation_id', { ifExists: true });

  // Remove ai_generation_id column
  pgm.dropColumns('media', ['ai_generation_id']);
};
