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
  // Create document_store table for per-user persistent documents
  pgm.createTable('document_store', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    vision_md: {
      type: 'text',
      notNull: true,
      default: '',
    },
    goals_md: {
      type: 'text',
      notNull: true,
      default: '',
    },
    analytics_md: {
      type: 'text',
      notNull: true,
      default: '',
    },
    analytics_json: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    memory_md: {
      type: 'text',
      notNull: true,
      default: '',
    },
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
  });

  // Create indexes for efficient querying
  pgm.createIndex('document_store', 'user_id');

  // Create trigger to auto-update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_document_store_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER document_store_updated_at
    BEFORE UPDATE ON document_store
    FOR EACH ROW
    EXECUTE FUNCTION update_document_store_updated_at();
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS document_store_updated_at ON document_store;');
  pgm.sql('DROP FUNCTION IF EXISTS update_document_store_updated_at;');
  pgm.dropTable('document_store');
};
