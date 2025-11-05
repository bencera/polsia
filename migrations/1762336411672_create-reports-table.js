/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('reports', {
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
    module_id: {
      type: 'integer',
      notNull: false,
      references: 'modules',
      onDelete: 'SET NULL',
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    report_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    report_date: {
      type: 'date',
      notNull: true,
    },
    content: {
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

  // Create indexes for common queries
  pgm.createIndex('reports', 'user_id');
  pgm.createIndex('reports', ['user_id', 'report_type']);
  pgm.createIndex('reports', ['user_id', 'report_date']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('reports');
};
