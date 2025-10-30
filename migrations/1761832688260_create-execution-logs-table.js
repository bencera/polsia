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
  // Create execution_logs table for storing detailed step-by-step logs
  pgm.createTable('execution_logs', {
    id: 'id',
    execution_id: {
      type: 'integer',
      notNull: true,
      references: 'module_executions',
      onDelete: 'CASCADE',
    },
    timestamp: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    log_level: {
      type: 'varchar(50)',
      notNull: true,
      default: 'info',
    },
    stage: {
      type: 'varchar(100)',
      notNull: false,
    },
    message: {
      type: 'text',
      notNull: true,
    },
    metadata: {
      type: 'jsonb',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create indexes for efficient querying
  pgm.createIndex('execution_logs', 'execution_id');
  pgm.createIndex('execution_logs', 'timestamp');
  pgm.createIndex('execution_logs', ['execution_id', 'timestamp']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('execution_logs');
};
