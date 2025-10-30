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
  // Create modules table
  pgm.createTable('modules', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    description: { type: 'text', notNull: false },
    type: { type: 'varchar(50)', notNull: true }, // 'ugc-marketing', 'customer-support', 'security', etc.
    status: { type: 'varchar(50)', notNull: true, default: 'active' }, // 'active', 'paused', 'disabled'
    frequency: { type: 'varchar(50)', notNull: true, default: 'auto' }, // 'auto', 'daily', 'weekly', 'manual'
    config: { type: 'jsonb', notNull: false }, // stores goal/prompt, guardrails, MCP mounts, etc.
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
  pgm.createIndex('modules', 'user_id', { ifNotExists: true });
  pgm.createIndex('modules', 'status', { ifNotExists: true });

  // Create module_executions table
  pgm.createTable('module_executions', {
    id: 'id',
    module_id: {
      type: 'integer',
      notNull: true,
      references: 'modules',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    status: { type: 'varchar(50)', notNull: true, default: 'pending' }, // 'pending', 'running', 'completed', 'failed'
    trigger_type: { type: 'varchar(50)', notNull: false }, // 'scheduled', 'manual', 'auto'
    started_at: { type: 'timestamp', notNull: false },
    completed_at: { type: 'timestamp', notNull: false },
    duration_ms: { type: 'integer', notNull: false },
    cost_usd: { type: 'numeric(10, 6)', notNull: false }, // Store cost as decimal
    metadata: { type: 'jsonb', notNull: false }, // execution details, files generated, tool calls, etc.
    error_message: { type: 'text', notNull: false },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
  pgm.createIndex('module_executions', 'module_id', { ifNotExists: true });
  pgm.createIndex('module_executions', 'user_id', { ifNotExists: true });
  pgm.createIndex('module_executions', ['module_id', 'created_at'], { ifNotExists: true });
  pgm.createIndex('module_executions', 'status', { ifNotExists: true });

  // Create module_services junction table (many-to-many)
  pgm.createTable('module_services', {
    id: 'id',
    module_id: {
      type: 'integer',
      notNull: true,
      references: 'modules',
      onDelete: 'CASCADE',
    },
    service_connection_id: {
      type: 'integer',
      notNull: true,
      references: 'service_connections',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
  pgm.createConstraint('module_services', 'module_services_unique', {
    unique: ['module_id', 'service_connection_id'],
  }, { ifNotExists: true });
  pgm.createIndex('module_services', 'module_id', { ifNotExists: true });
  pgm.createIndex('module_services', 'service_connection_id', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Drop tables in reverse order (respecting foreign key constraints)
  pgm.dropTable('module_services');
  pgm.dropTable('module_executions');
  pgm.dropTable('modules');
};
