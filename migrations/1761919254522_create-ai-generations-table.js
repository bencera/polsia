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
  // Create ai_generations table for tracking all AI content generations
  pgm.createTable('ai_generations', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    module_id: {
      type: 'integer',
      notNull: false,
      references: 'modules',
      onDelete: 'SET NULL',
      comment: 'Optional module that triggered this generation'
    },
    content_id: {
      type: 'integer',
      notNull: false,
      references: 'content',
      onDelete: 'SET NULL',
      comment: 'Optional content record this generation is associated with'
    },
    generation_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Type of generation: image, video, text-to-video, image-to-video, captions, audio, lipsync'
    },
    model: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Fal.ai model used: flux-pro, nano-banana, veo3-fast, kling-video, sora2-text, etc.'
    },
    prompt: {
      type: 'text',
      notNull: true,
      comment: 'Generation prompt/description'
    },
    input_params: {
      type: 'jsonb',
      notNull: false,
      comment: 'All generation parameters (width, height, duration, aspect_ratio, etc.)'
    },
    output_url: {
      type: 'varchar(500)',
      notNull: false,
      comment: 'Fal.ai result URL'
    },
    r2_url: {
      type: 'varchar(500)',
      notNull: false,
      comment: 'R2 backup URL if R2 is enabled'
    },
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
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
      comment: 'Generation status: pending, generating, completed, failed'
    },
    cost_usd: {
      type: 'numeric(10, 6)',
      notNull: false,
      comment: 'Generation cost in USD'
    },
    duration_ms: {
      type: 'integer',
      notNull: false,
      comment: 'Generation duration in milliseconds'
    },
    metadata: {
      type: 'jsonb',
      notNull: false,
      comment: 'Additional metadata: seed, dimensions, file size, etc.'
    },
    error_message: {
      type: 'text',
      notNull: false,
      comment: 'Error message if generation failed'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    completed_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'When generation completed (success or failure)'
    },
  }, { ifNotExists: true });

  // Create indexes for efficient querying
  pgm.createIndex('ai_generations', 'user_id', { ifNotExists: true });
  pgm.createIndex('ai_generations', 'module_id', { ifNotExists: true });
  pgm.createIndex('ai_generations', 'content_id', { ifNotExists: true });
  pgm.createIndex('ai_generations', 'status', { ifNotExists: true });
  pgm.createIndex('ai_generations', 'generation_type', { ifNotExists: true });
  pgm.createIndex('ai_generations', ['user_id', 'created_at'], { ifNotExists: true });
  pgm.createIndex('ai_generations', ['user_id', 'generation_type'], { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Drop the ai_generations table
  pgm.dropTable('ai_generations', { ifExists: true });
};
