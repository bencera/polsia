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
  // Create routines table
  // Routines are scheduled tasks that belong to agents
  // Unlike modules, routines don't have their own session_id - they use the agent's session
  pgm.createTable('routines', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    agent_id: {
      type: 'integer',
      notNull: true,
      references: 'agents',
      onDelete: 'CASCADE',
      comment: 'Every routine MUST belong to an agent'
    },
    name: { type: 'varchar(255)', notNull: true },
    description: { type: 'text', notNull: false },
    type: { type: 'varchar(50)', notNull: true }, // 'check_sentry', 'analyze_metrics', etc.
    status: { type: 'varchar(50)', notNull: true, default: 'active' }, // 'active', 'paused', 'disabled'
    frequency: { type: 'varchar(50)', notNull: true, default: 'manual' }, // 'auto', 'daily', 'weekly', 'manual'
    config: { type: 'jsonb', notNull: false }, // stores goal/prompt, guardrails, etc.
    last_run_at: { type: 'timestamp', notNull: false },
    next_run_at: { type: 'timestamp', notNull: false },
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

  // Create indexes for efficient querying
  pgm.createIndex('routines', 'user_id', { ifNotExists: true });
  pgm.createIndex('routines', 'agent_id', { ifNotExists: true });
  pgm.createIndex('routines', 'status', { ifNotExists: true });
  pgm.createIndex('routines', ['status', 'next_run_at'], {
    ifNotExists: true,
    comment: 'Optimized for scheduler queries'
  });

  // Create routine_services junction table (many-to-many)
  // Routines can use OAuth service connections just like modules
  pgm.createTable('routine_services', {
    id: 'id',
    routine_id: {
      type: 'integer',
      notNull: true,
      references: 'routines',
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

  pgm.createConstraint('routine_services', 'routine_services_unique', {
    unique: ['routine_id', 'service_connection_id'],
  }, { ifNotExists: true });
  pgm.createIndex('routine_services', 'routine_id', { ifNotExists: true });
  pgm.createIndex('routine_services', 'service_connection_id', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('routine_services');
  pgm.dropTable('routines');
};
