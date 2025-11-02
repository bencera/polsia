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
  // Create brain_decisions table for tracking Brain orchestrator decisions
  pgm.createTable('brain_decisions', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    execution_id: {
      type: 'integer',
      notNull: false,
      references: 'module_executions',
      onDelete: 'SET NULL',
    },
    decision_reasoning: {
      type: 'text',
      notNull: true,
    },
    action_description: {
      type: 'text',
      notNull: true,
    },
    module_id: {
      type: 'integer',
      notNull: false,
      references: 'modules',
      onDelete: 'SET NULL',
    },
    priority: {
      type: 'varchar(20)',
      notNull: false,
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
  pgm.createIndex('brain_decisions', 'user_id');
  pgm.createIndex('brain_decisions', ['user_id', 'created_at']);
  pgm.createIndex('brain_decisions', 'execution_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('brain_decisions');
};
