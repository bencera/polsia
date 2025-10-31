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
  // Create profiles table (maps to Late.dev profiles)
  pgm.createTable('profiles', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    description: { type: 'text', notNull: false },
    late_profile_id: { type: 'varchar(255)', notNull: false },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });

  // Create indexes for profiles
  pgm.createIndex('profiles', 'user_id', { ifNotExists: true });
  pgm.createIndex('profiles', 'late_profile_id', { ifNotExists: true });

  // Create social_accounts table (Late.dev connected accounts)
  pgm.createTable('social_accounts', {
    id: 'id',
    profile_id: {
      type: 'integer',
      notNull: true,
      references: 'profiles',
      onDelete: 'CASCADE',
    },
    platform: {
      type: 'varchar(50)',
      notNull: true,
      // TWITTER, INSTAGRAM, TIKTOK, LINKEDIN, FACEBOOK, YOUTUBE, THREADS, REDDIT
    },
    account_handle: { type: 'varchar(255)', notNull: true },
    late_account_id: { type: 'varchar(255)', notNull: false },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });

  // Create indexes for social_accounts
  pgm.createIndex('social_accounts', 'profile_id', { ifNotExists: true });
  pgm.createIndex('social_accounts', 'late_account_id', { ifNotExists: true });
  pgm.createIndex('social_accounts', ['profile_id', 'platform'], { ifNotExists: true });

  // Create content table (social media posts)
  pgm.createTable('content', {
    id: 'id',
    account_id: {
      type: 'integer',
      notNull: true,
      references: 'social_accounts',
      onDelete: 'CASCADE',
    },
    content_data: {
      type: 'jsonb',
      notNull: true,
      // { text, media: { url, type }, thread: [], ... }
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'DRAFT',
      // DRAFT, QUEUED, POSTED, FAILED
    },
    scheduled_for: { type: 'timestamp', notNull: false },
    posted_at: { type: 'timestamp', notNull: false },
    late_post_id: { type: 'varchar(255)', notNull: false },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });

  // Create indexes for content
  pgm.createIndex('content', 'account_id', { ifNotExists: true });
  pgm.createIndex('content', 'status', { ifNotExists: true });
  pgm.createIndex('content', 'late_post_id', { ifNotExists: true });
  pgm.createIndex('content', 'scheduled_for', { ifNotExists: true });

  // Create media table (for content media attachments)
  pgm.createTable('media', {
    id: 'id',
    content_id: {
      type: 'integer',
      notNull: true,
      references: 'content',
      onDelete: 'CASCADE',
    },
    url: { type: 'varchar(500)', notNull: true },
    type: {
      type: 'varchar(50)',
      notNull: true,
      // image, video
    },
    metadata: {
      type: 'jsonb',
      notNull: false,
      // { width, height, size, etc }
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });

  // Create index for media
  pgm.createIndex('media', 'content_id', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Drop tables in reverse order (respecting foreign key constraints)
  pgm.dropTable('media', { ifExists: true });
  pgm.dropTable('content', { ifExists: true });
  pgm.dropTable('social_accounts', { ifExists: true });
  pgm.dropTable('profiles', { ifExists: true });
};
